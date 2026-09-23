import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { deliverWebhook } from "@/lib/webhooks";

export async function POST() {
  try {
    const user = await requireUser();
    const webhook = await prisma.apiWebhook.findUnique({
      where: { userId: user.id },
    });

    if (!webhook || !webhook.url) {
      return apiError(400, "Please configure your webhook URL first");
    }

    const testPayload = JSON.stringify({
      event: "order.completed",
      test: true,
      timestamp: new Date().toISOString(),
      data: {
        orderId: "API-TEST0001",
        reference: "SHOP-TEST-REF",
        network: "MTN",
        package: "1GB",
        recipient: "0241234567",
        amount: 3.8,
        status: "COMPLETED",
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
    });

    const delivery = await prisma.apiWebhookDelivery.create({
      data: {
        webhookId: webhook.id,
        event: "order.completed",
        payload: testPayload,
        url: webhook.url,
        status: "PENDING",
      },
    });

    const result = await deliverWebhook(delivery.id);

    const updated = await prisma.apiWebhookDelivery.findUnique({
      where: { id: delivery.id },
    });

    return NextResponse.json({
      success: result.success,
      delivery: {
        id: updated?.id,
        status: updated?.status,
        statusCode: updated?.statusCode,
        responseTimeMs: updated?.responseTimeMs,
        responseBody: updated?.responseBody,
        error: updated?.error,
        createdAt: updated?.createdAt,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
