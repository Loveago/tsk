import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { forgotPasswordSchema } from "@/lib/validation";
import { getClientIp } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { handleRouteError, getRequestOrigin } from "@/lib/api-helpers";
import { getSetting } from "@/lib/orders";
import { sendPasswordResetEmail } from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    const ip = await getClientIp();
    const rl = rateLimit(`forgot:${ip}`, 5, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ ok: true });
    }

    const body = await request.json();
    const input = forgotPasswordSchema.parse(body);

    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });

    // Always respond ok to avoid account enumeration
    if (!user || user.status !== "ACTIVE") {
      return NextResponse.json({ ok: true });
    }

    const expiryMinutes = parseInt(await getSetting("password_reset_expiry_minutes", "60"), 10);
    const token = randomBytes(24).toString("hex");
    await prisma.passwordResetToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() + expiryMinutes * 60 * 1000),
      },
    });

    const origin = getRequestOrigin(request);
    const resetUrl = `${origin}/reset-password?token=${token}`;

    await sendPasswordResetEmail(
      user.email,
      user.name || "User",
      resetUrl,
      expiryMinutes
    );

    await recordAudit({
      userId: user.id,
      actorLabel: user.email,
      action: "auth.forgot_password",
      target: `user:${user.id}`,
      ip,
    });

    // In non-production, also return resetPath for automated tests and dev convenience
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json({
        ok: true,
        resetPath: `/reset-password?token=${token}`,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
