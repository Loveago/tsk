import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireUser, getClientIp } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { paystackTopupSchema } from "@/lib/validation";
import {
  isPaystackConfigured,
  initializeTransaction,
  PAYSTACK_MIN_AMOUNT,
} from "@/lib/paystack";

/**
 * Start an instant Paystack top-up: creates a PENDING WalletTransaction and
 * returns Paystack's hosted checkout URL. Settlement happens via the webhook
 * and/or the redirect callback (both idempotent).
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const input = paystackTopupSchema.parse(await request.json());

    if (!isPaystackConfigured()) {
      return apiError(503, "Paystack is not configured yet. Please use the MoMo top-up method.");
    }
    if (input.amount < PAYSTACK_MIN_AMOUNT) {
      return apiError(400, `Minimum top-up is GHS ${PAYSTACK_MIN_AMOUNT.toFixed(2)}`);
    }

    const amount = Math.round(input.amount * 100) / 100;
    const reference = `PSK-${Date.now().toString(36).toUpperCase()}-${randomBytes(4)
      .toString("hex")
      .toUpperCase()}`;

    const tx = await prisma.walletTransaction.create({
      data: {
        userId: user.id,
        type: "TOPUP",
        amount,
        status: "PENDING",
        reference,
        note: "Paystack instant top-up (initialized)",
      },
    });

    try {
      const origin = request.nextUrl.origin;
      const authorization = await initializeTransaction({
        email: user.email,
        amountPesewas: Math.round(amount * 100),
        reference,
        callbackUrl: `${origin}/api/billing/paystack/callback`,
        metadata: { walletTransactionId: tx.id, userId: user.id },
      });

      await recordAudit({
        userId: user.id,
        actorLabel: user.email,
        action: "billing.paystack_initialize",
        target: `transaction:${tx.id}`,
        newValue: JSON.stringify({ amount, reference }),
        ip: await getClientIp(),
      });

      return NextResponse.json({
        reference,
        transactionId: tx.id,
        authorizationUrl: authorization.authorization_url,
      });
    } catch (initErr) {
      // No orphan PENDING rows if Paystack rejects the initialization
      await prisma.walletTransaction.delete({ where: { id: tx.id } }).catch(() => undefined);
      return apiError(502, initErr instanceof Error ? initErr.message : "Paystack initialization failed");
    }
  } catch (err) {
    return handleRouteError(err);
  }
}
