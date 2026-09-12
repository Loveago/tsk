import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validation";
import { createSession, getClientIp } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { getDefaultProfileId } from "@/lib/orders";

export async function POST(request: NextRequest) {
  try {
    const ip = await getClientIp();
    const rl = rateLimit(`register:${ip}`, 5, 60_000);
    if (!rl.allowed) return apiError(429, "Too many attempts. Try again later.");

    const body = await request.json();
    const input = registerSchema.parse(body);

    const existing = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    if (existing) return apiError(409, "An account with this email already exists");

    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email.toLowerCase(),
        passwordHash,
        role: "USER",
        status: "ACTIVE",
        pricingProfileId: await getDefaultProfileId(),
      },
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
      action: "auth.register",
      target: `user:${user.id}`,
      newValue: JSON.stringify({ role: user.role }),
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
