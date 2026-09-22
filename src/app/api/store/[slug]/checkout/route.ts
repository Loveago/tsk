import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { handleRouteError, apiError, getRequestOrigin } from "@/lib/api-helpers";
import { storefrontCheckoutSchema } from "@/lib/validation";
import {
  getEnabledStorefrontBySlug,
  toPesewas,
  fromPesewas,
  nextStorefrontSeq,
  storefrontOrderCode,
  generateStorefrontOrderCode,
} from "@/lib/storefront";
import { isPaystackConfigured, initializeTransaction } from "@/lib/paystack";
import { validateMtnOrderRecipient } from "@/lib/mtn-verification";
import { resolveUserWholesalePrice } from "@/lib/orders";

/**
 * Public storefront checkout (no sign-in): validates the bundle + recipient
 * number, records a PENDING StorefrontOrder with a server-computed commission
 * and returns Paystack's hosted checkout URL. Settlement happens via the
 * webhook and/or the redirect callback (both idempotent on paymentReference).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const input = storefrontCheckoutSchema.parse(await request.json());

    const storefrontEnabledSetting = await prisma.systemSetting.findUnique({
      where: { key: "storefront_feature_enabled" },
    });
    if (storefrontEnabledSetting?.value === "false") {
      return apiError(503, "Storefront ordering is currently paused by administrator.");
    }

    const storefront = await getEnabledStorefrontBySlug(slug);
    if (!storefront || storefront.status !== "ENABLED") {
      return apiError(404, "Store not found");
    }
    if (!storefront.isActive) {
      return apiError(400, "This store is temporarily paused by the owner and not accepting orders at this time.");
    }
    if (!(await isPaystackConfigured())) {
      return apiError(503, "Online payment is not available right now.");
    }

    // Check if recipient number currently has an active in-flight order (§15).
    // In a batch or multi-order scenario, as long as the latest order for this
    // number was completed (SUCCESS), failed, or cancelled, do not block the purchase,
    // regardless of other pending recipients in the batch.
    const latestOrder = await prisma.order.findFirst({
      where: {
        phoneNumber: input.customerPhone,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true },
    });
    if (latestOrder && (latestOrder.status === "PENDING" || latestOrder.status === "PROCESSING")) {
      return apiError(
        400,
        `Cannot place order for ${input.customerPhone}: this number currently has an active order in ${latestOrder.status.toLowerCase()} status.`
      );
    }

    const product = await prisma.storefrontProduct.findUnique({
      where: { storefrontId_packageId: { storefrontId: storefront.id, packageId: input.packageId } },
      include: { dataPackage: true },
    });
    if (!product || !product.isActive) {
      return apiError(404, "That bundle is not available");
    }

    // Central MTN Number Verification Check (§16, §17)
    const mtnCheck = await validateMtnOrderRecipient(
      input.customerPhone,
      product.dataPackage.network,
      storefront.userId
    );
    if (!mtnCheck.allowed) {
      return apiError(400, mtnCheck.reason ?? "MTN number verification required.");
    }

    // Server-side only commission: sellingPrice - current reseller cost (§48).
    const owner = await prisma.user.findUnique({
      where: { id: storefront.userId },
      select: { id: true, role: true, pricingProfileId: true },
    });
    const ownerCostGHS = await resolveUserWholesalePrice(owner || storefront.userId, product.dataPackage);
    const sellingPrice = product.sellingPrice;
    const productCost = toPesewas(ownerCostGHS);
    const commission = sellingPrice - productCost;
    if (commission < 0) {
      return apiError(500, "This bundle is mispriced. Please contact support.");
    }

    const seq = await prisma.$transaction(async (tx) => nextStorefrontSeq(tx, "storefrontOrder"));
    const paymentReference = generateStorefrontOrderCode();

    const row = await prisma.storefrontOrder.create({
      data: {
        seq,
        storefrontId: storefront.id,
        productId: product.id,
        customerPhone: input.customerPhone,
        customerEmail: input.customerEmail,
        sellingPrice,
        productCost,
        commission,
        status: "PENDING",
        commissionState: "PENDING",
        paymentReference,
      },
    });

    const feePesewas = Math.round(sellingPrice * 0.02);
    const totalPesewas = sellingPrice + feePesewas;

    try {
      const origin = getRequestOrigin(request);

      const authorization = await initializeTransaction({
        email: input.customerEmail,
        amountPesewas: totalPesewas,
        reference: paymentReference,
        callbackUrl: `${origin}/api/store/paystack/callback`,
        metadata: {
          storefrontOrderId: row.id,
          slug,
          seq,
          customerEmail: input.customerEmail,
          customerPhone: input.customerPhone,
          sellingPrice,
          feePesewas,
          totalPesewas,
        },
      });
      return NextResponse.json({
        reference: paymentReference,
        orderCode: paymentReference, // same as Paystack reference for easy tracking
        amount: fromPesewas(totalPesewas),
        basePrice: fromPesewas(sellingPrice),
        fee: fromPesewas(feePesewas),
        authorizationUrl: authorization.authorization_url,
      });
    } catch (initErr) {
      // No orphan rows if Paystack rejects the initialization
      await prisma.storefrontOrder.delete({ where: { id: row.id } }).catch(() => undefined);
      return apiError(502, initErr instanceof Error ? initErr.message : "Payment initialization failed");
    }
  } catch (err) {
    return handleRouteError(err);
  }
}
