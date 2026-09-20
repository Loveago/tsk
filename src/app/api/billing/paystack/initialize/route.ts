import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireUser, getClientIp } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError, getRequestOrigin } from "@/lib/api-helpers";
import { paystackTopupSchema } from "@/lib/validation";
import {
  isPaystackConfigured,
  initializeTransaction,
  calculatePaystackFee,
  PAYSTACK_MIN_AMOUNT,
} from "@/lib/paystack";
import { getSetting } from "@/lib/orders";

/**
 * Start an instant Paystack top-up: creates a PENDING WalletTransaction and
 * returns Paystack's hosted checkout URL. Settlement happens via the webhook
 * and/or the redirect callback (both idempotent).
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const input = paystackTopupSchema.parse(await request.json());

    const paystackEnabled = await getSetting("paystack_topup_enabled", "true");
    if (paystackEnabled === "false") {
      return apiError(503, "Paystack top-ups are currently disabled.");
    }

    if (!(await isPaystackConfigured())) {
      return apiError(503, "Paystack is not configured yet. Please use the MoMo top-up method.");
    }

    const minSetting = await getSetting("paystack_min_topup", "");
    const maxSetting = await getSetting("paystack_max_topup", "");
    const minAmount = minSetting ? parseFloat(minSetting) : PAYSTACK_MIN_AMOUNT;
    const maxAmount = maxSetting ? parseFloat(maxSetting) : 5000;

    if (input.amount < minAmount) {
      return apiError(400, `Minimum top-up is GHS ${minAmount.toFixed(2)}`);
    }
    if (input.amount > maxAmount) {
      return apiError(400, `Maximum top-up is GHS ${maxAmount.toFixed(2)}`);
    }

    const depositAmount = Math.round(input.amount * 100) / 100;
    const feeCalculation = calculatePaystackFee(depositAmount);
    const chargedAmount = feeCalculation.totalGhs;
    const feeAmount = feeCalculation.feeGhs;
    const totalPesewas = feeCalculation.totalPesewas;

    const reference = `PSK-${Date.now().toString(36).toUpperCase()}-${randomBytes(4)
      .toString("hex")
      .toUpperCase()}`;

    const tx = await prisma.walletTransaction.create({
      data: {
        userId: user.id,
        type: "TOPUP",
        amount: depositAmount,
        status: "PENDING",
        reference,
        note: `Paystack top-up (Deposit: GHS ${depositAmount.toFixed(2)} + 2% fee: GHS ${feeAmount.toFixed(2)} = GHS ${chargedAmount.toFixed(2)})`,
      },
    });

    try {
      const origin = getRequestOrigin(request);
      const authorization = await initializeTransaction({
        email: user.email,
        amountPesewas: totalPesewas,
        reference,
        callbackUrl: `${origin}/api/billing/paystack/callback`,
        metadata: {
          walletTransactionId: tx.id,
          userId: user.id,
          depositAmount,
          feeAmount,
          chargedAmount,
        },
      });

      await recordAudit({
        userId: user.id,
        actorLabel: user.email,
        action: "billing.paystack_initialize",
        target: `transaction:${tx.id}`,
        newValue: JSON.stringify({
          depositAmount,
          feeAmount,
          chargedAmount,
          totalPesewas,
          reference,
        }),
        ip: await getClientIp(),
      });

      return NextResponse.json({
        reference,
        transactionId: tx.id,
        depositAmount,
        feeAmount,
        chargedAmount,
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
