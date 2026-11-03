import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  validateApiAuth,
  formatApiSuccess,
  formatApiError,
  logApiRequestEntry,
  ApiError,
} from "@/lib/developer-api";
import {
  isWithinReportWindow,
  ACTIVE_DELIVERY_REPORT_STATUSES,
  deliveryReportCode,
  sanitizeCustomerRefundNote,
} from "@/lib/types";
import { deriveCompletedAt, getSetting } from "@/lib/orders";
import { dispatchWebhookEvent } from "@/lib/webhooks";
import { normalizeGhanaPhoneNumber } from "@/lib/phone-utils";
import { normalizePhoneLast9, forwardNotReceivedToClickyfied } from "@/lib/provider-apis/router";
import { recordAudit } from "@/lib/audit";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Request-ID, X-Idempotency-Key",
      "Access-Control-Max-Age": "86400",
    },
  });
}

/**
 * Resolves an order or batch identifier to the specific target Order record.
 */
async function resolveTargetOrder(
  id: string,
  userId: string,
  isSandbox: boolean,
  body: any = {}
) {
  const upperId = id.trim().toUpperCase();
  const candidateBatchCode = upperId.replace(/^API-/, "").trim();

  // 1. Check if ID corresponds to a Batch Order
  const batch = await prisma.orderBatch.findFirst({
    where: {
      OR: [{ batchCode: candidateBatchCode }, { id: id.trim() }],
      userId,
    },
    include: {
      orders: {
        where: { isSandbox },
        orderBy: { id: "asc" },
      },
    },
  });

  if (batch && batch.orders.length > 0) {
    const entryIdVal = body.orderEntryId !== undefined && body.orderEntryId !== null
      ? Number(String(body.orderEntryId).replace(/^API-/, "").trim())
      : undefined;

    if (entryIdVal !== undefined && !isNaN(entryIdVal)) {
      const matched = batch.orders.find((o) => o.id === entryIdVal);
      if (!matched) {
        throw new ApiError(
          "ORDER_ENTRY_NOT_FOUND",
          `Order entry ${entryIdVal} does not exist in batch ${batch.batchCode}`,
          404
        );
      }
      return { order: matched, isBatch: true, batch };
    }

    if (body.number || body.phoneNumber) {
      const rawNum = String(body.number || body.phoneNumber).trim();
      const norm9 = normalizePhoneLast9(rawNum);
      const matched = batch.orders.find((o) => normalizePhoneLast9(o.phoneNumber) === norm9);
      if (!matched) {
        throw new ApiError(
          "ORDER_ENTRY_NOT_FOUND",
          `No order entry with phone number ${rawNum} was found in batch ${batch.batchCode}`,
          404
        );
      }
      return { order: matched, isBatch: true, batch };
    }

    if (batch.orders.length === 1) {
      return { order: batch.orders[0], isBatch: true, batch };
    }

    throw new ApiError(
      "MISSING_ENTRY_IDENTIFIER",
      `Batch ${batch.batchCode} contains ${batch.orders.length} entries. Please specify orderEntryId or number in the request body.`,
      400
    );
  }

  // 2. Parse Single Order ID: API-12345, CLK-12345, or 12345
  const cleanId = upperId.replace(/^(API|CLK)-/, "").trim();
  const numericId = parseInt(cleanId, 10);

  if (isNaN(numericId) || numericId <= 0) {
    throw new ApiError(
      "INVALID_ORDER_ID",
      "Invalid order ID format. Example: API-12345 or API-CF-BATCH-000185",
      400
    );
  }

  const order = await prisma.order.findFirst({
    where: {
      id: numericId,
      userId,
      isSandbox,
    },
    include: {
      history: { select: { status: true, createdAt: true }, orderBy: { createdAt: "asc" } },
    },
  });

  if (!order) {
    throw new ApiError("ORDER_NOT_FOUND", `Order ${id} not found`, 404);
  }

  return { order, isBatch: false, batch: null };
}

