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
  providerReference: string,
  channel?: string
): Promise<{ ok: boolean; alreadySettled: boolean }> {
  return prisma.$transaction(async (tx) => {
    const result = await tx.walletTransaction.updateMany({
      where: { id: walletTransactionId, status: "PENDING" },
      data: {
        status: "APPROVED",
        reference: providerReference,
        note: `Paystack instant top-up${channel ? ` (${channel})` : ""}`,
      },
    });
    if (result.count === 0) return { ok: false, alreadySettled: true };

    const wt = await tx.walletTransaction.findUniqueOrThrow({
      where: { id: walletTransactionId },
    });
    await tx.user.update({
      where: { id: wt.userId },
      data: { balance: { increment: wt.amount } },
    });
    return { ok: true, alreadySettled: false };
  });
}
