import { NextRequest, NextResponse } from "next/server";
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
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Request-ID",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  const endpoint = "/v1/orders/status";
  let requestId = "req_initial";
  let authContext: any = null;

  try {
    authContext = await validateApiAuth(request, { requiredScope: "orders:status" });
    requestId = authContext.requestId;

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      throw new ApiError("INVALID_REQUEST", "Request body must be valid JSON", 400);
    }

    const rawIds = body.orderIds;
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      throw new ApiError("INVALID_REQUEST", "orderIds array is required and cannot be empty", 400);
    }

    if (rawIds.length > 100) {
      throw new ApiError("INVALID_REQUEST", "Maximum 100 order IDs per bulk status request", 400);
    }

    // Parse IDs
    const numericIds: number[] = [];
    const requestedMap = new Map<string, number>();

    for (const raw of rawIds) {
      const s = String(raw).trim().toUpperCase();
      const clean = s.replace(/^CLK-/, "");
      const num = parseInt(clean, 10);
      if (!isNaN(num) && num > 0) {
        numericIds.push(num);
        requestedMap.set(s, num);
      }
    }

    const orders = await prisma.order.findMany({
      where: {
        id: { in: numericIds },
        userId: authContext.userId, // Only return the authenticated user's orders
        isSandbox: authContext.isSandbox, // Strictly scoped to environment
      },
      include: {
        dataPackage: { select: { name: true } },
      },
    });

    const orderMap = new Map<number, any>();
    for (const o of orders) {
      orderMap.set(o.id, o);
    }

    const results = rawIds.map((origRaw: any) => {
      const s = String(origRaw).trim().toUpperCase();
      const num = requestedMap.get(s);
      const order = num ? orderMap.get(num) : null;

      if (!order) {
        return {
          orderId: s.startsWith("CLK-") ? s : `CLK-${s}`,
          found: false,
          status: null,
        };
      }

      const displayStatus = order.isSandbox
        ? (order.status === "SUCCESS" ? "TEST_COMPLETED" : order.status)
        : (order.status === "SUCCESS" ? "COMPLETED" : order.status);

      return {
        orderId: `CLK-${order.id}`,
        found: true,
        reference: order.externalReference || null,
        network: order.network,
        package: order.dataPackage?.name || `${order.gbAmount}GB`,
        recipient: order.phoneNumber,
        status: displayStatus,
        failureReason: order.failureReason || null,
        createdAt: order.createdAt.toISOString(),
        completedAt: order.completedAt?.toISOString() || null,
      };
    });

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

    return formatApiSuccess({ statuses: results }, requestId, 200, authContext.rateLimit);
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
