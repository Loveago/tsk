import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getClientIp } from "@/lib/auth";
import { manualDebitSchema } from "@/lib/validation";
import { adminManualDebitWallet } from "@/lib/send-claim";
import { handleRouteError } from "@/lib/api-helpers";

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdmin();
    const body = await request.json();
    const input = manualDebitSchema.parse(body);
    const ip = await getClientIp();

    const result = await adminManualDebitWallet({
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
      message: `Successfully debited GHS ${result.amount.toFixed(2)} from user wallet`,
      data: result,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
