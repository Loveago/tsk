import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/orders";

/**
 * Paystack payment gateway client (Ghana: GHS, pesewas).
 * Used for instant wallet top-ups — see /api/billing/paystack/*.
 * Docs: https://paystack.com/docs/api/
 */

const PAYSTACK_BASE = "https://api.paystack.co";
export const PAYSTACK_CURRENCY = "GHS";
export const PAYSTACK_MIN_AMOUNT = 1; // GHS
export const PAYSTACK_MAX_AMOUNT = 5000; // GHS

export async function getPaystackSecretKey(): Promise<string | null> {
  const dbKey = (await getSetting("paystack_secret_key")).trim();
  if (dbKey) return dbKey;
  const key = process.env.PAYSTACK_SECRET_KEY?.trim();
  return key ? key : null;
}

export async function isPaystackConfigured(): Promise<boolean> {
  return (await getPaystackSecretKey()) !== null;
}

async function paystackRequest<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown
): Promise<T> {
  const secret = await getPaystackSecretKey();
  if (!secret) throw new Error("Paystack is not configured (missing PAYSTACK_SECRET_KEY)");

  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  const json = (await res.json().catch(() => null)) as
    | { status: boolean; message?: string; data?: T }
    | null;

  if (!res.ok || !json?.status || json.data === undefined) {
    throw new Error(json?.message ?? `Paystack request failed (${res.status})`);
  }
  return json.data;
}

export interface PaystackAuthorization {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export async function initializeTransaction(input: {
  email: string;
  amountPesewas: number;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}): Promise<PaystackAuthorization> {
  return paystackRequest<PaystackAuthorization>("POST", "/transaction/initialize", {
    email: input.email,
    amount: input.amountPesewas,
    currency: PAYSTACK_CURRENCY,
    reference: input.reference,
    callback_url: input.callbackUrl,
    metadata: input.metadata,
  });
}

export interface PaystackVerification {
  status: string; // success | failed | abandoned | ongoing ...
  reference: string;
  amount: number; // pesewas
  currency: string;
  channel?: string;
  paidAt?: string;
  gateway_response?: string;
}

export async function verifyTransaction(reference: string): Promise<PaystackVerification> {
  return paystackRequest<PaystackVerification>(
    "GET",
    `/transaction/verify/${encodeURIComponent(reference)}`
  );
}

/**
 * Webhook authenticity: HMAC SHA512 of the raw request body with the secret
 * key, compared (timing-safe) against the x-paystack-signature header.
 */
export async function verifyWebhookSignature(rawBody: string, signature: string | null): Promise<boolean> {
  const secret = await getPaystackSecretKey();
  if (!secret || !signature) return false;
  const expected = createHmac("sha512", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Atomically settle a Paystack top-up: PENDING -> APPROVED + balance credit.
 * The status guard inside the transaction makes this idempotent — the webhook
 * and the redirect callback may both fire, or either may fire twice.
 */
export async function settlePaystackTopup(
  walletTransactionId: string,
  providerReference?: string,
  channel?: string
): Promise<{ ok: boolean; alreadySettled: boolean }> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.walletTransaction.findUnique({
      where: { id: walletTransactionId },
    });
    if (!existing) return { ok: false, alreadySettled: false };
    if (existing.status === "APPROVED") return { ok: true, alreadySettled: true };
    if (existing.status !== "PENDING") return { ok: false, alreadySettled: false };

    const updateData: { status: string; note: string; reference?: string } = {
      status: "APPROVED",
      note: `Paystack instant top-up${channel ? ` (${channel})` : ""}`,
    };
    if (providerReference) {
      updateData.reference = providerReference;
    }

    const result = await tx.walletTransaction.updateMany({
      where: { id: walletTransactionId, status: "PENDING" },
      data: updateData,
    });
    if (result.count === 0) return { ok: true, alreadySettled: true };

    await tx.user.update({
      where: { id: existing.userId },
      data: { balance: { increment: existing.amount } },
    });
    return { ok: true, alreadySettled: false };
  });
}

