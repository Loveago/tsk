import { NextRequest, NextResponse } from "next/server";
import { reconcileUnsettledStorefrontOrders } from "@/lib/storefront";

/**
 * Scheduled cron / periodic background worker:
 * Finds any storefront order from the last 48 hours that hasn't been settled
 * (e.g. buyer closed their browser before redirect, webhook delivery failed, or network dropped).
 * Automatically queries Paystack to verify if the payment was actually completed.
 * If verified, it settles the order, creates the Tskconnect admin order with status PENDING,
 * releases/tracks commissions, and dispatches it into the fulfillment queue.
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const hours = Math.min(168, Math.max(1, parseInt(url.searchParams.get("hours") || "48", 10) || 48));

    const result = await reconcileUnsettledStorefrontOrders(hours);

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("Storefront reconciliation cron error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to reconcile storefront orders" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
