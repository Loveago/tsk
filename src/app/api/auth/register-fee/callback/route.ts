import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession, getClientIp } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { getRequestOrigin } from "@/lib/api-helpers";
import { verifyTransaction, PAYSTACK_CURRENCY } from "@/lib/paystack";

export async function GET(request: NextRequest) {
  const origin = getRequestOrigin(request);
  const rawRef =
    request.nextUrl.searchParams.get("reference") ??
    request.nextUrl.searchParams.get("trxref") ??
    "";
  const reference = rawRef.trim();

  if (!reference) {
    return NextResponse.redirect(new URL("/register?error=missing_reference", origin));
  }

  try {
    const verification = await verifyTransaction(reference);

    if (verification.status !== "success" || verification.currency !== PAYSTACK_CURRENCY) {
      return NextResponse.redirect(
        new URL(
          `/register?error=payment_failed&reason=${encodeURIComponent(
            verification.gateway_response || verification.status || "Payment was not successful"
          )}`,
          origin
        )
      );
    }

    // Find the signup fee transaction
    const tx = await prisma.walletTransaction.findFirst({
      where: { reference, type: "SIGNUP_FEE" },
      include: { user: true },
    });

    if (!tx || !tx.user) {
      return NextResponse.redirect(
        new URL("/register?error=transaction_not_found", origin)
      );
    }

    const user = tx.user;

    // If already active (e.g. settled by webhook first), just establish session and redirect
    if (user.status === "ACTIVE") {
      await createSession({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tokenVersion: user.tokenVersion,
      });

      return NextResponse.redirect(new URL("/dashboard?activated=true", origin));
    }

    // Atomically activate user and approve transaction
    await prisma.$transaction(async (prismaTx) => {
      await prismaTx.user.update({
        where: { id: user.id },
        data: { status: "ACTIVE" },
      });

      await prismaTx.walletTransaction.update({
        where: { id: tx.id },
        data: {
          status: "APPROVED",
          note: `${tx.note || "Signup registration fee"} — Verified via Paystack callback${
            verification.channel ? ` (${verification.channel})` : ""
          }`,
        },
      });
    });

    // Establish session cookie
    await createSession({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tokenVersion: user.tokenVersion,
    });

    const ip = await getClientIp();
    await recordAudit({
      userId: user.id,
      actorLabel: user.email,
      action: "auth.register_fee_settled",
      target: `user:${user.id}`,
      newValue: JSON.stringify({
        reference,
        amount: tx.amount,
        channel: verification.channel,
      }),
      ip,
    });

    return NextResponse.redirect(new URL("/dashboard?activated=true", origin));
  } catch (err) {
    console.error("Paystack registration fee callback error:", err);
    return NextResponse.redirect(
      new URL(
        `/register?error=verification_error&message=${encodeURIComponent(
          err instanceof Error ? err.message : "Error verifying payment"
        )}`,
        origin
      )
    );
  }
}
