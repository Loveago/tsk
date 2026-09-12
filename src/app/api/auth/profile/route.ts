import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { updateProfileSchema } from "@/lib/validation";
import { requireUser, getClientIp } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function PATCH(request: NextRequest) {
  try {
    const current = await requireUser();
    const ip = await getClientIp();
    const body = await request.json();
    const input = updateProfileSchema.parse(body);

    const email = input.email.toLowerCase();
    if (email !== current.email) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) return apiError(409, "This email is already in use");
    }

    let data: Record<string, unknown> = {
      name: input.name,
      email,
      phone: input.phone || null,
    };
    let bumpToken = false;

    if (input.newPassword) {
      const user = await prisma.user.findUnique({
        where: { id: current.id },
        select: { passwordHash: true },
      });
      if (!user) return apiError(401, "Account not found");
      if (!input.currentPassword) {
        return apiError(400, "Current password is required to set a new password");
      }
      const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
      if (!valid) return apiError(400, "Current password is incorrect");
      data.passwordHash = await bcrypt.hash(input.newPassword, 10);
      bumpToken = true;
    }

    if (bumpToken) data.tokenVersion = { increment: 1 };

    const updated = await prisma.user.update({
      where: { id: current.id },
      data,
    });

    await recordAudit({
      userId: current.id,
      actorLabel: current.email,
      action: "profile.update",
      target: `user:${current.id}`,
      previousValue: JSON.stringify({ name: current.name, email: current.email }),
      newValue: JSON.stringify({ name: input.name, email }),
      ip,
    });

    if (bumpToken) {
      await prisma.user.update({
        where: { id: current.id },
        data: {}, // session already carries old tv; getCurrentUser will reject
      });
      // Re-create session with new tokenVersion so the user stays logged in
      const { createSession } = await import("@/lib/auth");
      await createSession({
        id: updated.id,
        email: updated.email,
        name: updated.name,
        role: updated.role,
        tokenVersion: updated.tokenVersion,
      });
    }

    return NextResponse.json({
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        status: updated.status,
        balance: updated.balance,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
