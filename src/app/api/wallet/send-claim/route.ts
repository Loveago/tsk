import { NextRequest, NextResponse } from "next/server";
import { requireUser, getClientIp } from "@/lib/auth";
import { sendClaimSubmitSchema } from "@/lib/validation";
import { claimMomoTransaction } from "@/lib/send-claim";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { getSetting } from "@/lib/orders";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const input = sendClaimSubmitSchema.parse(body);

    const isEnabled = await getSetting("send_claim_enabled", "true");
    if (isEnabled === "false") {
      return apiError(400, "Send Claim is currently disabled by the administrator.");
    }

    const minAmount = parseFloat(await getSetting("send_claim_min_amount", "1"));
    const maxAmount = parseFloat(await getSetting("send_claim_max_amount", "5000"));

    if (input.amount !== undefined) {
      if (input.amount < minAmount) {
        return apiError(400, `Minimum claim amount is GHS ${minAmount}`);
      }
      if (input.amount > maxAmount) {
        return apiError(400, `Maximum claim amount is GHS ${maxAmount}`);
      }
    }

    const ip = await getClientIp();
    const userAgent = request.headers.get("user-agent") || undefined;

    const result = await claimMomoTransaction({
      userId: user.id,
      userEmail: user.email,
      transactionReference: input.transactionReference,
      amount: input.amount,
      network: input.network,
      senderPhone: input.senderPhone || undefined,
      ip,
      userAgent,
    });

    return NextResponse.json({
      success: true,
      message: `Payment verified! GHS ${result.amount.toFixed(2)} has been added to your wallet.`,
      claim: result,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

