import { NextRequest, NextResponse } from "next/server";
import { getRequestOrigin } from "@/lib/api-helpers";
import { verifyAndSettlePaystackTopup } from "@/lib/paystack";

/**
 * Landing page after the Paystack hosted checkout.
 * Verifies the charge with the API and settles the wallet top-up.
 * Uses verifyAndSettlePaystackTopup with retry to ensure immediate approval.
 */
export async function GET(request: NextRequest) {
  let outcome: "success" | "pending" | "failed" = "failed";
  let reference = "";

  const origin = getRequestOrigin(request);

  try {
    const rawRef =
      request.nextUrl.searchParams.get("reference") ??
      request.nextUrl.searchParams.get("trxref") ??
      "";
    reference = rawRef.trim();

    if (!reference) {
      return NextResponse.redirect(new URL("/dashboard/billing?paystack=failed", origin));
    }

    // Attempt settlement immediately
    let result = await verifyAndSettlePaystackTopup(reference);

    // If not settled yet and status is not a terminal failure, retry once after a short 1.5s pause
    // (Paystack sometimes takes a moment to mark success right upon redirect)
    if (!result.settled && result.status !== "failed" && result.status !== "abandoned") {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      result = await verifyAndSettlePaystackTopup(reference);
    }

    if (result.settled) {
      outcome = "success";
    } else if (result.status === "ongoing" || result.status === "pending") {
      outcome = "pending";
    } else {
      outcome = "failed";
    }
  } catch (err) {
    console.error("Paystack callback error:", err);
    outcome = "failed";
  }

  return NextResponse.redirect(
    new URL(
      `/dashboard/billing?paystack=${outcome}&reference=${encodeURIComponent(reference)}`,
      origin
    )
  );
}

