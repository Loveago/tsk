import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validation";
import { createSession, getClientIp } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { getDefaultProfileId } from "@/lib/orders";
import { getSignupCodeMode, applySignupCodeInTx, validateSignupCode } from "@/lib/signup-codes";

export async function POST(request: NextRequest) {
  try {
    const ip = await getClientIp();
    const userAgent = request.headers.get("user-agent") || undefined;
    const rl = rateLimit(`register:${ip}`, 5, 60_000);
    if (!rl.allowed) return apiError(429, "Too many attempts. Try again later.");

    const body = await request.json();
    const input = registerSchema.parse(body);

    const mode = await getSignupCodeMode();
    const codeProvided = !!input.signupCode?.trim();

    if (mode === "REQUIRED" && !codeProvided) {
      return apiError(400, "A valid signup code is required to register");
    }

    if (codeProvided && mode !== "DISABLED") {
      const codeCheck = await validateSignupCode(input.signupCode!);
      if (!codeCheck.valid) {
        return apiError(400, codeCheck.message || "Invalid or expired signup code");
      }
    }

    const existing = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    if (existing) return apiError(409, "An account with this email already exists");

    const passwordHash = await bcrypt.hash(input.password, 10);
    const defaultProfileId = await getDefaultProfileId();

    // Perform registration and signup code usage inside a transaction
    const { user, usedCode } = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name: input.name,
          email: input.email.toLowerCase(),
          passwordHash,
          role: "USER",
          status: "ACTIVE",
          pricingProfileId: defaultProfileId,
        },
      });

      let codeResult: { signupCodeId: string; code: string } | null = null;
      if (codeProvided && mode !== "DISABLED") {
        codeResult = await applySignupCodeInTx(tx, {
          rawCode: input.signupCode!,
          userId: newUser.id,
          ip,
          userAgent,
        });
      }

      return { user: newUser, usedCode: codeResult };
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
      newValue: JSON.stringify({
        role: user.role,
        signupCode: usedCode?.code ?? null,
      }),
      ip,
      userAgent,
    });

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        balance: user.balance,
        signupCode: usedCode?.code ?? null,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
