import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { deliveryReportActionSchema } from "@/lib/validation";
import { changeOrderStatus } from "@/lib/orders";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { deliveryReportCode } from "@/lib/types";

/** Timeline event types mirrored by the report UI (§13). */
const EVENT_FOR_ACTION: Record<string, string> = {
  START_INVESTIGATION: "INVESTIGATION_STARTED",
  KEEP_INVESTIGATING: "KEEP_INVESTIGATING",
  MARK_DELIVERED: "MARKED_DELIVERED",
  ADD_RESPONSE: "RESPONSE_ADDED",
  REJECT: "REJECTED",
  RESOLVE: "RESOLVED",
  RESOLVE_RESEND: "RESEND",
  RESOLVE_REFUND: "REFUND",
};

/** Admin "Not Received" reports queue (§33/§34). */
export async function GET(request: NextRequest) {
  try {
    await requireStaff();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 15)));
    const status = searchParams.get("status");
    const network = searchParams.get("network");
    const q = searchParams.get("q");

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (network) where.order = { is: { network } };
    if (q) {
      const orderId = Number(q.replace(/^CF-/i, "")) - 10000;
      where.OR = [
        { order: { is: { phoneNumber: { contains: q } } } },
        { user: { is: { OR: [{ name: { contains: q } }, { email: { contains: q } }] } } },
        ...(Number.isFinite(orderId) && orderId > 0 ? [{ orderId }] : []),
      ];
    }

    const [data, total, byStatus] = await Promise.all([
      prisma.deliveryReport.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          seq: true,
          reason: true,
          message: true,
          status: true,
          adminNote: true,
          adminResponse: true,
          respondedAt: true,
          proofImageMime: true,
          proofImageUploadedAt: true,
          resolvedAt: true,
          createdAt: true,
          order: {
            select: {
              id: true,
              batchId: true,
              batch: { select: { batchCode: true } },
              phoneNumber: true,
              network: true,
              gbAmount: true,
              amount: true,
              status: true,
              completedAt: true,
              failureReason: true,
            },
          },
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.deliveryReport.count({ where }),
      prisma.deliveryReport.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);

    const stats: Record<string, number> = {};
    for (const row of byStatus) stats[row.status] = row._count._all;

    return NextResponse.json({
      data: data.map((r) => ({ ...r, code: deliveryReportCode(r.seq) })),
      stats,
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * Admin report workflow (§9/§16/§20):
 *  - START_INVESTIGATION  → report OPEN → INVESTIGATING
 *  - KEEP_INVESTIGATING   → stays INVESTIGATING, adds a timeline event
 *  - MARK_DELIVERED       → report → DELIVERED (order stays SUCCESS — §17)
 *  - ADD_RESPONSE         → saves the administrative response visible to the user (§12)
 *  - RESOLVE              → report → RESOLVED
 *  - REJECT               → report → REJECTED, order untouched
 *  - RESOLVE_RESEND       → order FAILED → PROCESSING so it re-enters the export flow
 *  - RESOLVE_REFUND       → order FAILED → REFUNDED (override transition, forced)
 * Every action writes a report timeline event (§13) and an audit log entry (§20).
 */
export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireStaff();
    const input = deliveryReportActionSchema.parse(await request.json());

    const report = await prisma.deliveryReport.findUnique({
      where: { id: input.reportId },
      include: { order: { select: { id: true, status: true } } },
    });
    if (!report) return apiError(404, "Report not found");

    const isClosed = report.status === "RESOLVED" || report.status === "REJECTED";
    if (isClosed && input.action !== "ADD_RESPONSE") {
      return apiError(409, "This report has already been closed");
    }

    const actorLabel = { id: actor.id, label: actor.email };
    let orderUpdated: string | null = null;
    const data: Record<string, unknown> = {};

    if (input.action === "START_INVESTIGATION") {
      if (report.status !== "OPEN") {
        return apiError(409, "Only open reports can move to investigating");
      }
      data.status = "INVESTIGATING";
    } else if (input.action === "MARK_DELIVERED") {
      if (report.status === "DELIVERED") {
        return apiError(409, "This report is already marked as delivered");
      }
      data.status = "DELIVERED";
    } else if (input.action === "ADD_RESPONSE") {
      if (!input.adminResponse?.trim()) {
        return apiError(400, "Response text is required");
      }
      data.adminResponse = input.adminResponse.trim();
      data.respondedAt = new Date();
      data.respondedBy = actor.email;
      // A response on a closed report does not reopen it
    } else if (input.action === "RESOLVE") {
      data.status = "RESOLVED";
      data.resolvedAt = new Date();
      data.resolvedBy = actor.email;
      if (input.resolutionNote) data.adminNote = input.resolutionNote;
    } else if (input.action === "REJECT") {
      data.status = "REJECTED";
      data.resolvedAt = new Date();
      data.resolvedBy = actor.email;
      if (input.resolutionNote) data.adminNote = input.resolutionNote;
    } else if (input.action === "RESOLVE_RESEND") {
      if (report.order.status === "FAILED") {
        await changeOrderStatus(
          report.orderId,
          "PROCESSING",
          `Report resolved: resend${input.resolutionNote ? ` — ${input.resolutionNote}` : ""}`,
          actorLabel
        );
        orderUpdated = "PROCESSING";
      }
      data.status = "RESOLVED";
      data.resolvedAt = new Date();
      data.resolvedBy = actor.email;
      if (input.resolutionNote) data.adminNote = input.resolutionNote;
    } else if (input.action === "RESOLVE_REFUND") {
      if (report.order.status === "FAILED") {
        // FAILED -> REFUNDED is an override transition by design (§16)
        await changeOrderStatus(
          report.orderId,
          "REFUNDED",
          `Report resolved: refund${input.resolutionNote ? ` — ${input.resolutionNote}` : ""}`,
          actorLabel,
          { force: true }
        );
        orderUpdated = "REFUNDED";
      }
      data.status = "RESOLVED";
      data.resolvedAt = new Date();
      data.resolvedBy = actor.email;
      if (input.resolutionNote) data.adminNote = input.resolutionNote;
    }
    // KEEP_INVESTIGATING changes nothing structurally — only the timeline event below

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.deliveryReport.update({
        where: { id: report.id },
        data,
      });
      await tx.deliveryReportEvent.create({
        data: {
          reportId: report.id,
          type: EVENT_FOR_ACTION[input.action] ?? input.action,
          message:
            input.action === "ADD_RESPONSE"
              ? "Administrative response added"
              : input.resolutionNote || null,
          actorLabel: actor.email,
        },
      });
      return row;
    });

    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: `delivery_report.${input.action.toLowerCase()}`,
      target: `delivery_report:${report.id} (order:${report.orderId})`,
      previousValue: JSON.stringify({ status: report.status }),
      newValue: JSON.stringify({
        status: updated.status,
        orderUpdated,
        responseAdded: input.action === "ADD_RESPONSE" || undefined,
      }),
    });

    return NextResponse.json({ ok: true, report: updated, orderUpdated });
  } catch (err) {
    return handleRouteError(err);
  }
}