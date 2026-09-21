import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAdmin();
    const { id } = await params;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return apiError(404, "User not found");

    const previousStatus = user.status;

    // Update user status to ACTIVE and increment tokenVersion
    const updated = await prisma.user.update({
      where: { id },
      data: {
        status: "ACTIVE",
        tokenVersion: { increment: 1 },
      },
    });

    // If there were pending signup fee transactions, approve them as account was manually activated
    await prisma.walletTransaction.updateMany({
      where: {
        userId: id,
        type: "SIGNUP_FEE",
        status: "PENDING",
      },
      data: {
        status: "APPROVED",
        note: `Manually activated by admin (${actor.email})`,
      },
    });

    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: "user.activate",
      target: `user:${user.id}`,
      previousValue: JSON.stringify({ status: previousStatus }),
      newValue: JSON.stringify({ status: "ACTIVE" }),
    });

    return NextResponse.json({
      ok: true,
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        status: updated.status,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