export interface VerifyAndSettleResult {
  settled: boolean;
  alreadySettled: boolean;
  status?: string;
  channel?: string;
  reason?: string;
  transactionId?: string;
  amount?: number;
}

/**
 * Verifies with Paystack API and automatically settles a pending top-up.
 * Idempotent, safe to call from webhooks, callbacks, pollers, or user endpoints.
 */
export async function verifyAndSettlePaystackTopup(
  identifier: { id?: string; reference?: string } | string
): Promise<VerifyAndSettleResult> {
  const refOrId = typeof identifier === "string" ? identifier.trim() : "";
  const id = typeof identifier === "object" ? identifier.id?.trim() : undefined;
  const reference = typeof identifier === "object" ? identifier.reference?.trim() : undefined;

  const orConditions: Array<{ id?: string; reference?: string }> = [];
  if (id) orConditions.push({ id });
  if (reference) orConditions.push({ reference });
  if (refOrId) {
    orConditions.push({ id: refOrId }, { reference: refOrId });
  }

  if (orConditions.length === 0) {
    return { settled: false, alreadySettled: false, reason: "No identifier provided" };
  }

  const tx = await prisma.walletTransaction.findFirst({
    where: { OR: orConditions },
  });

  if (!tx) {
    return { settled: false, alreadySettled: false, reason: "Transaction not found" };
  }

  if (tx.type !== "TOPUP") {
    return { settled: false, alreadySettled: false, reason: "Not a top-up transaction", transactionId: tx.id };
  }

  if (tx.status === "APPROVED") {
    return { settled: true, alreadySettled: true, transactionId: tx.id, amount: tx.amount };
  }

  if (tx.status !== "PENDING") {
    return { settled: false, alreadySettled: false, reason: `Transaction is ${tx.status}`, transactionId: tx.id };
  }

  const lookupRef = tx.reference || reference || (refOrId.startsWith("PSK-") ? refOrId : null);
  if (!lookupRef) {
    return { settled: false, alreadySettled: false, reason: "Missing Paystack reference", transactionId: tx.id };
  }

  let verification: PaystackVerification;
  try {
    verification = await verifyTransaction(lookupRef);
  } catch (err) {
    return {
      settled: false,
      alreadySettled: false,
      reason: err instanceof Error ? err.message : "Paystack verification failed",
      transactionId: tx.id,
    };
  }

  const expectedPesewas = Math.round(tx.amount * 100);

  if (
    verification.status === "success" &&
    verification.currency === PAYSTACK_CURRENCY &&
    verification.amount === expectedPesewas
  ) {
    const result = await settlePaystackTopup(tx.id, lookupRef, verification.channel);
    return {
      settled: result.ok,
      alreadySettled: result.alreadySettled,
      status: verification.status,
      channel: verification.channel,
      transactionId: tx.id,
      amount: tx.amount,
    };
  }

  return {
    settled: false,
    alreadySettled: false,
    status: verification.status,
    reason: `Verification mismatch: status=${verification.status}, amount=${verification.amount} (expected ${expectedPesewas})`,
    transactionId: tx.id,
  };
}

/**
 * Automatically reconcile recent pending Paystack top-ups.
 * Safe to call from background pollers, cron jobs, or API endpoints.
 */
export async function reconcilePendingPaystackTopups(limit = 10): Promise<{
  checked: number;
  settled: number;
}> {
  if (!(await isPaystackConfigured())) {
    return { checked: 0, settled: 0 };
  }

  // Look for pending Paystack top-ups created in the last 24 hours
  const pendingTxs = await prisma.walletTransaction.findMany({
    where: {
      type: "TOPUP",
      status: "PENDING",
      reference: { startsWith: "PSK-" },
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  let settledCount = 0;
  for (const tx of pendingTxs) {
    try {
      const res = await verifyAndSettlePaystackTopup(tx.id);
      if (res.settled && !res.alreadySettled) {
        settledCount++;
      }
    } catch (err) {
      console.error(`Paystack auto-reconcile error for tx ${tx.id}:`, err);
    }
  }

  return { checked: pendingTxs.length, settled: settledCount };
}

