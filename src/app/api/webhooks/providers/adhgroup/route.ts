import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { changeOrderStatus } from "@/lib/orders";
import { getProviderRoutingConfig } from "@/lib/provider-apis/router";
import { verifyAdhgroupWebhookSignature } from "@/lib/provider-apis/adhgroup";
import { recordOrderApiLog } from "@/lib/order-api-logs";

async function processAdhWebhookItem(item: {
  orderId?: string;
  order_code?: string;
  reference?: string;
  status?: string;
  reason?: string;
}, rawPayload: unknown) {
  const orderId = item.orderId || item.order_code || item.reference;
  if (!orderId) return { updated: false };

  const providerRef = `ADH:${orderId}`;
  const order = await prisma.order.findFirst({
    where: { providerReference: providerRef },
    select: { id: true, status: true, network: true, providerReference: true },
  });
  if (!order) return { updated: false };

  const rawStatus = (item.status || "").toLowerCase().trim();
  if (!rawStatus) return { updated: false };

  // If MTN order is rejected/restricted asynchronously, hold in ADH_REJECTED
  if (
    order.network.toUpperCase().includes("MTN") &&
    (rawStatus.includes("reject") || rawStatus.includes("restrict") || rawStatus.includes("ineligible"))
  ) {
    const rejectReason = item.reason || `ADH Group webhook status: ${rawStatus}`;
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "PENDING",
        providerReference: "ADH_REJECTED",
        failureReason: `ADH Group MTN Rejection: ${rejectReason}`,
      },
    });
    await prisma.orderStatusHistory.create({
      data: {
        orderId: order.id,
        status: "PENDING",
        previousStatus: order.status,
        note: `Moved to ADH Rejections via webhook (${rawStatus}): ${rejectReason}`,
        changedBy: "ADH Group Webhook",
      },
    });
    await recordOrderApiLog({
      orderId: order.id,
      provider: "ADHGROUP",
      action: "WEBHOOK",
      endpoint: "/api/webhooks/providers/adhgroup",
      method: "POST",
      statusCode: 200,
      success: false,
      errorMessage: `MTN Rejection: ${rejectReason}`,
      responsePayload: rawPayload,
      providerReference: order.providerReference,
    });
    return { updated: true, status: "PENDING" };
  }

  let targetStatus: "PROCESSING" | "SUCCESS" | "FAILED" | null = null;
  if (["processed", "completed", "delivered", "success", "successful"].includes(rawStatus)) {
    targetStatus = "SUCCESS";
  } else if (["failed", "error", "cancelled", "canceled", "refunded"].includes(rawStatus)) {
    targetStatus = "FAILED";
  } else if (["processing", "pending", "queued", "accepted", "in_progress"].includes(rawStatus)) {
    targetStatus = "PROCESSING";
  }

  if (targetStatus && targetStatus !== order.status) {
    await recordOrderApiLog({
      orderId: order.id,
      provider: "ADHGROUP",
      action: "WEBHOOK",
      endpoint: "/api/webhooks/providers/adhgroup",
      method: "POST",
      statusCode: 200,
      success: targetStatus === "SUCCESS",
      errorMessage: targetStatus === "FAILED" ? `Order marked as ${rawStatus} by ADH Group webhook` : null,
      responsePayload: rawPayload,
      providerReference: order.providerReference,
    });

    await changeOrderStatus(
      order.id,
      targetStatus,
      `Delivery status updated via ADH Group webhook (${rawStatus})`,
      { id: "system", label: "ADH Group Webhook" },
      { force: true }
    );
    return { updated: true, status: targetStatus };
  }

  return { updated: false };
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature =
    request.headers.get("x-webhook-signature") ||
    request.headers.get("x-adh-signature");
  const eventHeader = request.headers.get("x-webhook-event");

  try {
    const config = await getProviderRoutingConfig();
    const secret = config.adhgroup.webhookSecret?.trim();
    if (secret && !verifyAdhgroupWebhookSignature(rawBody, signature, secret)) {
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }
  } catch (err) {
    console.error("[ADHGROUP Webhook] Config error:", err);
  }

  let payload: any = null;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const eventName = payload?.event || eventHeader || "";
  if (eventName === "webhook.test" || eventName === "balance.low") {
    return NextResponse.json({ received: true, event: eventName });
  }

  if (eventName === "order.status.updated" || payload?.orderId || Array.isArray(payload?.items)) {
    let processedCount = 0;
    if (Array.isArray(payload?.items) && payload.items.length > 0) {
      for (const item of payload.items) {
        const res = await processAdhWebhookItem(
          {
            ...item,
            status: item.status || payload.status,
          },
          payload
        );
        if (res.updated) processedCount++;
      }
    } else {
      const res = await processAdhWebhookItem(payload, payload);
      if (res.updated) processedCount++;
    }
    return NextResponse.json({ received: true, processedCount });
  }

  return NextResponse.json({ received: true });
}