function mapReportStatus(status: string): string {
  switch (status) {
    case "OPEN":
    case "UNDER_REVIEW":
    case "INVESTIGATING":
      return "pending_resolution";
    case "CONFIRM_SENT":
    case "DELIVERED":
      return "confirmed_sent";
    case "RESOLVED":
      return "resolved";
    case "REFUNDED":
      return "refunded";
    case "REJECTED":
    case "CANCELLED":
      return "cancelled";
    default:
      return status.toLowerCase();
  }
}

/**
 * POST /v1/orders/{id}/not-received
 * Submit a Not Received dispute report for an order or batch entry.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const start = Date.now();
  const { id } = await params;
  const endpoint = `/v1/orders/${id}/not-received`;
  let requestId = "req_initial";
  let authContext: any = null;

  try {
    authContext = await validateApiAuth(request, { requiredScope: "orders:create" });
    requestId = authContext.requestId;

    const reportsEnabled = await getSetting("reports_enabled", "true");
    if (reportsEnabled === "false") {
      throw new ApiError("SERVICE_UNAVAILABLE", "Report submission is temporarily disabled.", 503);
    }

    const body = await request.json().catch(() => ({}));
    const { order, isBatch, batch } = await resolveTargetOrder(
      id,
      authContext.userId,
      authContext.isSandbox,
      body
    );

    // Number verification if provided in body
    if (body.number || body.phoneNumber) {
      const givenNorm = normalizeGhanaPhoneNumber(String(body.number || body.phoneNumber));
      const orderNorm = normalizeGhanaPhoneNumber(order.phoneNumber);
      if (givenNorm && orderNorm && givenNorm !== orderNorm) {
        throw new ApiError(
          "INVALID_PHONE_NUMBER",
          `The provided phone number (${body.number || body.phoneNumber}) does not match this order's recipient (${order.phoneNumber}).`,
          400
        );
      }
    }

    // Status check: must be completed/success
    if (order.status !== "SUCCESS" && order.status !== "COMPLETED" && order.status !== "PROCESSED") {
      throw new ApiError(
        "INVALID_ORDER_STATUS",
        `Not received reports can only be submitted for completed orders. Current order status is ${order.status}.`,
        409
      );
    }

    // Window check
    const completedAt = deriveCompletedAt(order);
    const windowHours = parseInt(await getSetting("report_not_received_window_hours", "24"), 10);
    if (!isWithinReportWindow(completedAt, new Date(), windowHours)) {
      throw new ApiError(
        "REPORT_WINDOW_EXPIRED",
        `The ${windowHours}-hour reporting window for this order has ended.`,
        409
      );
    }

    // Anti-duplication check: prevent multiple active reports on the same order
    const existing = await prisma.deliveryReport.findFirst({
      where: {
        orderId: order.id,
        status: { in: ACTIVE_DELIVERY_REPORT_STATUSES },
      },
      select: { id: true, seq: true, status: true, createdAt: true },
    });

    if (existing) {
      throw new ApiError(
        "NOT_RECEIVED_ALREADY_EXISTS",
        "A not received report already exists for this order",
        409,
        undefined,
        {
          orderId: isBatch && batch ? batch.batchCode : `API-${order.id}`,
          orderEntryId: order.id,
          reportId: deliveryReportCode(existing.seq),
        }
      );
    }

    // Sandbox handling
    if (authContext.isSandbox) {
      const mockReportId = `NR-TEST-${order.id}`;
      const mockResponse = {
        report: {
          reportId: mockReportId,
          orderId: isBatch && batch ? batch.batchCode : `API-${order.id}`,
          orderEntryId: order.id,
          number: order.phoneNumber,
          allocationGb: order.gbAmount,
          status: "pending_resolution",
          reportDate: new Date().toISOString(),
          adminNotes: "Sandbox simulation: Customer reported not received; investigation started",
          evidenceUrl: null,
        },
        message: "Not received report submitted successfully (Sandbox)",
      };

      await logApiRequestEntry({
        userId: authContext.userId,
        credentialId: authContext.credentialId,
        endpoint,
        method: "POST",
        status: 201,
        success: true,
        ip: authContext.clientIp,
        userAgent: authContext.userAgent,
        environment: authContext.environment,
        responseTimeMs: Date.now() - start,
        requestId,
      });

      return formatApiSuccess(mockResponse, requestId, 201, authContext.rateLimit);
    }

    // Production: Calculate sequence number and create report
    const max = await prisma.deliveryReport.aggregate({ _max: { seq: true } });
    const seq = (max._max.seq ?? 0) + 1;
    const reportCode = deliveryReportCode(seq);

    const reason = typeof body.reason === "string" && body.reason.trim().length > 0
      ? body.reason.trim().slice(0, 300)
      : "Customer reported data not received via API";

    const customerMessage = typeof body.message === "string" && body.message.trim().length > 0
      ? body.message.trim().slice(0, 1000)
      : typeof body.customerNote === "string" && body.customerNote.trim().length > 0
      ? body.customerNote.trim().slice(0, 1000)
      : null;

    const report = await prisma.deliveryReport.create({
      data: {
        orderId: order.id,
        seq,
        userId: authContext.userId,
        status: "UNDER_REVIEW",
        reason,
        message: customerMessage,
        events: {
          create: {
            type: "SUBMITTED",
            message: `Report submitted via API (${authContext.environment}) -- ${reason}`,
            actorLabel: authContext.userEmail || "API Client",
          },
        },
      },
    });

    await recordAudit({
      userId: authContext.userId,
      actorLabel: authContext.userEmail || "API Client",
      action: "delivery_report.create_api",
      target: `delivery_report:${report.id}`,
      newValue: JSON.stringify({
        orderId: order.id,
        code: reportCode,
        isBatch,
        batchCode: batch?.batchCode,
      }),
    });

    // Auto-forward to upstream Clickyfied provider if order was dispatched via Clickyfied
    forwardNotReceivedToClickyfied(order, report, "NOT_RECEIVED_API").catch((err) => {
      console.error("Async Clickyfied dispatch error for API report:", err);
    });

    // Dispatch real-time webhook event to user
    dispatchWebhookEvent(
      authContext.userId,
      "report.not_received.submitted",
      {
        event: "report.not_received.submitted",
        orderId: isBatch && batch ? batch.batchCode : `API-${order.id}`,
        clientId: authContext.credentialId || authContext.userId,
        submittedAt: report.createdAt.toISOString(),
        report: {
          reportId: reportCode,
          orderEntryId: order.id,
          number: order.phoneNumber,
          allocationGb: order.gbAmount,
          status: "pending_resolution",
          reportDate: report.createdAt.toISOString(),
          adminNotes: "Customer reported not received; investigation started",
        },
      },
      order.id
    ).catch((hookErr) => {
      console.error("Webhook dispatch error for not-received submit:", hookErr);
    });

    const responsePayload = {
      report: {
        reportId: reportCode,
        orderId: isBatch && batch ? batch.batchCode : `API-${order.id}`,
        orderEntryId: order.id,
        number: order.phoneNumber,
        allocationGb: order.gbAmount,
        status: "pending_resolution",
        reportDate: report.createdAt.toISOString(),
        adminNotes: "Customer reported not received; investigation started",
        evidenceUrl: null,
      },
      message: "Not received report submitted successfully",
    };

    await logApiRequestEntry({
      userId: authContext.userId,
      credentialId: authContext.credentialId,
      endpoint,
      method: "POST",
      status: 201,
      success: true,
      ip: authContext.clientIp,
      userAgent: authContext.userAgent,
      environment: authContext.environment,
      responseTimeMs: Date.now() - start,
      requestId,
    });

    return formatApiSuccess(responsePayload, requestId, 201, authContext.rateLimit);
  } catch (err: any) {
    const status = err instanceof ApiError ? err.status : 500;
    const code = err instanceof ApiError ? err.code : "SERVER_ERROR";
    const message = err.message || "Failed to submit not received report";

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

    return formatApiError(code, message, status, requestId, err.rateLimitInfo, err.details);
  }
}

/**
 * GET /v1/orders/{id}/not-received
 * Retrieve not-received status and resolution history for an order or batch.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const start = Date.now();
  const { id } = await params;
  const endpoint = `/v1/orders/${id}/not-received`;
  let requestId = "req_initial";
  let authContext: any = null;

  try {
    authContext = await validateApiAuth(request, { requiredScope: "orders:read" });
    requestId = authContext.requestId;

    const upperId = id.trim().toUpperCase();
    const candidateBatchCode = upperId.replace(/^API-/, "").trim();

    // 1. Check Batch Order
    const batch = await prisma.orderBatch.findFirst({
      where: {
        OR: [{ batchCode: candidateBatchCode }, { id: id.trim() }],
        userId: authContext.userId,
      },
      include: {
        orders: {
          where: { isSandbox: authContext.isSandbox },
          select: { id: true },
        },
      },
    });

    let targetOrderIds: number[] = [];
    let isBatch = false;

    if (batch && batch.orders.length > 0) {
      isBatch = true;
      targetOrderIds = batch.orders.map((o) => o.id);
    } else {
      const cleanId = upperId.replace(/^(API|CLK)-/, "").trim();
      const numericId = parseInt(cleanId, 10);
      if (isNaN(numericId) || numericId <= 0) {
        throw new ApiError("INVALID_ORDER_ID", "Invalid order ID format. Example: API-12345", 400);
      }

      const order = await prisma.order.findFirst({
        where: { id: numericId, userId: authContext.userId, isSandbox: authContext.isSandbox },
        select: { id: true },
      });

      if (!order) {
        throw new ApiError("ORDER_NOT_FOUND", `Order ${id} not found`, 404);
      }
      targetOrderIds = [order.id];
    }

    const reports = await prisma.deliveryReport.findMany({
      where: {
        orderId: { in: targetOrderIds },
        userId: authContext.userId,
      },
      include: {
        order: {
          select: {
            id: true,
            phoneNumber: true,
            gbAmount: true,
            amount: true,
            network: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const formattedReports = reports.map((r) => {
      const code = deliveryReportCode(r.seq);
      const evidenceUrl = r.proofImage
        ? r.proofImage.startsWith("http")
          ? r.proofImage
          : `/api/reports/not-received/${r.id}/proof`
        : null;

      return {
        reportId: code,
        orderId: isBatch && batch ? batch.batchCode : `API-${r.order.id}`,
        orderEntryId: r.order.id,
        number: r.order.phoneNumber,
        allocationGb: r.order.gbAmount,
        status: mapReportStatus(r.status),
        reason: r.reason,
        reportDate: r.createdAt.toISOString(),
        resolutionDate: r.resolvedAt?.toISOString() || null,
        adminNotes: sanitizeCustomerRefundNote(r.adminResponse, r.order.amount) || r.adminResponse || null,
        evidenceUrl,
      };
    });

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

    return formatApiSuccess(
      {
        orderId: id,
        count: formattedReports.length,
        reports: formattedReports,
      },
      requestId,
      200,
      authContext.rateLimit
    );
  } catch (err: any) {
    const status = err instanceof ApiError ? err.status : 500;
    const code = err instanceof ApiError ? err.code : "SERVER_ERROR";
    const message = err.message || "Failed to retrieve not received reports";

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

    return formatApiError(code, message, status, requestId, err.rateLimitInfo, err.details);
  }
}
