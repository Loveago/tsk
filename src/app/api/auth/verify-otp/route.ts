import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyOtpSchema } from "@/lib/validation";
import { createSession, getClientIp } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { verifyLoginOtp } from "@/lib/otp";

export async function POST(request: NextRequest) {
  try {
    const ip = await getClientIp();
    const rl = rateLimit(`verify_otp:${ip}`, 20, 60 * 1000);
    if (!rl.allowed) {
      return apiError(429, "Too many OTP verification attempts. Please wait a minute before trying again.");
    }

    const body = await request.json();
    const input = verifyOtpSchema.parse(body);

    const result = await verifyLoginOtp(input.ticket, input.code);
    if (!result.valid || !result.userId) {
      return apiError(400, result.error || "Invalid or expired OTP code.");
    }

    const user = await prisma.user.findUnique({
      where: { id: result.userId },
    });

    if (!user || user.status !== "ACTIVE") {
      return apiError(403, "Account is disabled or not found.");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await createSession({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tokenVersion: user.tokenVersion,
    });

    await recordAudit({
      userId: user.id,
      actorLabel: user.email,
      action: "auth.login_otp_verified",
      target: `user:${user.id}`,
      ip,
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        balance: user.balance,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
