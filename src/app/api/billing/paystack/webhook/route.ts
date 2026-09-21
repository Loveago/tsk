import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import {
  verifyWebhookSignature,
  verifyTransaction,
  settlePaystackTopup,
  PAYSTACK_CURRENCY,
} from "@/lib/paystack";
import { isStorefrontReference, verifyAndSettleStorefrontOrder } from "@/lib/storefront";

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
    // Storefront checkouts use the STF- or GH- prefix (or exist in StorefrontOrder table) — settle via the storefront
    // path (idempotent, auto-verifies, and automatically dispatches to provider).
    let isStorefront = isStorefrontReference(reference);
    if (!isStorefront) {
      const sfRow = await prisma.storefrontOrder.findUnique({
        where: { paymentReference: reference },
        select: { id: true },
      });
      if (sfRow) isStorefront = true;
    }

    if (isStorefront) {
      const result = await verifyAndSettleStorefrontOrder(reference);
      await recordAudit({
        actorLabel: "paystack-webhook",
        action: "storefront.paystack_settled",
        target: `storefront-order:${reference}`,
        newValue: JSON.stringify({ reference, settled: result.settled, reason: result.reason }),
      });
      return NextResponse.json({ received: true, settled: result.settled });
    }

    // Signup registration fee check
    if (reference.startsWith("REG-") || (event.data as any)?.metadata?.type === "SIGNUP_FEE") {
      const verification = await verifyTransaction(reference);
      if (verification.status !== "success" || verification.currency !== PAYSTACK_CURRENCY) {
        return NextResponse.json({ received: true, note: "signup fee verification mismatch" });
      }

      let tx = await prisma.walletTransaction.findFirst({
        where: { reference, type: "SIGNUP_FEE" },
        include: { user: true },
      });
      if (!tx && (event.data as any)?.metadata?.walletTransactionId) {
        tx = await prisma.walletTransaction.findUnique({
          where: { id: String((event.data as any).metadata.walletTransactionId) },
          include: { user: true },
        });
      }

      if (!tx || !tx.user) {
        return NextResponse.json({ received: true, note: "registration transaction not found" });
      }

      if (tx.status === "APPROVED" && tx.user.status === "ACTIVE") {
        return NextResponse.json({ received: true, note: "already activated" });
      }

      await prisma.$transaction(async (prismaTx) => {
        await prismaTx.user.update({
          where: { id: tx.user.id },
          data: { status: "ACTIVE" },
        });
        await prismaTx.walletTransaction.update({
          where: { id: tx.id },
          data: {
            status: "APPROVED",
            note: `${tx.note || "Signup registration fee"} — Verified via webhook${
              verification.channel ? ` (${verification.channel})` : ""
            }`,
          },
        });
      });

      await recordAudit({
        userId: tx.user.id,
        actorLabel: "paystack-webhook",
        action: "auth.register_fee_settled",
        target: `user:${tx.user.id}`,
        newValue: JSON.stringify({ reference, amount: tx.amount, channel: verification.channel }),
      });

      return NextResponse.json({ received: true, activated: true });
    }

    let tx = await prisma.walletTransaction.findFirst({ where: { reference } });
    if (!tx && (event.data as any)?.metadata?.walletTransactionId) {
      tx = await prisma.walletTransaction.findUnique({
        where: { id: String((event.data as any).metadata.walletTransactionId) },
      });
    }

    if (!tx || tx.type !== "TOPUP") {
      return NextResponse.json({ received: true, note: "unknown reference" });
    }
    if (tx.status === "APPROVED") {
      return NextResponse.json({ received: true, note: "already settled" });
    }
    if (tx.status !== "PENDING") {
      return NextResponse.json({ received: true, note: `unhandled status ${tx.status}` });
    }

    const depositPesewas = Math.round(tx.amount * 100);
    const feePesewas = Math.round(depositPesewas * 0.02);
    const chargedWithFeePesewas = depositPesewas + feePesewas;
    const isAmountMatch = (amt?: number) =>
      typeof amt === "number" && (amt === chargedWithFeePesewas || amt === depositPesewas);

    const eventData = event.data as {
      status?: string;
      amount?: number;
      currency?: string;
      channel?: string;
    };

    let isVerified = false;
    let channel = eventData.channel;

    try {
      const verification = await verifyTransaction(reference);
      if (
        verification.status === "success" &&
        verification.currency === PAYSTACK_CURRENCY &&
        isAmountMatch(verification.amount)
      ) {
        isVerified = true;
        channel = verification.channel || channel;
      }
    } catch (verifyErr) {
      // Outgoing verify failed (e.g. timeout) — fallback to HMAC-verified webhook body
      if (
        eventData.status === "success" &&
        eventData.currency === PAYSTACK_CURRENCY &&
        isAmountMatch(eventData.amount)
      ) {
        isVerified = true;
      }
    }

    if (!isVerified) {
      await recordAudit({
        userId: tx.userId,
        actorLabel: "paystack-webhook",
        action: "billing.paystack_mismatch",
        target: `transaction:${tx.id}`,
        newValue: JSON.stringify({ reference, eventData }),
      });
      return NextResponse.json({ received: true, note: "verification mismatch — left for review" });
    }

    const result = await settlePaystackTopup(tx.id, reference, channel);

    await recordAudit({
      userId: tx.userId,
      actorLabel: "paystack-webhook",
      action: "billing.paystack_settled",
      target: `transaction:${tx.id}`,
      newValue: JSON.stringify({
        amount: tx.amount,
        reference,
        channel,
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
