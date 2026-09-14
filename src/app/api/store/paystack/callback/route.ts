import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhookSignature } from "@/lib/paystack";
import { verifyAndSettleStorefrontOrder } from "@/lib/storefront";
import { getRequestOrigin } from "@/lib/api-helpers";

/**
 * Public landing page after the Paystack hosted checkout for storefront
 * orders (buyer has no account). Verifies the charge with the API and
 * settles the storefront order immediately — idempotent and self-healing.
 */
export async function GET(request: NextRequest) {
  const origin = getRequestOrigin(request);
  let slug = "";
  let outcome: "success" | "failed" = "failed";
  let reference = "";

  try {
    reference =
      request.nextUrl.searchParams.get("reference") ??
      request.nextUrl.searchParams.get("trxref") ??
      "";

    if (reference) {
      const row = await prisma.storefrontOrder.findUnique({
        where: { paymentReference: reference },
        select: { storefront: { select: { slug: true } }, underlyingOrderId: true },
      });
      slug = row?.storefront.slug ?? "";

      if (row) {
        if (row.underlyingOrderId) {
          outcome = "success";
        } else {
          const result = await verifyAndSettleStorefrontOrder(reference);
          outcome = result.settled ? "success" : "failed";
        }
      }
    }
  } catch (err) {
    console.error("Storefront Paystack callback error:", err);
    outcome = "failed";
  }

  // On success redirect to the dedicated order detail page.
  // If outcome was failed but we have a valid order reference and store slug,
  // redirect to the order detail page so the page can perform on-the-fly reconciliation!
  let target: string;
  if (slug && reference) {
    target = `/store/${slug}/order/${encodeURIComponent(reference)}`;
  } else if (slug) {
    target = `/store/${slug}?payment=${outcome}&reference=${encodeURIComponent(reference)}`;
  } else {
    target = `/store?payment=${outcome}`;
  }
  return NextResponse.redirect(new URL(target, origin));
}

/**
 * Paystack webhook handler if Paystack dashboard is configured with
 * /api/store/paystack/callback as the webhook URL.
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-paystack-signature");

    if (!(await verifyWebhookSignature(rawBody, signature))) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    let event: { event?: string; data?: { reference?: string } };
    try {
      event = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    if (event.event !== "charge.success" || !event.data?.reference) {
      return NextResponse.json({ received: true });
    }

    const reference = event.data.reference;
    const result = await verifyAndSettleStorefrontOrder(reference);
    return NextResponse.json({ received: true, settled: result.settled });
  } catch (err) {
    console.error("Storefront webhook POST error:", err);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
