import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";

export const WEBHOOK_EVENTS = [
  "order.created",
  "order.processing",
  "order.completed",
  "order.failed",
  "order.cancelled",
] as const;

export type WebhookEvent = typeof WEBHOOK_EVENTS[number];

export function computeWebhookSignature(payload: string, secret: string, timestamp: number): string {
  const content = `${timestamp}.${payload}`;
  return createHmac("sha256", secret).update(content).digest("hex");
}

export function verifyWebhookSignature(payload: string, secret: string, header: string, timestamp: number): boolean {
  try {
    const expected = computeWebhookSignature(payload, secret, timestamp);
    const cleanHeader = header.replace(/^sha256=/, "");
    return expected === cleanHeader;
  } catch {
    return false;
  }
}

/**
 * Calculates exponential backoff delay in milliseconds based on attempt number.
 * Attempt 1: ~1 minute
 * Attempt 2: ~5 minutes
 * Attempt 3: ~30 minutes
 * Attempt 4: ~2 hours
 * Attempt 5: ~6 hours
 */
export function getRetryDelayMs(attempt: number): number {
  switch (attempt) {
    case 1:
      return 60 * 1000;
    case 2:
      return 5 * 60 * 1000;
    case 3:
      return 30 * 60 * 1000;
    case 4:
      return 2 * 60 * 60 * 1000;
    default:
      return 6 * 60 * 60 * 1000;
  }
}

export async function deliverWebhook(deliveryId: string): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  const delivery = await prisma.apiWebhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { webhook: true },
  });

  if (!delivery || !delivery.webhook) {
    return { success: false, error: "Delivery or webhook not found" };
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = computeWebhookSignature(delivery.payload, delivery.webhook.secret, timestamp);
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const res = await fetch(delivery.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Tskconnect-Webhooks/1.0",
        "X-Tskconnect-Signature": `sha256=${signature}`,
        "X-Tskconnect-Timestamp": String(timestamp),
        "X-Tskconnect-Event": delivery.event,
        "X-Tskconnect-Delivery": delivery.id,
      },
      body: delivery.payload,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const responseTimeMs = Date.now() - startTime;
    let responseBody = "";
    try {
      responseBody = (await res.text()).slice(0, 1000);
    } catch {
      responseBody = "";
    }

    const success = res.status >= 200 && res.status < 300;
    const isLastAttempt = delivery.attempt >= delivery.maxAttempts;
    const nextRetryAt = success || isLastAttempt ? null : new Date(Date.now() + getRetryDelayMs(delivery.attempt));

    await prisma.apiWebhookDelivery.update({
      where: { id: delivery.id },
      data: {
        statusCode: res.status,
        responseTimeMs,
        responseBody,
        signature,
        status: success ? "SUCCESS" : "FAILED",
        error: success ? null : `HTTP status ${res.status}`,
        deliveredAt: success ? new Date() : null,
        nextRetryAt,
      },
    });

    return { success, statusCode: res.status };
  } catch (err: any) {
    const responseTimeMs = Date.now() - startTime;
    const isLastAttempt = delivery.attempt >= delivery.maxAttempts;
    const nextRetryAt = isLastAttempt ? null : new Date(Date.now() + getRetryDelayMs(delivery.attempt));
    const errorMsg = err.name === "AbortError" ? "Request timed out after 10 seconds" : err.message || "Network error";

    await prisma.apiWebhookDelivery.update({
      where: { id: delivery.id },
      data: {
        responseTimeMs,
        signature,
        status: "FAILED",
        error: errorMsg,
        nextRetryAt,
      },
    });

    return { success: false, error: errorMsg };
  }
}

export async function dispatchWebhookEvent(
  userId: string,
  event: WebhookEvent,
  payload: Record<string, any>,
  orderId?: number
): Promise<string | null> {
  try {
    const webhook = await prisma.apiWebhook.findUnique({
      where: { userId },
    });

    if (!webhook || !webhook.active || !webhook.url) {
      return null;
    }

    // Check if event is in the subscribed events list
    const subscribed = webhook.events.split(",").map((e) => e.trim());
    if (!subscribed.includes(event) && !subscribed.includes("*")) {
      return null;
    }

    const payloadString = JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      data: payload,
    });

    const delivery = await prisma.apiWebhookDelivery.create({
      data: {
        webhookId: webhook.id,
        event,
        orderId: orderId ?? null,
        url: webhook.url,
        payload: payloadString,
        status: "PENDING",
      },
    });

    // Deliver asynchronously
    deliverWebhook(delivery.id).catch((err) => {
      console.error("[webhook dispatch error]", err);
    });

    return delivery.id;
  } catch (err) {
    console.error("[dispatchWebhookEvent]", err);
    return null;
  }
}

/**
 * Finds and retries any webhook deliveries that are past their nextRetryAt time.
 */
export async function processDueWebhookRetries(limit = 50): Promise<{ processed: number; successful: number; failed: number }> {
  try {
    const dueDeliveries = await prisma.apiWebhookDelivery.findMany({
      where: {
        status: "FAILED",
        nextRetryAt: { lte: new Date() },
      },
      take: limit,
      orderBy: { nextRetryAt: "asc" },
    });

    const eligible = dueDeliveries.filter((d) => d.attempt < d.maxAttempts);

    let successful = 0;
    let failed = 0;

    for (const delivery of eligible) {
      await prisma.apiWebhookDelivery.update({
        where: { id: delivery.id },
        data: {
          attempt: { increment: 1 },
          status: "PENDING",
        },
      });

      const result = await deliverWebhook(delivery.id);
      if (result.success) {
        successful++;
      } else {
        failed++;
      }
    }

    return { processed: eligible.length, successful, failed };
  } catch (err) {
    console.error("[processDueWebhookRetries]", err);
    return { processed: 0, successful: 0, failed: 0 };
  }
}

