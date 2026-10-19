import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { requireStorefront } from "@/lib/storefront";
import { resolveMobileMoneyAccount } from "@/lib/paystack";
import { phoneSchema } from "@/lib/validation";
import { handleRouteError, apiError } from "@/lib/api-helpers";

const verifyMomoSchema = z.object({
  network: z.enum(["MTN", "TELECEL", "AIRTELTIGO"]),
  momoNumber: phoneSchema,
});

// Simple in-memory rate limiting map for phone verification (max 15 attempts per 5 minutes per user)
const userVerifyAttempts = new Map<string, { count: number; expiresAt: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = userVerifyAttempts.get(userId);

  if (!entry || entry.expiresAt < now) {
    userVerifyAttempts.set(userId, { count: 1, expiresAt: now + 5 * 60 * 1000 });
    return true;
  }

  if (entry.count >= 20) {
    return false;
  }

  entry.count++;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const storefront = await requireStorefront(user.id);
    if (storefront.status !== "ENABLED") {
      return apiError(403, "Storefront is not active");
    }

    if (!checkRateLimit(user.id)) {
      return apiError(429, "Too many verification requests. Please wait a few minutes before trying again.");
    }

    const body = await request.json();
    const { network, momoNumber } = verifyMomoSchema.parse(body);

    const cleanNumber = momoNumber.replace(/\D/g, "");
    const normalizedNumber =
      cleanNumber.startsWith("233") && cleanNumber.length === 12
        ? "0" + cleanNumber.slice(3)
        : cleanNumber;

    const resolved = await resolveMobileMoneyAccount(normalizedNumber, network);

    if (!resolved.account_name) {
      return apiError(400, "Could not resolve registered name for this mobile money account.");
    }

    return NextResponse.json({
      ok: true,
      accountName: resolved.account_name,
      accountNumber: resolved.account_number || normalizedNumber,
      network,
    });
  } catch (err: any) {
    // If Paystack couldn't resolve or rejected the lookup, return friendly message
    const message = err?.message || "";
    if (
      message.toLowerCase().includes("could not resolve") ||
      message.toLowerCase().includes("not found") ||
      message.toLowerCase().includes("invalid account") ||
      message.toLowerCase().includes("400") ||
      message.toLowerCase().includes("422")
    ) {
      return apiError(400, "Could not resolve mobile money account name. Please double-check the network and phone number.");
    }
    return handleRouteError(err);
  }
}
