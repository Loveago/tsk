import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import {
  verifyWebhookSignature,
  verifyTransaction,
  settlePaystackTopup,
  PAYSTACK_CURRENCY,
} from "@/lib/paystack";
import { isStorefrontReference, settleStorefrontPayment } from "@/lib/storefront";

/**
 * Paystack webhook (charge.success). Authenticated by the HMAC-SHA512
 * x-paystack-signature header over the raw body — no session.
 * Settlement is idempotent: this may fire before, after, or alongside the
 * redirect callback without double-crediting.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  if (!(await verifyWebhookSignature(rawBody, signature))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { event?: string; data?: { reference?: string } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (event.event !== "charge.success" || !event.data?.reference) {
    return NextResponse.json({ received: true });
  }

  const reference = event.data.reference;
  try {
    // Storefront checkouts use the STF- prefix — settle via the storefront
    // path (idempotent on the unique paymentReference).
    if (isStorefrontReference(reference)) {
      const verification = await verifyTransaction(reference);
      if (verification.status !== "success" || verification.currency !== PAYSTACK_CURRENCY) {
        return NextResponse.json({ received: true, note: "verification mismatch — left for review" });
      }
      const result = await settleStorefrontPayment({
        reference,
        paystackAmount: verification.amount,
        paidAt: verification.paidAt ? new Date(verification.paidAt) : undefined,
      });
      await recordAudit({
        actorLabel: "paystack-webhook",
        action: "storefront.paystack_settled",
        target: `storefront-order:${reference}`,
        newValue: JSON.stringify({ reference, settled: result.settled, reason: result.reason }),
      });
      return NextResponse.json({ received: true, settled: result.settled });
    }

    const tx = await prisma.walletTransaction.findFirst({ where: { reference } });
    if (!tx || tx.type !== "TOPUP") {
      return NextResponse.json({ received: true, note: "unknown reference" });
    }
    if (tx.status === "APPROVED") {
      return NextResponse.json({ received: true, note: "already settled" });
    }
    if (tx.status !== "PENDING") {
      return NextResponse.json({ received: true, note: `unhandled status ${tx.status}` });
    }

    // Cross-check the verified charge against our own record. On mismatch,
    // leave PENDING for manual admin review (never auto-credit wrong amounts).
    const verification = await verifyTransaction(reference);
    const expectedPesewas = Math.round(tx.amount * 100);
    if (
      verification.status !== "success" ||
      verification.currency !== PAYSTACK_CURRENCY ||
      verification.amount !== expectedPesewas
    ) {
      await recordAudit({
        userId: tx.userId,
        actorLabel: "paystack-webhook",
        action: "billing.paystack_mismatch",
        target: `transaction:${tx.id}`,
        newValue: JSON.stringify({ reference, verification }),
      });
      return NextResponse.json({ received: true, note: "verification mismatch — left for review" });
    }

    const result = await settlePaystackTopup(tx.id, reference, verification.channel);

    await recordAudit({
      userId: tx.userId,
      actorLabel: "paystack-webhook",
      action: "billing.paystack_settled",
      target: `transaction:${tx.id}`,
      newValue: JSON.stringify({
        amount: tx.amount,
        reference,
        channel: verification.channel,
        credited: result.ok,
      }),
    });

    return NextResponse.json({ received: true, credited: result.ok });
  } catch (err) {
    console.error("Paystack webhook error:", err);
    // 500 makes Paystack retry; settlement guard keeps retries safe
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
