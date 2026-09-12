import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { resetPasswordSchema } from "@/lib/validation";
import { getClientIp } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function POST(request: NextRequest) {
  try {
    const ip = await getClientIp();
    const body = await request.json();
    const input = resetPasswordSchema.parse(body);

    const record = await prisma.passwordResetToken.findUnique({
      where: { token: input.token },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      return apiError(400, "This reset link is invalid or has expired");
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      }),
      prisma.passwordResetToken.update({
        where: { token: input.token },
        data: { usedAt: new Date() },
      }),
    ]);

    // Invalidate all existing sessions for this user
    await prisma.apiKey.updateMany({
      where: { userId: record.userId },
      data: {}, // no-op, keeps keys intact
    });

    await recordAudit({
      userId: record.userId,
      action: "auth.reset_password",
      target: `user:${record.userId}`,
      ip,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
