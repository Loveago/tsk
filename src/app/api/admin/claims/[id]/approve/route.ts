import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAdmin();
    const { id } = await params;

    const claim = await prisma.sendClaim.findUnique({
      where: { id },
      include: { user: true, incomingTransaction: true },
    });

    if (!claim) return apiError(404, "Claim not found");
    if (claim.status === "APPROVED") return apiError(400, "Claim is already approved");

    const amount = claim.claimedAmount;

    await prisma.$transaction(async (tx) => {
      // 1. Create wallet credit ledger transaction
      const walletTx = await tx.walletTransaction.create({
        data: {
          userId: claim.userId,
          type: "TOPUP",
          amount,
          status: "APPROVED",
          reference: `MOMO-MANUAL-${claim.transactionReference}`,
          note: `Admin override approval for MoMo claim (${claim.network} Ref: ${claim.transactionReference})`,
        },
      });

      // 2. Increment user balance
      await tx.user.update({
        where: { id: claim.userId },
        data: { balance: { increment: amount } },
      });

      // 3. Mark claim approved
      await tx.sendClaim.update({
        where: { id: claim.id },
        data: {
          status: "APPROVED",
          walletTransactionId: walletTx.id,
          processedAt: new Date(),
        },
      });

      // 4. If linked to incoming MoMo transaction, mark it claimed
      if (claim.incomingMomoTransactionId) {
        await tx.incomingMomoTransaction.update({
          where: { id: claim.incomingMomoTransactionId },
          data: { status: "CLAIMED" },
        });
      }
    });

    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: "claim.admin_approve",
      target: `claim:${claim.id}`,
      previousValue: JSON.stringify({ status: claim.status }),
      newValue: JSON.stringify({ status: "APPROVED", amount, user: claim.user.email }),
    });

    const { sendClaimSuccessEmail } = await import("@/lib/email");
    sendClaimSuccessEmail(
      claim.user.email,
      claim.user.name,
      amount,
      claim.transactionReference,
      claim.network
    ).catch(() => {});

    return NextResponse.json({ ok: true, message: "Claim approved and funds credited" });
  } catch (err) {
    return handleRouteError(err);
  }
}


