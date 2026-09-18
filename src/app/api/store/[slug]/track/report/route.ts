import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { getEnabledStorefrontBySlug } from "@/lib/storefront";
import { ACTIVE_DELIVERY_REPORT_STATUSES, deliveryReportCode, isWithinReportWindow } from "@/lib/types";
import { deriveCompletedAt } from "@/lib/orders";
import { recordAudit } from "@/lib/audit";

/**
 * Public storefront endpoint for buyers to report an order as Not Received.
 * Authenticated securely using the storefront slug and unique paymentReference.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await request.json().catch(() => ({}));
    const reference = typeof body.reference === "string" ? body.reference.trim() : "";
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "Data not received";
    const message = typeof body.message === "string" && body.message.trim() ? body.message.trim() : null;

    if (!reference) {
      return apiError(400, "Order payment reference is required");
    }

    const storefront = await getEnabledStorefrontBySlug(slug);
    if (!storefront || storefront.status !== "ENABLED") {
      return apiError(404, "Store not found");
    }

    // Check system-wide reports enabled switch
    const reportsEnabledSetting = await prisma.systemSetting.findUnique({
      where: { key: "reports_enabled" },
    });
    if (reportsEnabledSetting?.value === "false") {
      return apiError(400, "Report submission is currently disabled by system administrator.");
    }

    // Lookup StorefrontOrder
    const storefrontOrder = await prisma.storefrontOrder.findFirst({
      where: {
        storefrontId: storefront.id,
        paymentReference: reference,
      },
      include: {
        underlyingOrder: {
          include: {
            history: { select: { status: true, createdAt: true }, orderBy: { createdAt: "asc" } },
          },
        },
      },
    });

    if (!storefrontOrder || !storefrontOrder.underlyingOrder) {
      return apiError(404, "Order not found or not yet processed for fulfillment");
    }

    const order = storefrontOrder.underlyingOrder;

    // Verify order is COMPLETED / SUCCESS
    const isCompleted = order.status === "SUCCESS" || storefrontOrder.status === "COMPLETED";
    if (!isCompleted) {
      return apiError(409, "Not Received can only be reported for completed orders");
    }

    // Verify report window (default 24h)
    const windowHoursSetting = await prisma.systemSetting.findUnique({
      where: { key: "report_not_received_window_hours" },
    });
    const windowHours = parseInt(windowHoursSetting?.value || "24", 10);
    const completedAt = storefrontOrder.completedAt ?? deriveCompletedAt(order);
    if (!isWithinReportWindow(completedAt, new Date(), windowHours)) {
      return apiError(409, `The ${windowHours}-hour reporting window for this order has ended`);
    }

    // Check if an active report already exists
    const existing = await prisma.deliveryReport.findFirst({
      where: { orderId: order.id, status: { in: ACTIVE_DELIVERY_REPORT_STATUSES } },
      select: { id: true, seq: true, status: true },
    });
    if (existing) {
      return apiError(409, `A report for this order already exists (${deliveryReportCode(existing.seq)})`);
    }

    // Generate report seq (max + 1)
    const max = await prisma.deliveryReport.aggregate({ _max: { seq: true } });
    const seq = (max._max.seq ?? 0) + 1;

    // Create report linked to the store owner's account and order
    const report = await prisma.deliveryReport.create({
      data: {
        orderId: order.id,
        seq,
        userId: storefront.userId,
        status: "UNDER_REVIEW",
        reason,
        message,
        events: {
          create: {
            type: "SUBMITTED",
            message: `Report submitted via Storefront (${storefront.name}) — ${reason}`,
            actorLabel: `Storefront Buyer (${storefrontOrder.customerPhone})`,
          },
        },
      },
    });

    await recordAudit({
      userId: storefront.userId,
      actorLabel: `Storefront Buyer (${storefrontOrder.customerPhone})`,
      action: "delivery_report.create_storefront",
      target: `delivery_report:${report.id}`,
      newValue: JSON.stringify({
        orderId: order.id,
        storefrontOrderId: storefrontOrder.id,
        seq,
        reason,
        phone: storefrontOrder.customerPhone,
      }),
    });

    // Forward to Clickyfied if enabled and order is routed through Clickyfied
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

        // Canonical ID resolution
        if (!clickyfiedOrderId.startsWith("order-")) {
          try {
            clickyfiedOrderId = await client.resolveCanonicalOrderId(clickyfiedOrderId);
          } catch {}
        }

        if (!clickyfiedOrderId.startsWith("order-")) {
          try {
            const matched = await client.findOrderByPhone(order.phoneNumber);
            if (matched?.orderId) {
              clickyfiedOrderId = matched.orderId;
              if (matched.orderEntryId !== undefined) {
                orderEntryId = matched.orderEntryId;
              }
              await prisma.order
                .update({
                  where: { id: order.id },
                  data: {
                    providerReference: orderEntryId
                      ? `CLICKYFIED:${clickyfiedOrderId}:${orderEntryId}`
                      : `CLICKYFIED:${clickyfiedOrderId}`,
                  },
                })
                .catch(() => {});
            }
          } catch (lookupPhoneErr) {
            console.warn("Could not find order by phone on Clickyfied:", lookupPhoneErr);
          }
        }

        if (clickyfiedOrderId.startsWith("order-")) {
          // If orderEntryId is undefined, lookup from order status entries
          if (orderEntryId === undefined) {
            try {
              const ordStatus = await client.getOrderStatus(clickyfiedOrderId);
              const raw = ordStatus.raw as any;
              const entriesList: any[] = raw?.order?.entries || raw?.entries || [];
              if (entriesList.length > 0) {
                const targetNorm = normalizePhoneLast9(order.phoneNumber);
                const matchedEntry = entriesList.find(
                  (e: any) => e.number && normalizePhoneLast9(e.number) === targetNorm
                );
                const eId = matchedEntry
                  ? matchedEntry.orderEntryId ?? matchedEntry.entryId ?? matchedEntry.id ?? matchedEntry._id
                  : undefined;
                if (eId !== undefined && eId !== null) {
                  orderEntryId = !isNaN(Number(eId)) ? Number(eId) : eId;
                }
              }
            } catch (err) {
              console.warn("Failed entryId lookup:", err);
            }
          }

          const reportPayload = {
            orderId: clickyfiedOrderId,
            orderEntryId,
            number: order.phoneNumber,
            allocationGb: order.gbAmount,
          };

          const repRes = await client.reportNotReceived(reportPayload);
          const repId = (repRes as any)?.report?.reportId ?? (repRes as any)?.reportId ?? (repRes as any)?.id;

          if (repId) {
            await prisma.deliveryReport
              .update({
                where: { id: report.id },
                data: {
                  adminNote: `[PROVIDER_REPORT_ID:${repId}]`,
                },
              })
              .catch(() => {});
          }

          if (orderEntryId) {
            await prisma.order
              .update({
                where: { id: order.id },
                data: { providerReference: `CLICKYFIED:${clickyfiedOrderId}:${orderEntryId}` },
              })
              .catch(() => {});
          }

          await recordOrderApiLog({
            orderId: order.id,
            provider: "CLICKYFIED",
            action: "NOT_RECEIVED_STOREFRONT",
            endpoint: "/api/orders/report-not-received",
            method: "POST",
            requestPayload: reportPayload,
            responsePayload: repRes,
            statusCode: (repRes as any)?.status ?? 200,
            success: true,
            providerReference: orderEntryId
              ? `CLICKYFIED:${clickyfiedOrderId}:${orderEntryId}`
              : `CLICKYFIED:${clickyfiedOrderId}`,
          });
        }
      } catch (clickyfiedErr) {
        console.error("[Storefront Report] Clickyfied dispatch error:", clickyfiedErr);
      }
    }

    return NextResponse.json({
      success: true,
      report: {
        id: report.id,
        seq: report.seq,
        code: deliveryReportCode(report.seq),
        status: report.status,
        createdAt: report.createdAt.toISOString(),
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
