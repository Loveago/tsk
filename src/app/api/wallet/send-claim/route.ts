import { NextRequest, NextResponse } from "next/server";
import { requireUser, getClientIp } from "@/lib/auth";
import { sendClaimSubmitSchema } from "@/lib/validation";
import { claimMomoTransaction } from "@/lib/send-claim";
import { handleRouteError } from "@/lib/api-helpers";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const input = sendClaimSubmitSchema.parse(body);

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

