import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { deliveryReportCreateSchema } from "@/lib/validation";
import { deriveCompletedAt } from "@/lib/orders";
import { isWithinReportWindow, ACTIVE_DELIVERY_REPORT_STATUSES, deliveryReportCode } from "@/lib/types";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";

/** Light report shape reused by list endpoints — never includes proof base64. */
const reportLightSelect = {
  id: true,
  seq: true,
  status: true,
  reason: true,
  message: true,
  adminNote: true,
  adminResponse: true,
  respondedAt: true,
  proofImageMime: true,
  proofImageUploadedAt: true,
  resolvedAt: true,
  createdAt: true,
} as const;

/**
 * Derives the user's "not received" report list from order + status history data:
 *  - REVIEW          → order is FAILED and still under review
 *  - REFUNDED        → order was refunded
 *  - CONFIRMED_SENT  → order was reported FAILED but later confirmed SUCCESS
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 15)));
    const q = searchParams.get("q");
    const status = searchParams.get("status"); // REVIEW | CONFIRMED_SENT | REFUNDED
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const sort = searchParams.get("sort") ?? "newest";

    // "My Not Received" reports list (§14) — the user's actual filed reports
    if (searchParams.get("view") === "reports") {
      const reportWhere: Record<string, unknown> = { userId: user.id };
      if (status) {
        if (status === "UNDER_REVIEW" || status === "REVIEW") {
          reportWhere.status = { in: ["OPEN", "UNDER_REVIEW", "INVESTIGATING"] };
        } else if (status === "RESOLVED") {
          reportWhere.status = { in: ["RESOLVED", "DELIVERED", "CONFIRM_SENT"] };
        } else if (status === "REFUNDED") {
          reportWhere.status = "REFUNDED";
        } else if (["OPEN", "UNDER_REVIEW", "INVESTIGATING", "DELIVERED", "RESOLVED", "REFUNDED", "CONFIRM_SENT", "REJECTED"].includes(status)) {
          reportWhere.status = status;
        }
      }
      if (q) {
        reportWhere.OR = [
          { order: { is: { phoneNumber: { contains: q } } } },
          { reason: { contains: q } },
        ];
      }
      const [reports, total] = await Promise.all([
        prisma.deliveryReport.findMany({
          where: reportWhere,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            ...reportLightSelect,
            order: { select: { id: true, phoneNumber: true, network: true, gbAmount: true, amount: true, status: true } },
          },
        }),
        prisma.deliveryReport.count({ where: reportWhere }),
      ]);
      // On-demand sync for open reports in My Reports view
      const openReportsToSync = reports.filter((r) => ["OPEN", "UNDER_REVIEW", "INVESTIGATING"].includes(r.status));
      if (openReportsToSync.length > 0) {
        try {
          const { syncClickyfiedDeliveryReport } = await import("@/lib/provider-apis/router");
          await Promise.allSettled(
            openReportsToSync.slice(0, 5).map(async (rep: any) => {
              const res = await syncClickyfiedDeliveryReport(rep.id, "My Reports View Sync");
              if (res.changed) {
                const refreshed = await prisma.deliveryReport.findUnique({
                  where: { id: rep.id },
                  select: {
                    ...reportLightSelect,
                    order: { select: { id: true, phoneNumber: true, network: true, gbAmount: true, amount: true, status: true } },
                  },
                });
                if (refreshed) Object.assign(rep, refreshed);
              }
            })
          );
        } catch {}
      }

      const [underReview, resolved, refunded] = await Promise.all([
        prisma.deliveryReport.count({ where: { userId: user.id, status: { in: ["OPEN", "UNDER_REVIEW", "INVESTIGATING"] } } }),
        prisma.deliveryReport.count({ where: { userId: user.id, status: { in: ["RESOLVED", "DELIVERED", "CONFIRM_SENT"] } } }),
        prisma.deliveryReport.count({ where: { userId: user.id, status: "REFUNDED" } }),
      ]);
      return NextResponse.json({
        reports: reports.map((r) => ({ ...r, code: deliveryReportCode(r.seq) })),
        stats: {
          total,
          underReview,
          resolved,
          refunded,
          open: underReview,
          investigating: 0,
          closed: resolved + refunded,
        },
        total,
        page,
        pages: Math.max(1, Math.ceil(total / pageSize)),
      });
    }

    const orders = await prisma.order.findMany({
      where: { userId: user.id, status: { in: ["FAILED", "REFUNDED", "SUCCESS"] } },
      orderBy: { updatedAt: "desc" },
      include: { history: { select: { status: true }, orderBy: { createdAt: "asc" } } },
    });

    type ReportRow = (typeof orders)[number] & { reportStatus: string };
    const rows: ReportRow[] = [];
    for (const o of orders) {
      let reportStatus: string | null = null;
      if (o.status === "REFUNDED") reportStatus = "REFUNDED";
      else if (o.status === "FAILED") reportStatus = "REVIEW";
      else if (
        o.status === "SUCCESS" &&
        o.history.some((h) => h.status === "FAILED")
      ) {
        reportStatus = "CONFIRMED_SENT";
      }
      if (reportStatus) rows.push({ ...o, reportStatus });
    }

    const filtered = rows.filter((r) => {
      if (q && !r.phoneNumber.includes(q)) return false;
      if (status && r.reportStatus !== status) return false;
      if (from || to) {
        const t = new Date(r.updatedAt).getTime();
        if (from && t < new Date(from).getTime()) return false;
        if (to && t > new Date(to).getTime()) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      const ta = new Date(a.updatedAt).getTime();
      const tb = new Date(b.updatedAt).getTime();
      return sort === "oldest" ? ta - tb : tb - ta;
    });

    const stats = {
      total: filtered.length,
      review: filtered.filter((r) => r.reportStatus === "REVIEW").length,
      resolved: filtered.filter((r) => r.reportStatus === "CONFIRMED_SENT").length,
      refunded: filtered.filter((r) => r.reportStatus === "REFUNDED").length,
    };

    // Attach the user's actual "Not Received" reports where they exist
    const reports = await prisma.deliveryReport.findMany({
      where: { userId: user.id, orderId: { in: filtered.map((r) => r.id) } },
      orderBy: { createdAt: "desc" },
    });
    const reportByOrder = new Map<number, (typeof reports)[number]>();
    for (const rep of reports) {
      if (!reportByOrder.has(rep.orderId)) reportByOrder.set(rep.orderId, rep);
    }

    // On-demand sync for open reports in order-based view
    const openOrderReports = reports.filter((r) => ["OPEN", "UNDER_REVIEW", "INVESTIGATING"].includes(r.status));
    if (openOrderReports.length > 0) {
      try {
        const { syncClickyfiedDeliveryReport } = await import("@/lib/provider-apis/router");
        await Promise.allSettled(
          openOrderReports.slice(0, 5).map(async (rep) => {
            const res = await syncClickyfiedDeliveryReport(rep.id, "Not Received Orders View Sync");
            if (res.changed) {
              const refreshed = await prisma.deliveryReport.findUnique({ where: { id: rep.id } });
              if (refreshed) reportByOrder.set(rep.orderId, refreshed);
            }
          })
        );
      } catch {}
    }

    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const data = filtered.slice((page - 1) * pageSize, page * pageSize).map((r) => {
      const rep = reportByOrder.get(r.id) ?? null;
      return {
        id: r.id,
        phoneNumber: r.phoneNumber,
        network: r.network,
        gbAmount: r.gbAmount,
        amount: r.amount,
        orderStatus: r.status,
        reportStatus: r.reportStatus,
        reportDate: r.updatedAt,
        processedDate: r.status !== "PENDING" && r.status !== "PROCESSING" ? r.updatedAt : null,
        deliveryReport: rep
          ? {
              id: rep.id,
              seq: rep.seq,
              code: deliveryReportCode(rep.seq),
              status: rep.status,
              adminNote: rep.adminNote,
              adminResponse: rep.adminResponse,
              resolvedAt: rep.resolvedAt,
            }
          : null,
      };
    });

    return NextResponse.json({ data, stats, total, page, pages });
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * User files a "Not Received" report (§33 + §19). The backend strictly enforces:
 *  1. the authenticated user owns the order
 *  2. the order is COMPLETED (stored as SUCCESS)
 *  3. the current time is within 24 hours of the order's completedAt
 *  4. no active report already exists for the order
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const { getSetting } = await import("@/lib/orders");
    const reportsEnabled = await getSetting("reports_enabled", "true");
    if (reportsEnabled === "false") {
      return apiError(400, "Report submission is currently disabled.");
    }
    const input = deliveryReportCreateSchema.parse(await request.json());

    const order = await prisma.order.findUnique({
      where: { id: input.orderId },
      include: { history: { select: { status: true, createdAt: true }, orderBy: { createdAt: "asc" } } },
    });
    if (!order || order.userId !== user.id) return apiError(404, "Order not found");

    if (order.status !== "SUCCESS") {
      return apiError(409, "Not Received can only be reported for completed orders");
    }

    const completedAt = deriveCompletedAt(order);
    const windowHours = parseInt(await getSetting("report_not_received_window_hours", "24"), 10);
    if (!isWithinReportWindow(completedAt, new Date(), windowHours)) {
      return apiError(409, `The ${windowHours}-hour reporting window for this order has ended`);
    }

    const existing = await prisma.deliveryReport.findFirst({
      where: { orderId: order.id, status: { in: ACTIVE_DELIVERY_REPORT_STATUSES } },
      select: { id: true, seq: true },
    });
    if (existing) {
      return apiError(409, `A report for this order already exists (${deliveryReportCode(existing.seq)})`);
    }

    // Seq for the NR-00xxx code — max + 1 (SQLite has no non-PK autoincrement)
    const max = await prisma.deliveryReport.aggregate({ _max: { seq: true } });
    const seq = (max._max.seq ?? 0) + 1;

    const report = await prisma.deliveryReport.create({
      data: {
        orderId: order.id,
        seq,
        userId: user.id,
        status: "UNDER_REVIEW",
        reason: input.reason,
        message: input.message || null,
        events: {
          create: {
            type: "SUBMITTED",
            message: `Report submitted — ${input.reason}`,
            actorLabel: user.email,
          },
        },
      },
    });

    await recordAudit({
      userId: user.id,
      actorLabel: user.email,
      action: "delivery_report.create",
      target: `delivery_report:${report.id}`,
      newValue: JSON.stringify({ orderId: order.id, seq, reason: input.reason }),
    });

    // Forward to Clickyfied API if enabled and order is associated with Clickyfied
    const notReceivedSetting = await prisma.systemSetting.findUnique({
      where: { key: "clickyfied_not_received_enabled" },
    });
    const isClickyfiedOrder =
      order.providerReference?.startsWith("CLICKYFIED:") ||
      (await prisma.systemSetting.findUnique({ where: { key: `provider_route_${order.network}` } }))?.value === "CLICKYFIED";

    if (notReceivedSetting?.value !== "false" && isClickyfiedOrder) {
      try {
        const { getProviderRoutingConfig, normalizePhoneLast9 } = await import("@/lib/provider-apis/router");
        const { ClickyfiedClient } = await import("@/lib/provider-apis/clickyfied");
        const { recordOrderApiLog } = await import("@/lib/order-api-logs");

        const config = await getProviderRoutingConfig();
        const client = new ClickyfiedClient(config.clickyfied);

        let clickyfiedOrderId = order.externalReference || `TSK-ORD-${order.id}`;
        let orderEntryId: string | number | undefined = undefined;

        if (order.providerReference?.startsWith("CLICKYFIED:")) {
          const rawRef = order.providerReference.replace("CLICKYFIED:", "").trim();
          const [refOrderId, refEntryId] = rawRef.split(":");
          if (refOrderId) clickyfiedOrderId = refOrderId;
          if (refEntryId) {
            orderEntryId = !isNaN(Number(refEntryId)) ? Number(refEntryId) : refEntryId;
          }
        } else if (order.providerReference) {
          const [refOrderId, refEntryId] = order.providerReference.trim().split(":");
          if (refOrderId) clickyfiedOrderId = refOrderId;
          if (refEntryId) {
            orderEntryId = !isNaN(Number(refEntryId)) ? Number(refEntryId) : refEntryId;
          }
        }

        // If orderEntryId is not yet cached on order, fetch it from Clickyfied order details
        if (orderEntryId === undefined && clickyfiedOrderId) {
          try {
            const ordStatus = await client.getOrderStatus(clickyfiedOrderId);
            const raw = ordStatus.raw as any;
            const entriesList: any[] = raw?.order?.entries || raw?.entries || [];
            const phoneNorm = normalizePhoneLast9(order.phoneNumber);
            const matched = entriesList.find(
              (e: any) => e.number && normalizePhoneLast9(e.number) === phoneNorm
            );
            if (matched && matched.id !== undefined && matched.id !== null) {
              orderEntryId = !isNaN(Number(matched.id)) ? Number(matched.id) : matched.id;
              await prisma.order.update({
                where: { id: order.id },
                data: {
                  providerReference: `CLICKYFIED:${clickyfiedOrderId}:${matched.id}`,
                },
              });
            }
          } catch (fetchErr) {
            console.warn("Could not retrieve entryId from Clickyfied order entries:", fetchErr);
          }
        }

        // Action 6: Report Not Received for a Multi-Entry (or Single-Entry) Order
        const reportPayload = {
          orderId: clickyfiedOrderId,
          orderEntryId,
          number: order.phoneNumber,
          allocationGb: order.gbAmount,
        };

        const repRes = await client.reportNotReceived(reportPayload);

        await recordOrderApiLog({
          orderId: order.id,
          provider: "CLICKYFIED",
          action: "NOT_RECEIVED",
          endpoint: "/api/orders/report-not-received",
          method: "POST",
          requestPayload: reportPayload,
          responsePayload: repRes,
          statusCode: 200,
          success: true,
          providerReference: orderEntryId ? `${clickyfiedOrderId}:${orderEntryId}` : clickyfiedOrderId,
        });

        await prisma.deliveryReportEvent.create({
          data: {
            reportId: report.id,
            type: "INVESTIGATION_STARTED",
            message: `Report forwarded to Clickyfied API (Order #${clickyfiedOrderId}${orderEntryId ? `, Entry #${orderEntryId}` : ""})`,
            actorLabel: "Clickyfied API",
          },
        });
      } catch (err: any) {
        console.error("Failed to forward report to Clickyfied:", err);
        try {
          const { recordOrderApiLog } = await import("@/lib/order-api-logs");
          await recordOrderApiLog({
            orderId: order.id,
            provider: "CLICKYFIED",
            action: "NOT_RECEIVED",
            endpoint: err?.endpoint || `/api/orders/report-not-received`,
            method: "POST",
            requestPayload: {
              clickyfiedId: order.providerReference || order.externalReference,
              number: order.phoneNumber,
              allocationGb: order.gbAmount,
            },
            responsePayload: err?.rawResponse || err?.rawText || { error: err?.message },
            statusCode: err?.status || 500,
            success: false,
            errorMessage: err?.message || "Failed to submit not received report to Clickyfied",
            providerReference: order.providerReference,
          });
        } catch {}

        await prisma.deliveryReportEvent
          .create({
            data: {
              reportId: report.id,
              type: "RESPONSE_ADDED",
              message: `Could not automatically forward to Clickyfied: ${err?.message || "Network error"}`,
              actorLabel: "System",
            },
          })
          .catch(() => {});
      }
    }

    return NextResponse.json(
      { report: { ...report, code: deliveryReportCode(report.seq) } },
      { status: 201 }
    );
  } catch (err) {
    return handleRouteError(err);
  }
}