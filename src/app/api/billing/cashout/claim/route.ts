import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { claimCashoutByTransactionId } from "@/lib/cashout";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const transactionId = typeof body.transactionId === "string" ? body.transactionId.trim() : "";
    const cashoutId = body.cashoutId ? Number(body.cashoutId) : undefined;

    if (!transactionId) {
      return apiError(400, "Please enter the Cash-Out Transaction ID.");
    }

    const res = await claimCashoutByTransactionId({
      userId: user.id,
      transactionId,
      cashoutId: cashoutId && Number.isInteger(cashoutId) ? cashoutId : undefined,
    });

    if (!res.ok) {
      return NextResponse.json(res, { status: res.pending ? 202 : 400 });
    }

    return NextResponse.json(res);
  } catch (err) {
    return handleRouteError(err);
  }
}
