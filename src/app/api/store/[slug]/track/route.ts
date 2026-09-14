import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { storefrontTrackSchema } from "@/lib/validation";
import { getEnabledStorefrontBySlug, fromPesewas, storefrontOrderCode } from "@/lib/storefront";

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
    const { query } = storefrontTrackSchema.parse(await request.json());

    const storefront = await getEnabledStorefrontBySlug(slug);
    if (!storefront || storefront.status !== "ENABLED") {
      return apiError(404, "Store not found");
    }

    const q = query.trim();
    let where: Prisma.StorefrontOrderWhereInput;

    if (/^0\d{9}$/.test(q)) {
      where = { storefrontId: storefront.id, customerPhone: q };
    } else if (/^CF-ST-\d{5}$/i.test(q) || /^\d{1,6}$/.test(q)) {
      const seq = Number(q.replace(/^CF-ST-/i, "").replace(/^0+(?=\d)/, ""));
      where = { storefrontId: storefront.id, seq };
    } else {
      where = { storefrontId: storefront.id, paymentReference: q.toUpperCase() };
    }

    const orders = await prisma.storefrontOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 6,
      include: {
        product: { include: { dataPackage: true } },
        underlyingOrder: { select: { status: true } },
      },
    });

    return NextResponse.json({
      orders: orders.map((o) => {
        let displayStatus = o.status;
        if (o.underlyingOrder) {
          displayStatus = o.underlyingOrder.status === "SUCCESS" ? "COMPLETED" : o.underlyingOrder.status;
        }
        return {
          code: o.paymentReference || storefrontOrderCode(o.seq, o.paymentReference),
          reference: o.paymentReference,
          network: o.product.dataPackage.network,
          size: `${o.product.dataPackage.gbAmount}GB`,
          amount: fromPesewas(o.sellingPrice),
          status: displayStatus,
          createdAt: o.createdAt.toISOString(),
        };
      }),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
