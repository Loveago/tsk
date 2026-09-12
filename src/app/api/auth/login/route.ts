import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validation";
import { createSession, getClientIp } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function POST(request: NextRequest) {
  try {
    const ip = await getClientIp();
    const rl = rateLimit(`login:${ip}`, 10, 60_000);
    if (!rl.allowed) return apiError(429, "Too many login attempts. Try again later.");

    const body = await request.json();
    const input = loginSchema.parse(body);

    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });

    if (!user) return apiError(401, "Invalid email or password");

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) return apiError(401, "Invalid email or password");

    if (user.status !== "ACTIVE") {
      return apiError(403, "This account has been disabled. Contact support.");
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
