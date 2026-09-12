import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyTransaction, PAYSTACK_CURRENCY } from "@/lib/paystack";
import { settleStorefrontPayment, isStorefrontReference } from "@/lib/storefront";

/**
 * Public landing page after the Paystack hosted checkout for storefront
 * orders (buyer has no account). Verifies the charge with the API and
 * settles the storefront order — the webhook remains the primary path.
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  let slug = "";
  let outcome: "success" | "failed" = "failed";
  let reference = "";

  try {
    reference =
      request.nextUrl.searchParams.get("reference") ??
      request.nextUrl.searchParams.get("trxref") ??
      "";

    if (reference && isStorefrontReference(reference)) {
      const row = await prisma.storefrontOrder.findUnique({
        where: { paymentReference: reference },
        select: { storefront: { select: { slug: true } } },
      });
      slug = row?.storefront.slug ?? "";

      if (row) {
        const verification = await verifyTransaction(reference);
        if (
          verification.status === "success" &&
          verification.currency === PAYSTACK_CURRENCY &&
          verification.amount > 0
        ) {
          const result = await settleStorefrontPayment({
            reference,
            paystackAmount: verification.amount,
            paidAt: verification.paidAt ? new Date(verification.paidAt) : undefined,
          });
          outcome = result.settled ? "success" : "failed";
        }
      }
    }
  } catch (err) {
    console.error("Storefront Paystack callback error:", err);
    outcome = "failed";
  }

  const target = slug
    ? `/store/${slug}?payment=${outcome}&reference=${encodeURIComponent(reference)}`
    : `/store?payment=${outcome}`;
  return NextResponse.redirect(new URL(target, origin));
}
