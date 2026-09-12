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
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Request-ID",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const start = Date.now();
  const { id } = await params;
  const endpoint = `/v1/orders/${id}`;
  let requestId = "req_initial";
  let authContext: any = null;

  try {
    authContext = await validateApiAuth(request, { requiredScope: "orders:read" });
    requestId = authContext.requestId;

    // Parse order ID: e.g. "CLK-839201" or "839201"
    const cleanId = id.toUpperCase().replace(/^CLK-/, "").trim();
    const numericId = parseInt(cleanId, 10);

    if (isNaN(numericId) || numericId <= 0) {
      throw new ApiError("INVALID_REQUEST", "Invalid order ID format. Example: CLK-12345 or 12345", 400);
    }

    const order = await prisma.order.findFirst({
      where: {
        id: numericId,
        userId: authContext.userId, // Strictly scoped to authenticated user
        isSandbox: authContext.isSandbox, // Strictly scoped to environment
      },
      include: {
        dataPackage: { select: { name: true } },
        deliveryReports: {
          select: {
            id: true,
            status: true,
            reason: true,
            adminResponse: true,
            adminNote: true,
            createdAt: true,
            resolvedAt: true,
          },
          take: 1,
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!order) {
      throw new ApiError("ORDER_NOT_FOUND", `Order ${id} not found`, 404);
    }

    const displayStatus = order.isSandbox
      ? (order.status === "SUCCESS" ? "TEST_COMPLETED" : order.status)
      : (order.status === "SUCCESS" ? "COMPLETED" : order.status);

    const orderData = {
      orderId: `CLK-${order.id}`,
      id: order.id,
      reference: order.externalReference || null,
      network: order.network,
      package: order.dataPackage?.name || `${order.gbAmount}GB`,
      gbAmount: order.gbAmount,
      recipient: order.phoneNumber,
      amount: order.amount,
      status: displayStatus,
      failureReason: order.failureReason || null,
      isSandbox: order.isSandbox,
      deliveryReport: order.deliveryReports?.[0] ? {
        id: order.deliveryReports[0].id,
        status: order.deliveryReports[0].status,
        reason: order.deliveryReports[0].reason,
        adminResponse: order.deliveryReports[0].adminResponse,
        adminNote: order.deliveryReports[0].adminNote,
        createdAt: order.deliveryReports[0].createdAt.toISOString(),
        resolvedAt: order.deliveryReports[0].resolvedAt?.toISOString() || null,
      } : null,
      createdAt: order.createdAt.toISOString(),
      completedAt: order.completedAt?.toISOString() || null,
    };

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

    return formatApiSuccess(orderData, requestId, 200, authContext.rateLimit);
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
