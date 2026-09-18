import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { getEnabledStorefrontBySlug } from "@/lib/storefront";

/**
 * Serves the delivery evidence proof image to the buyer on the storefront.
 * Validated securely via ?reference=... matching the StorefrontOrder.
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
      select: { underlyingOrderId: true },
    });

    if (!storefrontOrder || !storefrontOrder.underlyingOrderId) {
      return apiError(404, "Order not found");
    }

    const report = await prisma.deliveryReport.findFirst({
      where: {
        id: reportId,
        orderId: storefrontOrder.underlyingOrderId,
      },
      select: {
        proofImage: true,
        proofImageMime: true,
      },
    });

    if (!report || !report.proofImage) {
      return apiError(404, "Proof image not found");
    }

    // Remote URL redirect or streaming
    if (report.proofImage.startsWith("http://") || report.proofImage.startsWith("https://")) {
      try {
        const remoteRes = await fetch(report.proofImage, {
          headers: { "User-Agent": "Tskconnect/1.0" },
        });
        if (remoteRes.ok) {
          const contentType = remoteRes.headers.get("content-type") || report.proofImageMime || "image/jpeg";
          const arrayBuf = await remoteRes.arrayBuffer();
          return new NextResponse(new Uint8Array(arrayBuf), {
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "private, max-age=3600",
            },
          });
        }
      } catch {
        return NextResponse.redirect(report.proofImage);
      }
    }

    const buffer = Buffer.from(report.proofImage, "base64");
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": report.proofImageMime ?? "image/png",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
