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
    if (!(await isPaystackConfigured())) {
      return apiError(503, "Online payment is not available right now.");
    }

    // Check if recipient number already has a pending or processing order (§15)
    const existingActiveOrder = await prisma.order.findFirst({
      where: {
        phoneNumber: input.customerPhone,
        status: { in: ["PENDING", "PROCESSING"] },
      },
      select: { id: true, status: true },
    });
    if (existingActiveOrder) {
      return apiError(
        400,
        `Cannot place order for ${input.customerPhone}: this number currently has an active order in ${existingActiveOrder.status.toLowerCase()} status.`
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
    const sellingPrice = product.sellingPrice;
    const productCost = toPesewas(product.dataPackage.retailPriceGHS ?? 0);
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
        sellingPrice,
        productCost,
        commission,
        status: "PENDING",
        commissionState: "PENDING",
        paymentReference,
      },
    });

    try {
      const origin = getRequestOrigin(request);
      const owner = await prisma.user.findUniqueOrThrow({
        where: { id: storefront.userId },
        select: { email: true },
      });
      const authorization = await initializeTransaction({
        email: owner.email, // buyer pays without an account
        amountPesewas: sellingPrice,
        reference: paymentReference,
        callbackUrl: `${origin}/api/store/paystack/callback`,
        metadata: { storefrontOrderId: row.id, slug, seq },
      });
      return NextResponse.json({
        reference: paymentReference,
        orderCode: paymentReference, // same as Paystack reference for easy tracking
        amount: fromPesewas(sellingPrice),
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
