import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  validateApiAuth,
  formatApiSuccess,
  formatApiError,
  logApiRequestEntry,
  ApiError,
} from "@/lib/developer-api";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Request-ID",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function GET(request: NextRequest) {
  const start = Date.now();
  const endpoint = "/v1/webhooks";
  let requestId = "req_initial";
  let authContext: any = null;

  try {
    authContext = await validateApiAuth(request, { requiredScope: "webhooks:read" });
    requestId = authContext.requestId;

    const webhook = await prisma.apiWebhook.findUnique({
      where: { userId: authContext.userId },
      include: {
        deliveries: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

    const data = webhook
      ? {
          id: webhook.id,
          url: webhook.url,
          events: webhook.events.split(",").map((e) => e.trim()),
          active: webhook.active,
          createdAt: webhook.createdAt.toISOString(),
          updatedAt: webhook.updatedAt.toISOString(),
          deliveries: webhook.deliveries.map((d) => ({
            id: d.id,
            event: d.event,
            orderId: d.orderId ? `API-${d.orderId}` : null,
            status: d.status,
            statusCode: d.statusCode,
            attempt: d.attempt,
            maxAttempts: d.maxAttempts,
            responseTimeMs: d.responseTimeMs,
            error: d.error,
            deliveredAt: d.deliveredAt?.toISOString() || null,
            createdAt: d.createdAt.toISOString(),
          })),
        }
      : null;

    await logApiRequestEntry({
      userId: authContext.userId,
      credentialId: authContext.credentialId,
      endpoint,
      method: "GET",
      status: 200,
      success: true,
      ip: authContext.clientIp,
      userAgent: authContext.userAgent,
      environment: authContext.environment,
      responseTimeMs: Date.now() - start,
      requestId,
    });

    return formatApiSuccess(data, requestId, 200, authContext.rateLimit);
  } catch (err: any) {
    const status = err instanceof ApiError ? err.status : 500;
    const code = err instanceof ApiError ? err.code : "SERVER_ERROR";
    const message = err.message || "An unexpected error occurred";

    await logApiRequestEntry({
      userId: authContext?.userId,
      credentialId: authContext?.credentialId,
      endpoint,
      method: "GET",
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

export async function POST(request: NextRequest) {
  const start = Date.now();
  const endpoint = "/v1/webhooks";
  let requestId = "req_initial";
  let authContext: any = null;

  try {
    authContext = await validateApiAuth(request, { requiredScope: "webhooks:manage" });
    requestId = authContext.requestId;

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      throw new ApiError("INVALID_REQUEST", "Request body must be valid JSON", 400);
    }

    const rawUrl = String(body.url || "").trim();
    if (!rawUrl || (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://"))) {
      throw new ApiError("INVALID_REQUEST", "A valid http:// or https:// webhook URL is required", 400);
    }

    const eventsList = Array.isArray(body.events)
      ? body.events.join(",")
      : "order.created,order.processing,order.completed,order.failed,order.cancelled";

    const active = body.active !== undefined ? Boolean(body.active) : true;
    const rotateSecret = Boolean(body.rotateSecret);

    let webhook = await prisma.apiWebhook.findUnique({
      where: { userId: authContext.userId },
    });

    let newSecret: string | null = null;
    if (!webhook || rotateSecret) {
      newSecret = `whsec_${randomBytes(24).toString("hex")}`;
    }

    if (webhook) {
      webhook = await prisma.apiWebhook.update({
        where: { id: webhook.id },
        data: {
          url: rawUrl,
          events: eventsList,
          active,
          ...(newSecret ? { secret: newSecret } : {}),
        },
      });
    } else {
      webhook = await prisma.apiWebhook.create({
        data: {
          userId: authContext.userId,
          url: rawUrl,
          events: eventsList,
          active,
          secret: newSecret!,
        },
      });
    }

    await logApiRequestEntry({
      userId: authContext.userId,
      credentialId: authContext.credentialId,
      endpoint,
      method: "POST",
      status: 200,
      success: true,
      ip: authContext.clientIp,
      userAgent: authContext.userAgent,
      environment: authContext.environment,
      responseTimeMs: Date.now() - start,
      requestId,
    });

    return formatApiSuccess(
      {
        id: webhook.id,
        url: webhook.url,
        events: webhook.events.split(",").map((e) => e.trim()),
        active: webhook.active,
        // Only return secret if newly generated or rotated
        ...(newSecret ? { secret: newSecret } : {}),
        message: newSecret
          ? "Webhook secret generated. Store this secret securely — it is used to verify HMAC SHA-256 signatures."
          : "Webhook updated successfully.",
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
