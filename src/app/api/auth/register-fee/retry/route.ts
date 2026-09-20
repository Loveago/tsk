import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { handleRouteError, apiError, getRequestOrigin } from "@/lib/api-helpers";
import { getClientIp } from "@/lib/auth";
import { getSetting } from "@/lib/orders";
import { isPaystackConfigured, initializeTransaction } from "@/lib/paystack";
import { z } from "zod";

const retrySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const ip = await getClientIp();
    const rl = rateLimit(`fee-retry:${ip}`, 5, 60_000);
    if (!rl.allowed) return apiError(429, "Too many attempts. Please wait.");

    const body = await request.json();
    const input = retrySchema.parse(body);

    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });

    if (!user) return apiError(404, "Account not found");

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) return apiError(401, "Invalid password");

    if (user.status === "ACTIVE") {
      return apiError(400, "This account is already active. Please sign in directly.");
    }

    if (user.status !== "PENDING_PAYMENT") {
      return apiError(403, "Account status does not allow payment. Please contact support.");
    }

    if (!(await isPaystackConfigured())) {
      return apiError(503, "Paystack payment gateway is not configured. Please contact administrator.");
    }

    const [feeAmountSetting, feeDescSetting] = await Promise.all([
      getSetting("signup_fee_amount", "0"),
      getSetting("signup_fee_description", "Account Activation Fee"),
    ]);

    const feeAmount = parseFloat(feeAmountSetting) || 0;
    if (feeAmount <= 0) {
      // If fee was turned off since user registered, activate immediately
      await prisma.user.update({
        where: { id: user.id },
        data: { status: "ACTIVE" },
      });
      return NextResponse.json({
        alreadyActivated: true,
        message: "Your account has been activated. Please sign in.",
      });
    }

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
        note: `Registration fee retry: ${feeDescSetting}`,
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

    return NextResponse.json({
      authorizationUrl: authorization.authorization_url,
      reference,
      amount: feeAmount,
      currency: "GHS",
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
