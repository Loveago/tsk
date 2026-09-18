import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { getEnabledStorefrontBySlug } from "@/lib/storefront";
import { deliveryReportCode } from "@/lib/types";
import { syncClickyfiedDeliveryReport } from "@/lib/provider-apis/router";

/**
 * Public storefront report detail endpoint.
 * Requires ?reference=... matching the StorefrontOrder to verify ownership.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; reportId: string }> }
) {
  try {
    const { slug, reportId } = await params;
    const { searchParams } = new URL(request.url);
    const reference = searchParams.get("reference")?.trim();

    if (!reference) {
      return apiError(400, "Order reference parameter is required");
    }

    const storefront = await getEnabledStorefrontBySlug(slug);
    if (!storefront || storefront.status !== "ENABLED") {
      return apiError(404, "Store not found");
    }

    // Verify ownership via StorefrontOrder paymentReference
    const storefrontOrder = await prisma.storefrontOrder.findFirst({
      where: {
        storefrontId: storefront.id,
        paymentReference: reference,
      },
      select: { underlyingOrderId: true, customerPhone: true },
    });

    if (!storefrontOrder || !storefrontOrder.underlyingOrderId) {
      return apiError(404, "Order not found");
    }

    // Trigger on-demand sync with Clickyfied if needed
    try {
      await syncClickyfiedDeliveryReport(reportId, "Storefront On-Demand Sync");
    } catch {
      // Non-blocking fallback
    }

    const report = await prisma.deliveryReport.findFirst({
      where: {
        id: reportId,
        orderId: storefrontOrder.underlyingOrderId,
      },
      select: {
        id: true,
        seq: true,
        status: true,
        reason: true,
        message: true,
        adminResponse: true,
        respondedAt: true,
        proofImageMime: true,
        proofImageUploadedAt: true,
        resolvedAt: true,
        createdAt: true,
        updatedAt: true,
        events: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            type: true,
            message: true,
            actorLabel: true,
            createdAt: true,
          },
        },
      },
    });

    if (!report) {
      return apiError(404, "Report not found for this order");
    }

    return NextResponse.json({
      report: {
        id: report.id,
        seq: report.seq,
        code: deliveryReportCode(report.seq),
        status: report.status,
        reason: report.reason,
        message: report.message,
        adminResponse: report.adminResponse,
        respondedAt: report.respondedAt ? report.respondedAt.toISOString() : null,
        hasProof: Boolean(report.proofImageMime),
        proofImageUploadedAt: report.proofImageUploadedAt ? report.proofImageUploadedAt.toISOString() : null,
        resolvedAt: report.resolvedAt ? report.resolvedAt.toISOString() : null,
        createdAt: report.createdAt.toISOString(),
        updatedAt: report.updatedAt.toISOString(),
        events: report.events.map((e) => ({
          id: e.id,
          type: e.type,
          message: e.message,
          actorLabel: e.actorLabel,
          createdAt: e.createdAt.toISOString(),
        })),
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
