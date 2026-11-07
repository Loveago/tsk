import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";
import { deliveryReportCode, sanitizeCustomerRefundNote } from "@/lib/types";

export const WEBHOOK_EVENTS = [
  "order.created",
  "order.processing",
  "order.completed",
  "order.failed",
  "order.cancelled",
  "report.not_received.submitted",
  "report.not_received.confirmed_sent",
  "report.not_received.resolved",
] as const;

export type WebhookEvent = typeof WEBHOOK_EVENTS[number];

/** Returns the canonical base URL for public/API links (images, callbacks) */
export function getBaseAppUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  return "https://tskconnect.com";
}

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
        "X-External-Signature": `sha256=${signature}`,
        "X-Clickyfied-Signature": `sha256=${signature}`,
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

/**
 * Sends a webhook payload directly to a custom URL (e.g. from order callbackUrl).
 */
export async function sendDirectWebhook(
  url: string,
  event: string,
  payload: Record<string, any>,
  secret?: string | null
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const payloadString = JSON.stringify(payload);
    const sig = secret ? computeWebhookSignature(payloadString, secret, timestamp) : "";

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "Tskconnect-Webhooks/1.0",
      "X-Tskconnect-Timestamp": String(timestamp),
      "X-Tskconnect-Event": event,
    };
    if (sig) {
      headers["X-Tskconnect-Signature"] = `sha256=${sig}`;
      headers["X-External-Signature"] = `sha256=${sig}`;
      headers["X-Clickyfied-Signature"] = `sha256=${sig}`;
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: payloadString,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    return { success: res.status >= 200 && res.status < 300, statusCode: res.status };
  } catch (err: any) {
    return { success: false, error: err?.message || "Direct webhook failed" };
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

    // Check if event is in the subscribed events list.
    // If it's a report event, also allow delivery if subscribed list is present.
    const subscribed = webhook.events.split(",").map((e) => e.trim());
    const isReportEvent = event.startsWith("report.not_received.");
    if (!subscribed.includes(event) && !subscribed.includes("*") && !isReportEvent) {
      return null;
    }

    // Structure payload with both Clickyfied standard and Tskconnect envelope
    const payloadObject =
      payload.report !== undefined && (payload.orderId !== undefined || payload.externalReference !== undefined)
        ? {
            event,
            timestamp: new Date().toISOString(),
            ...payload,
            data: payload.data || payload.report || payload,
          }
        : {
            event,
            timestamp: new Date().toISOString(),
            data: payload,
            ...payload,
          };

    const payloadString = JSON.stringify(payloadObject);

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
 * Dispatches complete Not Received feedback (status, admin notes, evidence image)
 * to third-party website listeners via both ApiWebhook and order callbackUrl.
 */
export async function dispatchNotReceivedFeedback(params: {
  reportId: string;
  eventName: "report.not_received.submitted" | "report.not_received.confirmed_sent" | "report.not_received.resolved";
  status: "pending_resolution" | "confirmed_sent" | "resolved" | "cancelled" | "refunded";
  adminNotes?: string | null;
  evidenceUrl?: string | null;
  resolutionDate?: string | Date | null;
  actorLabel?: string;
}): Promise<void> {
  try {
    const report = await prisma.deliveryReport.findUnique({
      where: { id: params.reportId },
      include: {
        order: {
          select: {
            id: true,
            userId: true,
            phoneNumber: true,
            gbAmount: true,
            amount: true,
            externalReference: true,
            providerReference: true,
            batchId: true,
            batch: { select: { batchCode: true } },
          },
        },
      },
    });

    if (!report || !report.order) return;

    const appBaseUrl = getBaseAppUrl();

    // Resolve public evidence URL
    let evidenceUrl = params.evidenceUrl?.trim() || null;
    if (evidenceUrl && !evidenceUrl.startsWith("http://") && !evidenceUrl.startsWith("https://")) {
      evidenceUrl = `${appBaseUrl}${evidenceUrl.startsWith("/") ? "" : "/"}${evidenceUrl}`;
    }
    if (!evidenceUrl && report.proofImage) {
      evidenceUrl = `${appBaseUrl}/api/evidence/${report.seq}`;
    }

    const externalOrderId =
      report.order.externalReference ||
      report.order.batch?.batchCode ||
      `API-${report.order.id}`;

    const dateIso = params.resolutionDate
      ? new Date(params.resolutionDate).toISOString()
      : new Date().toISOString();

    const note =
      sanitizeCustomerRefundNote(
        params.adminNotes || report.adminResponse || report.adminNote,
        report.order.amount
      ) ||
      params.adminNotes ||
      report.adminResponse ||
      report.adminNote ||
      null;

    const reportData = {
      reportId: report.seq,
      reportCode: deliveryReportCode(report.seq),
      orderId: externalOrderId,
      internalOrderId: `API-${report.order.id}`,
      externalReference: report.order.externalReference || null,
      orderEntryId: report.order.id,
      number: report.order.phoneNumber,
      allocationGb: report.order.gbAmount,
      status: params.status,
      reportDate: report.createdAt.toISOString(),
      confirmationDate:
        params.status === "confirmed_sent" || params.status === "resolved" ? dateIso : undefined,
      resolutionDate: params.status === "resolved" ? dateIso : undefined,
      adminNotes: note,
      evidenceUrl,
      proofImageUrl: evidenceUrl,
      evidenceType: evidenceUrl ? "screenshot" : null,
    };

    const webhookPayload = {
      event: params.eventName,
      orderId: externalOrderId,
      clientId: report.userId,
      confirmedAt: params.status === "confirmed_sent" ? dateIso : undefined,
      resolvedAt: params.status === "resolved" ? dateIso : undefined,
      submittedAt:
        params.eventName === "report.not_received.submitted"
          ? report.createdAt.toISOString()
          : undefined,
      timestamp: dateIso,
      report: reportData,
      data: reportData,
    };

    // 1. Deliver to custom callbackUrl if configured on report note
    const noteStr = `${report.adminNote || ""} ${report.reason || ""} ${report.message || ""}`;
    const matchUrl = noteStr.match(/\[CALLBACK_URL:([^\]]+)\]/);
    const customCallbackUrl = matchUrl ? matchUrl[1].trim() : null;
    const matchSecret = noteStr.match(/\[CALLBACK_SECRET:([^\]]+)\]/);
    const customCallbackSecret = matchSecret ? matchSecret[1].trim() : null;

    if (customCallbackUrl) {
      sendDirectWebhook(customCallbackUrl, params.eventName, webhookPayload, customCallbackSecret).catch(
        (err) => {
          console.error("[sendDirectWebhook error]", err);
        }
      );
    }

    // 2. Deliver to account ApiWebhook
    await dispatchWebhookEvent(
      report.userId,
      params.eventName,
      webhookPayload,
      report.order.id
    );
  } catch (err) {
    console.error("[dispatchNotReceivedFeedback error]", err);
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

