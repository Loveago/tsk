import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";
import {
  verifyTransaction,
  settlePaystackTopup,
  PAYSTACK_CURRENCY,
} from "@/lib/paystack";

/**
 * Landing page after the Paystack hosted checkout. Verifies the charge with
 * the API (never trust redirect params) and settles the wallet top-up.
 * The webhook is the primary settlement path; this is the user-facing
 * confirmation + fallback.
 */
export async function GET(request: NextRequest) {
  let outcome: "success" | "failed" = "failed";
  let reference = "";

  try {
    const user = await requireUser();
    reference = request.nextUrl.searchParams.get("reference") ?? request.nextUrl.searchParams.get("trxref") ?? "";

    const origin = request.nextUrl.origin;
    const redirect = (status: "success" | "failed") =>
      NextResponse.redirect(
        new URL(`/dashboard/billing?paystack=${status}&reference=${encodeURIComponent(reference)}`, origin)
      );

    if (!reference) return redirect("failed");

    const tx = await prisma.walletTransaction.findFirst({ where: { reference } });
    if (!tx || tx.userId !== user.id) return redirect("failed");
    if (tx.status === "APPROVED") return redirect("success");
    if (tx.status !== "PENDING") return redirect("failed");

    const verification = await verifyTransaction(reference);
    const expectedPesewas = Math.round(tx.amount * 100);

    if (
      verification.status === "success" &&
      verification.currency === PAYSTACK_CURRENCY &&
      verification.amount === expectedPesewas
    ) {
      const result = await settlePaystackTopup(tx.id, reference, verification.channel);
      outcome = result.ok || result.alreadySettled ? "success" : "failed";
    }
  } catch (err) {
    // For browser redirects swallow into a failed outcome instead of a JSON error
    console.error("Paystack callback error:", err);
    outcome = "failed";
  }

  const origin = request.nextUrl.origin;
  return NextResponse.redirect(
    new URL(`/dashboard/billing?paystack=${outcome}&reference=${encodeURIComponent(reference)}`, origin)
  );
}
