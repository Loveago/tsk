import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validation";
import { createSession, getClientIp } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { handleRouteError, apiError, getRequestOrigin } from "@/lib/api-helpers";
import { getDefaultProfileId } from "@/lib/orders";
import { getSignupCodeMode, applySignupCodeInTx, validateSignupCode } from "@/lib/signup-codes";
import { isPaystackConfigured, initializeTransaction } from "@/lib/paystack";

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

    const [regSetting, defaultRoleSetting, feeEnabledSetting, feeAmountSetting, feeDescSetting] =
      await Promise.all([
        prisma.systemSetting.findUnique({ where: { key: "allow_user_registration" } }),
        prisma.systemSetting.findUnique({ where: { key: "default_register_role" } }),
        prisma.systemSetting.findUnique({ where: { key: "signup_fee_enabled" } }),
        prisma.systemSetting.findUnique({ where: { key: "signup_fee_amount" } }),
        prisma.systemSetting.findUnique({ where: { key: "signup_fee_description" } }),
      ]);

    if (regSetting?.value === "false") {
      return apiError(403, "New user registration is currently closed by administrator.");
    }

    const assignedRole = defaultRoleSetting?.value === "RESELLER" ? "RESELLER" : "USER";
    const feeAmount = parseFloat(feeAmountSetting?.value || "0") || 0;
    const isFeeEnabled = feeEnabledSetting?.value === "true" && feeAmount > 0;

    if (isFeeEnabled) {
      if (!(await isPaystackConfigured())) {
        return apiError(
          503,
          "Registration fee is currently enabled but Paystack payment gateway is not configured. Please contact administrator."
        );
      }
    }

    const existing = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
      include: { signupCodeUsage: true },
    });

    if (existing && existing.status !== "PENDING_PAYMENT") {
      return apiError(409, "An account with this email already exists");
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const defaultProfileId = await getDefaultProfileId();

    if (isFeeEnabled) {
      const { user, usedCode } = await prisma.$transaction(async (tx) => {
        let userRecord;
        if (existing && existing.status === "PENDING_PAYMENT") {
          userRecord = await tx.user.update({
            where: { id: existing.id },
            data: {
              name: input.name,
              passwordHash,
              pricingProfileId: defaultProfileId,
              role: assignedRole,
            },
          });
        } else {
          userRecord = await tx.user.create({
            data: {
              name: input.name,
              email: input.email.toLowerCase(),
              passwordHash,
              role: assignedRole,
              status: "PENDING_PAYMENT",
              pricingProfileId: defaultProfileId,
            },
          });
        }

        let codeResult: { signupCodeId: string; code: string } | null = null;
        if (codeProvided && mode !== "DISABLED" && !existing?.signupCodeUsage) {
          codeResult = await applySignupCodeInTx(tx, {
            rawCode: input.signupCode!,
            userId: userRecord.id,
            ip,
            userAgent,
          });
        }

        return { user: userRecord, usedCode: codeResult };
      });

      const reference = `REG-${Date.now().toString(36).toUpperCase()}-${randomBytes(4)
        .toString("hex")
        .toUpperCase()}`;

      const walletTx = await prisma.walletTransaction.create({
        data: {
          userId: user.id,
          type: "SIGNUP_FEE",
          amount: feeAmount,
          status: "PENDING",
          reference,
          note: `Registration fee: ${feeDescSetting?.value || "Account Activation Fee"}`,
        },
      });

      const origin = getRequestOrigin(request);
      const callbackUrl = `${origin}/api/auth/register-fee/callback`;

      const authorization = await initializeTransaction({
        email: user.email,
        amountPesewas: Math.round(feeAmount * 100),
        reference,
        callbackUrl,
        metadata: {
          type: "SIGNUP_FEE",
          userId: user.id,
          email: user.email,
          walletTransactionId: walletTx.id,
        },
      });

      await recordAudit({
        userId: user.id,
        actorLabel: user.email,
        action: "auth.register_fee_initiated",
        target: `user:${user.id}`,
        newValue: JSON.stringify({
          amount: feeAmount,
          reference,
          role: user.role,
        }),
        ip,
        userAgent,
      });

      return NextResponse.json({
        requiresPayment: true,
        authorizationUrl: authorization.authorization_url,
        reference,
        amount: feeAmount,
        currency: "GHS",
        description: feeDescSetting?.value || "Account Activation Fee",
        message: "Account created. Redirecting to Paystack to complete activation fee payment.",
      });
    }

    // Perform registration and signup code usage inside a transaction
    const { user, usedCode } = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name: input.name,
          email: input.email.toLowerCase(),
          passwordHash,
          role: assignedRole,
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
