import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { changeOrderStatus } from "@/lib/orders";
import { BigwindataClient } from "@/lib/provider-apis/bigwindata";
import { getProviderRoutingConfig } from "@/lib/provider-apis/router";
import { recordAudit } from "@/lib/audit";

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-pristarx-signature") || "";

    const config = await getProviderRoutingConfig();
    const client = new BigwindataClient(config.bigwindata);

    // If a webhook secret is configured, verify HMAC signature
    if (config.bigwindata.webhookSecret && signature) {
      const isValid = client.verifyWebhookSignature(rawBody, signature);
      if (!isValid) {
        return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
      }
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const event = payload?.event;
    const orderData = payload?.order;

    if (!event || !orderData) {
      return NextResponse.json({ received: true, note: "Ignored non-order payload" });
    }

    const bigwinOrderId = orderData.id;
    const bigwinRef = orderData.reference;

    // Search for order by Bigwindata reference
    let order = await prisma.order.findFirst({
      where: {
        OR: [
          ...(bigwinOrderId ? [{ providerReference: `BIGWIN:${bigwinOrderId}` }] : []),
          ...(bigwinRef ? [{ providerReference: `BIGWIN:${bigwinRef}` }] : []),
          ...(bigwinRef?.startsWith("TSK-ORD-")
            ? [{ id: parseInt(bigwinRef.replace("TSK-ORD-", ""), 10) }]
            : []),
        ],
      },
    });

    // Fallback: match by recipient number and recent creation time
    if (!order && orderData.recipient) {
      const tenMinutesAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      order = await prisma.order.findFirst({
        where: {
          phoneNumber: orderData.recipient,
          createdAt: { gte: tenMinutesAgo },
          providerReference: { startsWith: "BIGWIN:" },
        },
        orderBy: { createdAt: "desc" },
      });
    }

    if (!order) {
      // Order not found, but acknowledge receipt so provider doesn't endlessly retry
      return NextResponse.json({ received: true, matched: false });
    }

    let targetStatus: string | null = null;
    let reason: string | null = null;

    switch (event) {
      case "order.delivered":
        targetStatus = "SUCCESS";
        reason = "Delivered via Bigwindata";
        break;
      case "order.failed":
        targetStatus = "FAILED";
        reason = payload?.reason || "Delivery failed via Bigwindata";
        break;
      case "order.refunded":
        targetStatus = "REFUNDED";
        reason = "Refunded by Bigwindata provider";
        break;
      case "order.placed":
        targetStatus = "PROCESSING";
        reason = "Order accepted by Bigwindata queue";
        break;
    }

    if (targetStatus && targetStatus !== order.status) {
      await changeOrderStatus(
        order.id,
        targetStatus,
        reason,
        { id: "system", label: "Bigwindata Webhook" },
        { force: true }
      );

      await recordAudit({
        userId: order.userId,
        actorLabel: "Bigwindata Webhook",
        action: "order.webhook_update",
        target: `order:${order.id}`,
        newValue: JSON.stringify({ event, status: targetStatus, bigwinOrderId }),
      });
    }

    return NextResponse.json({ received: true, orderId: order.id, status: targetStatus });
  } catch (err: any) {
    console.error("Bigwindata webhook error:", err);
    return NextResponse.json({ error: err?.message || "Webhook processing error" }, { status: 500 });
  }
}
