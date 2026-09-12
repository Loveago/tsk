import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { updateUserSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAdmin();
    const { id } = await params;
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return apiError(404, "User not found");

    const body = await request.json();
    const input = updateUserSchema.parse(body);

    const email = input.email.toLowerCase();
    if (email !== existing.email) {
      const dup = await prisma.user.findUnique({ where: { email } });
      if (dup) return apiError(409, "A user with this email already exists");
    }

    const data: Record<string, unknown> = {
      name: input.name,
      email,
      role: input.role,
      status: input.status,
      balance: input.balance,
      pricingProfileId: input.pricingProfileId || null,
    };
    if (input.password) {
      data.passwordHash = await bcrypt.hash(input.password, 10);
      data.tokenVersion = { increment: 1 }; // force re-login everywhere
    }

    const updated = await prisma.user.update({ where: { id }, data });

    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: "user.update",
      target: `user:${id}`,
      previousValue: JSON.stringify({
        role: existing.role,
        status: existing.status,
        balance: existing.balance,
      }),
      newValue: JSON.stringify({ role: input.role, status: input.status, balance: input.balance }),
    });

    return NextResponse.json({
      user: { id: updated.id, email: updated.email, role: updated.role, status: updated.status },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
