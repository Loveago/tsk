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

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        overdraftEnabled: true,
        overdraftLimit: true,
        balance: true,
      },
    });
    if (!user) return apiError(404, "User not found");

    let nextState = !user.overdraftEnabled;
    let nextLimit = user.overdraftLimit ?? 0;
    try {
      const body = await request.json();
      if (typeof body?.overdraftEnabled === "boolean") {
        nextState = body.overdraftEnabled;
      }
      if (body?.overdraftLimit !== undefined && body?.overdraftLimit !== null && body?.overdraftLimit !== "") {
        const parsedLimit = Number(body.overdraftLimit);
        if (!Number.isFinite(parsedLimit) || parsedLimit < 0 || parsedLimit > 1000000) {
          return apiError(400, "Overdraft limit must be between GHS 0 and GHS 1,000,000");
        }
        nextLimit = Number(parsedLimit.toFixed(2));
      }
    } catch {
      // No JSON body provided; toggle current state
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        overdraftEnabled: nextState,
        overdraftLimit: nextLimit,
      },
      select: {
        id: true,
        name: true,
        email: true,
        overdraftEnabled: true,
        overdraftLimit: true,
        balance: true,
      },
    });

    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: nextState ? "user.overdraft_enabled" : "user.overdraft_disabled",
      target: `user:${user.id}`,
      previousValue: JSON.stringify({
        overdraftEnabled: user.overdraftEnabled,
        overdraftLimit: user.overdraftLimit,
      }),
      newValue: JSON.stringify({
        overdraftEnabled: nextState,
        overdraftLimit: nextLimit,
      }),
    });

    return NextResponse.json({
      ok: true,
      user: updated,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
