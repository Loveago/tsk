import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getClientIp } from "@/lib/auth";
import { manualCreditSchema } from "@/lib/validation";
import { adminManualCreditWallet } from "@/lib/send-claim";
import { handleRouteError } from "@/lib/api-helpers";

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdmin();
    const body = await request.json();
    const input = manualCreditSchema.parse(body);
    const ip = await getClientIp();

    const result = await adminManualCreditWallet({
      adminId: actor.id,
      adminEmail: actor.email,
      userId: input.userId,
      amount: input.amount,
      reason: input.reason,
      reference: input.reference || undefined,
      ip,
    });

    return NextResponse.json({
      ok: true,
      message: `Successfully credited GHS ${result.amount.toFixed(2)} to user wallet`,
      data: result,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

