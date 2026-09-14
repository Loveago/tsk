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
    if (user.role === "ADMIN") {
      return apiError(400, "Administrator accounts cannot be frozen.");
    }

    const nextStatus = user.status === "FROZEN" ? "ACTIVE" : "FROZEN";

    const updated = await prisma.user.update({
      where: { id },
      data: {
        status: nextStatus,
        tokenVersion: { increment: 1 }, // invalidate any existing sessions immediately
      },
    });

    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: nextStatus === "FROZEN" ? "user.freeze" : "user.unfreeze",
      target: `user:${user.id}`,
      previousValue: JSON.stringify({ status: user.status }),
      newValue: JSON.stringify({ status: nextStatus }),
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
