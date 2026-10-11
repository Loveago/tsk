import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleRouteError, apiError, getRequestOrigin } from "@/lib/api-helpers";
import { z } from "zod";
import {
  getGeminiProSettings,
  generateGeminiOrderReference,
  nextGeminiSeq,
} from "@/lib/gemini-pro";
import { isPaystackConfigured, initializeTransaction, calculatePaystackFee } from "@/lib/paystack";
import { getEnabledStorefrontBySlug } from "@/lib/storefront";

const geminiCheckoutSchema = z.object({
  customerEmail: z.string().trim().email("Please enter a valid email address"),
  customerWhatsapp: z
    .string()
    .trim()
    .min(9, "Please enter a valid WhatsApp phone number")
    .max(20, "WhatsApp number is too long"),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await request.json();
    const input = geminiCheckoutSchema.parse(body);

    const storefront = await getEnabledStorefrontBySlug(slug);
    if (!storefront || storefront.status !== "ENABLED") {
      return apiError(404, "Storefront not found");
    }
    if (!storefront.isActive) {
      return apiError(400, "Storefront is temporarily paused.");
    }

    const { enabled, price } = await getGeminiProSettings();
    if (!enabled) {
      return apiError(400, "Google Gemini Pro activation links are currently unavailable.");
    }

    if (!(await isPaystackConfigured())) {
      return apiError(503, "Online payment is currently unavailable. Please try again shortly.");
    }

    const seq = await nextGeminiSeq();
    const paymentReference = generateGeminiOrderReference();
    const { feePesewas, totalPesewas, totalGhs, feeGhs } = calculatePaystackFee(price);

    const order = await prisma.geminiProOrder.create({
      data: {
        seq,
        storefrontId: storefront.id,
        customerEmail: input.customerEmail.toLowerCase(),
        customerWhatsapp: input.customerWhatsapp,
        amount: price,
        paymentReference,
        paystackStatus: "PENDING",
        fulfillmentStatus: "PENDING",
      },
    });

    try {
      let origin = getRequestOrigin(request);
      if (storefront.customDomain) {
        const proto = process.env.NODE_ENV === "production" ? "https" : "http";
        origin = `${proto}://${storefront.customDomain}`;
      }

      const authorization = await initializeTransaction({
        email: input.customerEmail.toLowerCase(),
        amountPesewas: totalPesewas,
        reference: paymentReference,
        callbackUrl: `${origin}/api/store/paystack/callback`,
        metadata: {
          geminiProOrderId: order.id,
          type: "GEMINI_PRO_18M",
          slug,
          seq,
          customerEmail: input.customerEmail.toLowerCase(),
          customerWhatsapp: input.customerWhatsapp,
          basePrice: price,
          feeGhs,
          totalGhs,
        },
      });

      return NextResponse.json({
        reference: paymentReference,
        orderCode: paymentReference,
        amount: price,
        fee: feeGhs,
        total: totalGhs,
        authorizationUrl: authorization.authorization_url,
      });
    } catch (initErr) {
      await prisma.geminiProOrder.delete({ where: { id: order.id } }).catch(() => undefined);
      return apiError(
        502,
        initErr instanceof Error ? initErr.message : "Payment initialization failed"
      );
    }
  } catch (err) {
    return handleRouteError(err);
  }
}
