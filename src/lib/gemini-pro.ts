import { prisma } from "@/lib/prisma";
import { verifyTransaction, calculatePaystackFee } from "@/lib/paystack";

export * from "./gemini-pro-constants";

export const DEFAULT_GEMINI_PRICE_GHS = 50;

/**
 * Retrieves the Gemini Pro settings for the data-deals storefront.
 */
export async function getGeminiProSettings(): Promise<{
  enabled: boolean;
  price: number;
}> {
  const [enabledSetting, priceSetting] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { key: "data_deals_gemini_pro_enabled" } }),
    prisma.systemSetting.findUnique({ where: { key: "data_deals_gemini_pro_price" } }),
  ]);

  const enabled = enabledSetting?.value === "true";
  const parsedPrice = priceSetting ? parseFloat(priceSetting.value) : DEFAULT_GEMINI_PRICE_GHS;
  const price = !isNaN(parsedPrice) && parsedPrice > 0 ? parsedPrice : DEFAULT_GEMINI_PRICE_GHS;

  return { enabled, price };
}

/**
 * Updates Gemini Pro settings for the data-deals storefront.
 */
export async function updateGeminiProSettings(input: {
  enabled?: boolean;
  price?: number;
}): Promise<{ enabled: boolean; price: number }> {
  const updates: Promise<unknown>[] = [];

  if (typeof input.enabled === "boolean") {
    updates.push(
      prisma.systemSetting.upsert({
        where: { key: "data_deals_gemini_pro_enabled" },
        create: { key: "data_deals_gemini_pro_enabled", value: input.enabled ? "true" : "false" },
        update: { value: input.enabled ? "true" : "false" },
      })
    );
  }

  if (typeof input.price === "number" && input.price > 0) {
    updates.push(
      prisma.systemSetting.upsert({
        where: { key: "data_deals_gemini_pro_price" },
        create: { key: "data_deals_gemini_pro_price", value: input.price.toFixed(2) },
        update: { value: input.price.toFixed(2) },
      })
    );
  }

  await Promise.all(updates);
  return getGeminiProSettings();
}

/**
 * Generates an order code / payment reference for Gemini Pro orders.
 */
export function generateGeminiOrderReference(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let random = "";
  for (let i = 0; i < 6; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `GMP-${Date.now().toString().slice(-4)}${random}`;
}

export async function nextGeminiSeq(): Promise<number> {
  const agg = await prisma.geminiProOrder.aggregate({ _max: { seq: true } });
  return (agg._max.seq ?? 0) + 1;
}

/**
 * Verifies Paystack payment and settles a Gemini Pro order.
 */
export async function verifyAndSettleGeminiOrder(reference: string): Promise<{
  settled: boolean;
  order?: any;
  reason?: string;
}> {
  const order = await prisma.geminiProOrder.findUnique({
    where: { paymentReference: reference },
  });

  if (!order) {
    return { settled: false, reason: "Order not found" };
  }

  if (order.paystackStatus === "PAID") {
    return { settled: true, order };
  }

  try {
    const verification = await verifyTransaction(reference);
    if (verification.status === "success") {
      const updated = await prisma.geminiProOrder.update({
        where: { id: order.id },
        data: {
          paystackStatus: "PAID",
          paidAt: verification.paidAt ? new Date(verification.paidAt) : new Date(),
        },
      });
      return { settled: true, order: updated };
    }

    if (verification.status === "failed") {
      await prisma.geminiProOrder.update({
        where: { id: order.id },
        data: { paystackStatus: "FAILED" },
      });
      return { settled: false, reason: "Payment failed" };
    }

    return { settled: false, reason: `Status: ${verification.status}` };
  } catch (err) {
    return {
      settled: false,
      reason: err instanceof Error ? err.message : "Payment verification error",
    };
  }
}
