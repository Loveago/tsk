import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { forgotPasswordSchema } from "@/lib/validation";
import { getClientIp } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { handleRouteError } from "@/lib/api-helpers";

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

    const token = randomBytes(24).toString("hex");
    await prisma.passwordResetToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    await recordAudit({
      userId: user.id,
      actorLabel: user.email,
      action: "auth.forgot_password",
      target: `user:${user.id}`,
      ip,
    });

    // No mail provider configured: return the link directly in non-production
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
