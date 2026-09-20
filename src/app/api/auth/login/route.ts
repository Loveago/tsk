import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { loginSchema, verifyOtpSchema } from "@/lib/validation";
import { createSession, getClientIp } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { getSetting } from "@/lib/orders";
import { generateLoginOtp, verifyLoginOtp } from "@/lib/otp";
import { sendLoginOtpEmail } from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    const ip = await getClientIp();
    const maxAttempts = parseInt(await getSetting("max_login_attempts", "5"), 10);
    const lockoutMins = parseInt(await getSetting("login_lockout_minutes", "15"), 10);
    const rl = rateLimit(`login:${ip}`, maxAttempts, lockoutMins * 60 * 1000);
    if (!rl.allowed) return apiError(429, `Too many login attempts. Try again in ${lockoutMins} minutes.`);

    const body = await request.json();

    // Support direct OTP verification payload: { ticket, code }
    if (body.ticket && body.code) {
      const otpInput = verifyOtpSchema.parse(body);
      const result = await verifyLoginOtp(otpInput.ticket, otpInput.code);
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
    }

    // Standard credential submission: { email, password }
    const input = loginSchema.parse(body);

    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });

    if (!user) return apiError(401, "Invalid email or password");

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) return apiError(401, "Invalid email or password");

    if (user.status === "FROZEN") {
      return apiError(403, "Your account is frozen. Please contact administrator.");
    }
    if (user.status === "PENDING_PAYMENT") {
      return NextResponse.json(
        {
          error: "Your account is pending registration payment. Please complete payment to activate your account.",
          code: "ACCOUNT_PENDING_PAYMENT",
          email: user.email,
        },
        { status: 402 }
      );
    }
    if (user.status !== "ACTIVE") {
      return apiError(403, "This account has been disabled. Contact support.");
    }

    const loginOtpEnabled = (await getSetting("login_otp_enabled", "false")) === "true";
    const secretaryNoOtp = (await getSetting("secretary_login_without_otp", "false")) === "true";
    const isAdmin = user.role === "ADMIN";
    const isSecretaryExempt = user.role === "SECRETARY" && secretaryNoOtp;

    if (loginOtpEnabled && !isAdmin && !isSecretaryExempt) {
      const { code, ticket } = await generateLoginOtp(user.id, user.email);
      const emailRes = await sendLoginOtpEmail(user.email, user.name || "User", code, 10);
      if (!emailRes.success) {
        return apiError(
          500,
          emailRes.error || "Failed to dispatch verification code to your email. Please try again or contact support."
        );
      }

      await recordAudit({
        userId: user.id,
        actorLabel: user.email,
        action: "auth.login_otp_dispatched",
        target: `user:${user.id}`,
        ip,
        userAgent: request.headers.get("user-agent"),
      });

      return NextResponse.json({
        requireOtp: true,
        ticket,
        email: user.email,
        ...(process.env.NODE_ENV !== "production" ? { devOtp: code } : {}),
      });
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
      action: "auth.login",
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
