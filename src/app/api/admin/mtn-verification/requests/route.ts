import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { recordAudit } from "@/lib/audit";
import { syncAcceptedNumberStatus } from "@/lib/mtn-verification";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));
    const status = searchParams.get("status");
    const q = searchParams.get("q")?.trim();
    const batchId = searchParams.get("batchId");
    const userId = searchParams.get("userId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where: Record<string, unknown> = {};

    if (status && status !== "ALL") {
      where.status = status;
    }
    if (batchId) {
      where.batchId = batchId;
    }
    if (userId) {
      where.userId = userId;
    }
    if (q) {
      where.OR = [
        { normalizedNumber: { contains: q } },
        { user: { name: { contains: q, mode: "insensitive" } } },
        { user: { email: { contains: q, mode: "insensitive" } } },
      ];
    }
    if (from || to) {
      const dateFilter: Record<string, Date> = {};
      if (from) dateFilter.gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        dateFilter.lte = toDate;
      }
      where.createdAt = dateFilter;
    }

    // Export mode: return all numbers as plain text (no pagination)
    // Also auto-creates a verification batch so requests move to PROCESSING.
    if (searchParams.get("export") === "true") {
      const admin = await requireAdmin();

      const allItems = await prisma.mtnVerificationRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        select: { id: true, number: true, status: true },
      });

      if (allItems.length === 0) {
        return new NextResponse("", {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Disposition": `attachment; filename="verification-requests-${Date.now()}.txt"`,
          },
        });
      }

      // Only batch requests that aren't already in a batch (SUBMITTED status)
      const batchableIds = allItems
        .filter((r) => r.status === "SUBMITTED")
        .map((r) => r.id);

      let batchRef = "";
      if (batchableIds.length > 0) {
        const { createVerificationBatch } = await import("@/lib/mtn-verification");
        const batch = await createVerificationBatch({
          requestIds: batchableIds,
          actorLabel: admin.email,
        });
        batchRef = batch.batchReference;
      }

      const txt = allItems.map((r) => r.number).join("\n");
      const filename = batchRef
        ? `verification-requests-${batchRef}-${Date.now()}.txt`
        : `verification-requests-${Date.now()}.txt`;

      return new NextResponse(txt, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    const [items, total] = await Promise.all([
      prisma.mtnVerificationRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: {
            select: { id: true, name: true, email: true, phone: true },
          },
          batch: {
            select: { id: true, batchReference: true, status: true },
          },
        },
      }),
      prisma.mtnVerificationRequest.count({ where }),
    ]);

    return NextResponse.json({
      data: items,
      total,
      page,
      pageSize,
      pages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const { id, ids, action, rejectionReason } = body;

    if (!action) {
      return apiError(400, "Action is required");
    }

    // ── Bulk mode ──────────────────────────────────────────────────────────
    if (Array.isArray(ids) && ids.length > 0) {
      const records = await prisma.mtnVerificationRequest.findMany({
        where: { id: { in: ids } },
      });
      if (records.length === 0) {
        return apiError(404, "No matching verification requests found");
      }

      const now = new Date();

      if (action === "VERIFY") {
        await prisma.$transaction(async (tx) => {
          await tx.mtnVerificationRequest.updateMany({
            where: { id: { in: ids } },
            data: { status: "VERIFIED", verifiedAt: now },
          });

          for (const rec of records) {
            await tx.acceptedMtnNumber.upsert({
              where: { normalizedNumber: rec.normalizedNumber },
              create: {
                number: rec.normalizedNumber,
                normalizedNumber: rec.normalizedNumber,
                source: "SINGLE_REQUEST_VERIFICATION",
                verifiedBy: admin.email,
                verifiedAt: now,
              },
              update: { verifiedAt: now, verifiedBy: admin.email },
            });
            await tx.blockedMtnNumber.updateMany({
              where: { normalizedNumber: rec.normalizedNumber },
              data: { status: "ACCEPTED" },
            });
          }
        });

        await recordAudit({
          actorLabel: admin.email,
          action: "ADMIN_BULK_VERIFIED_MTN_REQUESTS",
          target: `requests:${ids.join(",")}`,
          newValue: JSON.stringify({ count: records.length }),
        });

        return NextResponse.json({ success: true, status: "VERIFIED", count: records.length });
      } else if (action === "REJECT") {
        const reason = rejectionReason || "Verification rejected by admin";
        await prisma.$transaction(async (tx) => {
          await tx.mtnVerificationRequest.updateMany({
            where: { id: { in: ids } },
            data: { status: "REJECTED", rejectedAt: now, rejectionReason: reason },
          });

          for (const rec of records) {
            await tx.blockedMtnNumber.updateMany({
              where: { normalizedNumber: rec.normalizedNumber },
              data: { status: "REJECTED" },
            });
          }
        });

        await recordAudit({
          actorLabel: admin.email,
          action: "ADMIN_BULK_REJECTED_MTN_REQUESTS",
          target: `requests:${ids.join(",")}`,
          newValue: JSON.stringify({ count: records.length, reason }),
        });

        return NextResponse.json({ success: true, status: "REJECTED", count: records.length });
      }

      return apiError(400, "Unsupported action");
    }

    // ── Single mode ────────────────────────────────────────────────────────
    if (!id) {
      return apiError(400, "Request ID or IDs array is required");
    }

    const reqRecord = await prisma.mtnVerificationRequest.findUnique({
      where: { id },
    });
    if (!reqRecord) {
      return apiError(404, "Verification request not found");
    }

    const now = new Date();
    if (action === "VERIFY") {
      await prisma.$transaction(async (tx) => {
        await tx.mtnVerificationRequest.update({
          where: { id },
          data: { status: "VERIFIED", verifiedAt: now },
        });

        await tx.acceptedMtnNumber.upsert({
          where: { normalizedNumber: reqRecord.normalizedNumber },
          create: {
            number: reqRecord.normalizedNumber,
            normalizedNumber: reqRecord.normalizedNumber,
            source: "SINGLE_REQUEST_VERIFICATION",
            verifiedBy: admin.email,
            verifiedAt: now,
          },
          update: {
            verifiedAt: now,
            verifiedBy: admin.email,
          },
        });

        await tx.blockedMtnNumber.updateMany({
          where: { normalizedNumber: reqRecord.normalizedNumber },
          data: { status: "ACCEPTED" },
        });
      });

      await recordAudit({
        actorLabel: admin.email,
        action: "ADMIN_VERIFIED_MTN_REQUEST",
        target: `request:${id}`,
        newValue: JSON.stringify({ number: reqRecord.normalizedNumber }),
      });

      return NextResponse.json({ success: true, status: "VERIFIED" });
    } else if (action === "REJECT") {
      const reason = rejectionReason || "Verification rejected by admin";
      await prisma.$transaction(async (tx) => {
        await tx.mtnVerificationRequest.update({
          where: { id },
          data: {
            status: "REJECTED",
            rejectedAt: now,
            rejectionReason: reason,
          },
        });

        await tx.blockedMtnNumber.updateMany({
          where: { normalizedNumber: reqRecord.normalizedNumber },
          data: { status: "REJECTED" },
        });
      });

      await recordAudit({
        actorLabel: admin.email,
        action: "ADMIN_REJECTED_MTN_REQUEST",
        target: `request:${id}`,
        newValue: JSON.stringify({ number: reqRecord.normalizedNumber, reason }),
      });

      return NextResponse.json({ success: true, status: "REJECTED" });
    }

    return apiError(400, "Unsupported action");
  } catch (err) {
    return handleRouteError(err);
  }
}
