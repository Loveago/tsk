import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { verifyAndSettlePaystackTopup } from "@/lib/paystack";
import { z } from "zod";

const verifySchema = z.object({
  reference: z.string().trim().optional(),
  transactionId: z.string().trim().optional(),
});

/**
 * On-demand endpoint to verify a Paystack top-up with Paystack's API
 * and immediately approve/settle it into the user's wallet.
 * Allowed for the transaction owner or admin/staff.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return apiError(401, "Authentication required");

    const body = await request.json().catch(() => ({}));
    const input = verifySchema.parse(body);

    if (!input.reference && !input.transactionId) {
      return apiError(400, "Reference or transaction ID is required");
    }

    // Security check: if not staff, ensure this transaction belongs to the calling user
    const tx = await prisma.walletTransaction.findFirst({
      where: {
        OR: [
          ...(input.transactionId ? [{ id: input.transactionId }] : []),
          ...(input.reference ? [{ reference: input.reference }] : []),
        ],
      },
      select: { id: true, userId: true, status: true, reference: true, amount: true },
    });

    if (!tx) {
      return apiError(404, "Transaction not found");
    }

    const isStaff = user.role === "ADMIN" || user.role === "MANAGER" || user.role === "SECRETARY";
    if (tx.userId !== user.id && !isStaff) {
      return apiError(403, "Access denied");
    }

    const result = await verifyAndSettlePaystackTopup(tx.id);

    const updatedUser = await prisma.user.findUnique({
      where: { id: tx.userId },
      select: { balance: true },
    });

    return NextResponse.json({
      success: result.settled,
      settled: result.settled,
      alreadySettled: result.alreadySettled,
      status: result.status ?? (result.settled ? "APPROVED" : tx.status),
      balance: updatedUser?.balance ?? user.balance,
      reason: result.reason,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
