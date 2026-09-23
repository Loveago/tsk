import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  validateApiAuth,
  formatApiSuccess,
  formatApiError,
  logApiRequestEntry,
  ApiError,
} from "@/lib/developer-api";
import { deliverWebhook } from "@/lib/webhooks";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Request-ID",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  const endpoint = "/v1/webhooks/test";
  let requestId = "req_initial";
  let authContext: any = null;

  try {
    authContext = await validateApiAuth(request, { requiredScope: "webhooks:manage" });
    requestId = authContext.requestId;

    const webhook = await prisma.apiWebhook.findUnique({
      where: { userId: authContext.userId },
    });

    if (!webhook || !webhook.url) {
      throw new ApiError(
        "INVALID_REQUEST",
        "No webhook endpoint configured. Configure a webhook URL first.",
        400
      );
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

    // Create delivery record
    const delivery = await prisma.apiWebhookDelivery.create({
      data: {
        webhookId: webhook.id,
        event: "order.completed",
        payload: testPayload,
        url: webhook.url,
        status: "PENDING",
      },
    });

    // Attempt delivery synchronously for immediate feedback
    const result = await deliverWebhook(delivery.id);

    const updatedDelivery = await prisma.apiWebhookDelivery.findUnique({
      where: { id: delivery.id },
    });

    await logApiRequestEntry({
      userId: authContext.userId,
      credentialId: authContext.credentialId,
      endpoint,
      method: "POST",
      status: 200,
      success: result.success,
      ip: authContext.clientIp,
      userAgent: authContext.userAgent,
      environment: authContext.environment,
      responseTimeMs: Date.now() - start,
      requestId,
    });

    return formatApiSuccess(
      {
        delivered: result.success,
        statusCode: updatedDelivery?.statusCode || null,
        responseTimeMs: updatedDelivery?.responseTimeMs || null,
        responseBody: updatedDelivery?.responseBody || null,
        error: updatedDelivery?.error || null,
        deliveryId: delivery.id,
        url: webhook.url,
      },
      requestId,
      200,
      authContext.rateLimit
    );
  } catch (err: any) {
    const status = err instanceof ApiError ? err.status : 500;
    const code = err instanceof ApiError ? err.code : "SERVER_ERROR";
    const message = err.message || "An unexpected error occurred";

    await logApiRequestEntry({
      userId: authContext?.userId,
      credentialId: authContext?.credentialId,
      endpoint,
      method: "POST",
      status,
      success: false,
      ip: authContext?.clientIp,
      userAgent: authContext?.userAgent,
      environment: authContext?.environment,
      errorCode: code,
      responseTimeMs: Date.now() - start,
      requestId,
    });

    return formatApiError(code, message, status, requestId, err.rateLimitInfo);
  }
}
