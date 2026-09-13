import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { recordAudit } from "@/lib/audit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;

    const batch = await prisma.mtnVerificationBatch.findUnique({
      where: { id },
      include: {
        numbers: {
          orderBy: { number: "asc" },
          include: {
            verificationRequest: {
              include: {
                user: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
      },
    });

    if (!batch) {
      return apiError(404, "Batch not found");
    }

    return NextResponse.json({ batch });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await request.json();
    const { status, notes } = body;

    const existing = await prisma.mtnVerificationBatch.findUnique({
      where: { id },
    });
    if (!existing) {
      return apiError(404, "Batch not found");
    }

    const data: Record<string, unknown> = {};
    if (status) data.status = status;
    if (notes !== undefined) data.notes = notes;
    if (status === "PROCESSING" && !existing.submittedAt) {
      data.submittedAt = new Date();
    }

    const updated = await prisma.mtnVerificationBatch.update({
      where: { id },
      data,
    });

    await recordAudit({
      actorLabel: admin.email,
      action: "ADMIN_UPDATED_MTN_BATCH_STATUS",
      target: `batch:${existing.batchReference}`,
      previousValue: JSON.stringify({ status: existing.status }),
      newValue: JSON.stringify({ status: updated.status }),
    });

    return NextResponse.json({ success: true, batch: updated });
  } catch (err) {
    return handleRouteError(err);
  }
}
