import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { storefrontTrackSchema } from "@/lib/validation";
import {
  getEnabledStorefrontBySlug,
  fromPesewas,
  storefrontOrderCode,
  verifyAndSettleStorefrontOrder,
} from "@/lib/storefront";
import { sanitizeCustomerRefundNote } from "@/lib/types";

/**
 * Public order tracking for the storefront (§37 buyer-facing view). A query
 * matches either the exact order code (CF-ST-XXXXX / raw seq), the Paystack
 * payment reference, or the beneficiary phone number — and only ever returns
 * orders belonging to this storefront.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { query, date } = storefrontTrackSchema.parse(await request.json());

    const storefront = await getEnabledStorefrontBySlug(slug);
    if (!storefront || storefront.status !== "ENABLED") {
      return apiError(404, "Store not found");
    }

    const q = query.trim();
    const digits = q.replace(/\D/g, "");
    const isPhone = !/[a-zA-Z]/.test(q) && digits.length >= 9;
    let where: Prisma.StorefrontOrderWhereInput;

    if (isPhone) {
      if (!date) {
        return apiError(400, "Please select the date the order was placed when tracking by phone number.");
      }
      const start = new Date(`${date}T00:00:00.000Z`);
      const end = new Date(`${date}T23:59:59.999Z`);
      const last9 = digits.slice(-9);
      const localPhone = "0" + last9;
      where = {
        storefrontId: storefront.id,
        createdAt: { gte: start, lte: end },
        OR: [
          { customerPhone: { contains: last9 } },
          { customerPhone: localPhone },
          { customerPhone: q },
          { underlyingOrder: { is: { phoneNumber: { contains: last9 } } } },
          { underlyingOrder: { is: { phoneNumber: localPhone } } },
        ],
      };
    } else if (/^CF-ST-\d{1,6}$/i.test(q) || (/^\d{1,6}$/.test(q) && digits.length <= 6)) {
      const seq = Number(q.replace(/^CF-ST-/i, "").replace(/^0+(?=\d)/, ""));
      where = {
        storefrontId: storefront.id,
        OR: [
          { seq },
          { paymentReference: { contains: q.toUpperCase() } },
        ],
      };
    } else {
      where = {
        storefrontId: storefront.id,
        OR: [
          { paymentReference: { contains: q.toUpperCase() } },
          { paymentReference: q },
        ],
      };
    }

    const [reportsEnabledSetting, windowHoursSetting] = await Promise.all([
      prisma.systemSetting.findUnique({ where: { key: "reports_enabled" } }),
      prisma.systemSetting.findUnique({ where: { key: "report_not_received_window_hours" } }),
    ]);
    const reportsEnabled = reportsEnabledSetting?.value !== "false";
    const windowHours = parseInt(windowHoursSetting?.value || "24", 10);

    const orders = await prisma.storefrontOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 6,
      include: {
        product: { include: { dataPackage: true } },
        underlyingOrder: {
          select: {
            id: true,
            status: true,
            providerReference: true,
            updatedAt: true,
            completedAt: true,
            createdAt: true,
            deliveryReports: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: {
                id: true,
                seq: true,
                status: true,
                reason: true,
                proofImageMime: true,
                adminNote: true,
                adminResponse: true,
                respondedAt: true,
                resolvedAt: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    // Self-healing: if any returned order is still unsettled, verify with Paystack
    const formattedOrders = await Promise.all(
      orders.map(async (o) => {
        let displayStatus = o.status;
        let hasUnderlying = Boolean(o.underlyingOrder);

        if (!hasUnderlying) {
          const autoSettle = await verifyAndSettleStorefrontOrder(o.paymentReference);
          if (autoSettle.settled) {
            displayStatus = "PENDING";
            hasUnderlying = true;
          }
        } else if (o.underlyingOrder) {
          if (
            (o.underlyingOrder.status === "PENDING" || o.underlyingOrder.status === "PROCESSING") &&
            o.underlyingOrder.providerReference?.startsWith("CLICKYFIED:") &&
            Date.now() - new Date(o.underlyingOrder.updatedAt).getTime() > 120000
          ) {
            try {
              const { syncClickyfiedOrder } = await import("@/lib/provider-apis/router");
              const syncRes = await syncClickyfiedOrder(o.underlyingOrder, "Storefront Track Sync");
              if (syncRes.changed && syncRes.newStatus) {
                o.underlyingOrder.status = syncRes.newStatus;
              }
            } catch (syncErr) {
              console.error("Storefront track sync error:", syncErr);
            }
          }
          displayStatus =
            o.underlyingOrder.status === "SUCCESS" ? "COMPLETED" : o.underlyingOrder.status;
        }

        const isCompleted = displayStatus === "COMPLETED" || displayStatus === "SUCCESS";
        const latestReport = o.underlyingOrder?.deliveryReports?.[0] ?? null;
        const activeReportStatuses = ["OPEN", "UNDER_REVIEW", "INVESTIGATING"];
        const hasActiveReport = latestReport ? activeReportStatuses.includes(latestReport.status) : false;

        const completedTime = o.completedAt ?? o.underlyingOrder?.completedAt ?? o.underlyingOrder?.updatedAt ?? o.updatedAt;
        const withinWindow =
          completedTime &&
          Date.now() - new Date(completedTime).getTime() <= windowHours * 3600 * 1000;
        const canReport = Boolean(reportsEnabled && isCompleted && !hasActiveReport && withinWindow);

        return {
          code: o.paymentReference || storefrontOrderCode(o.seq, o.paymentReference),
          reference: o.paymentReference,
          phone: o.customerPhone,
          network: o.product.dataPackage.network,
          size: `${o.product.dataPackage.gbAmount}GB`,
          amount: fromPesewas(o.sellingPrice),
          status: displayStatus,
          createdAt: o.createdAt.toISOString(),
          canReport,
          deliveryReport: latestReport
            ? {
                id: latestReport.id,
                seq: latestReport.seq,
                code: `NR-${String(latestReport.seq).padStart(5, "0")}`,
                status: latestReport.status,
                reason: latestReport.reason,
                adminResponse: sanitizeCustomerRefundNote(latestReport.adminResponse, fromPesewas(o.sellingPrice)),
                hasProof: Boolean(latestReport.proofImageMime),
                createdAt: latestReport.createdAt.toISOString(),
              }
            : null,
        };
      })
    );

    return NextResponse.json({
      orders: formattedOrders,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
