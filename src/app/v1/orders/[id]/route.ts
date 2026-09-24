import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  validateApiAuth,
  formatApiSuccess,
  formatApiError,
  logApiRequestEntry,
  ApiError,
} from "@/lib/developer-api";
import { sanitizeCustomerRefundNote } from "@/lib/types";
import { formatBatchOrderPayload } from "@/lib/api-batch-orders";

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

    const upperId = id.trim().toUpperCase();
    const candidateBatchCode = upperId.replace(/^API-/, "").trim();

    // 1. Check if ID matches an OrderBatch
    const batch = await prisma.orderBatch.findFirst({
      where: {
        OR: [
          { batchCode: candidateBatchCode },
          { id: id.trim() },
        ],
        userId: authContext.userId,
      },
      include: {
        orders: {
          where: { isSandbox: authContext.isSandbox },
          orderBy: { id: "asc" },
        },
      },
    });

    if (batch && batch.orders.length > 0) {
      // Sync any in-flight Clickyfied orders in batch
      const inFlightClickyfied = batch.orders.filter(
        (o) =>
          (o.status === "PENDING" || o.status === "PROCESSING") &&
          o.providerReference?.startsWith("CLICKYFIED:")
      );
      if (inFlightClickyfied.length > 0) {
        try {
          const { syncClickyfiedOrder } = await import("@/lib/provider-apis/router");
          await Promise.allSettled(
            inFlightClickyfied.slice(0, 10).map(async (o) => {
              const syncRes = await syncClickyfiedOrder(o, "Developer API Batch Query");
              if (syncRes.changed && syncRes.newStatus) {
                o.status = syncRes.newStatus;
              }
            })
          );
        } catch (syncErr) {
          console.error("Developer API batch sync error:", syncErr);
        }
      }

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

      const payload = formatBatchOrderPayload({
        batchCode: batch.batchCode,
        externalReference: batch.orders[0]?.externalReference || batch.batchCode,
        orders: batch.orders,
        cost: batch.totalAmount,
        isSandbox: authContext.isSandbox,
        createdAt: batch.createdAt,
        updatedAt: batch.updatedAt,
      });

      return formatApiSuccess(payload, requestId, 200, authContext.rateLimit);
    }

    // 2. Parse single order ID: e.g. "API-839201", "CLK-839201" or "839201"
    const cleanId = upperId.replace(/^(API|CLK)-/, "").trim();
    const numericId = parseInt(cleanId, 10);

    if (isNaN(numericId) || numericId <= 0) {
      throw new ApiError("INVALID_REQUEST", "Invalid order ID format. Example: API-12345 or API-CF-BATCH-000185", 400);
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

    if (
      (order.status === "PENDING" || order.status === "PROCESSING") &&
      order.providerReference?.startsWith("CLICKYFIED:")
    ) {
      try {
        const { syncClickyfiedOrder } = await import("@/lib/provider-apis/router");
        const syncRes = await syncClickyfiedOrder(order, "Developer API Query");
        if (syncRes.changed && syncRes.newStatus) {
          order.status = syncRes.newStatus;
        }
      } catch (syncErr) {
        console.error("Developer API order sync error:", syncErr);
      }
    }

    const displayStatus = order.isSandbox
      ? (order.status === "SUCCESS" ? "TEST_COMPLETED" : order.status)
      : (order.status === "SUCCESS" ? "COMPLETED" : order.status);

    const orderData = {
      orderId: `API-${order.id}`,
      id: order.id,
      reference: order.externalReference || null,
      network: order.network,
      package: order.dataPackage?.name || `${order.gbAmount}GB`,
      gbAmount: order.gbAmount,
      recipient: order.phoneNumber,
      amount: order.amount,
      status: displayStatus,
      failureReason: sanitizeCustomerRefundNote(order.failureReason, order.amount) || null,
      isSandbox: order.isSandbox,
      deliveryReport: order.deliveryReports?.[0] ? {
        id: order.deliveryReports[0].id,
        status: order.deliveryReports[0].status,
        reason: order.deliveryReports[0].reason,
        adminResponse: sanitizeCustomerRefundNote(order.deliveryReports[0].adminResponse, order.amount),
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
