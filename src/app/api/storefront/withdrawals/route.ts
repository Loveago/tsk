import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, requireAdmin } from "@/lib/auth";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { storefrontWithdrawalSchema, storefrontWithdrawalReviewSchema } from "@/lib/validation";
import {
  requireStorefront,
  ensureWallet,
  nextStorefrontSeq,
  MIN_WITHDRAWAL_P,
  toPesewas,
  fromPesewas,
  approveWithdrawal,
  rejectWithdrawal,
} from "@/lib/storefront";

/** Owner: request a MoMo withdrawal (min GHS 50, from available balance only). */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const storefront = await requireStorefront(user.id);
    if (storefront.status !== "ENABLED") return apiError(403, "Storefront is not active");
    
    // Check if withdrawals are enabled
    const withdrawalsEnabled = await prisma.systemSetting.findUnique({
      where: { key: "storefront_withdrawal_enabled" },
    });
    if (withdrawalsEnabled?.value === "false") {
      return apiError(400, "Withdrawals are currently disabled by the administrator.");
    }

    const input = storefrontWithdrawalSchema.parse(await request.json());

    const wallet = await ensureWallet(user.id);

    const minWithdrawalSetting = await prisma.systemSetting.findUnique({
      where: { key: "storefront_min_withdrawal" },
    });
    const dynamicMinWithdrawalP = minWithdrawalSetting?.value
      ? toPesewas(parseFloat(minWithdrawalSetting.value))
      : MIN_WITHDRAWAL_P;

    const maxWithdrawalSetting = await prisma.systemSetting.findUnique({
      where: { key: "storefront_max_withdrawal" },
    });
    const dynamicMaxWithdrawalP = maxWithdrawalSetting?.value
      ? toPesewas(parseFloat(maxWithdrawalSetting.value))
      : toPesewas(10000);

    const amount = toPesewas(input.amount);
    
    if (amount < dynamicMinWithdrawalP) {
      return apiError(400, `Minimum withdrawal is GHS ${fromPesewas(dynamicMinWithdrawalP).toFixed(2)}`);
    }
    if (amount > dynamicMaxWithdrawalP) {
      return apiError(400, `Maximum withdrawal is GHS ${fromPesewas(dynamicMaxWithdrawalP).toFixed(2)}`);
    }

    // Apply fee
    const feeSetting = await prisma.systemSetting.findUnique({
      where: { key: "storefront_withdrawal_fee_percent" },
    });
    const feePercent = feeSetting?.value ? parseFloat(feeSetting.value) : 0;
    const feeP = Math.floor(amount * (feePercent / 100));
    
    // We debit the full amount, but payout will be amount - fee
    // Note: since schema may not have a fee field, we rely on the amount for the debit
    const totalDebitP = amount; 
    const payoutAmountP = amount - feeP;

    if (wallet.balance < totalDebitP) {
      return apiError(400, "Amount exceeds your available balance");
    }
    const pending = await prisma.storefrontWithdrawal.findFirst({
      where: { userId: user.id, status: "PENDING" },
    });
    if (pending) {
      return apiError(409, "You already have a withdrawal awaiting review");
    }

    const seq = await prisma.$transaction(async (tx) => nextStorefrontSeq(tx, "storefrontWithdrawal"));
    const withdrawal = await prisma.storefrontWithdrawal.create({
      data: {
        seq,
        userId: user.id,
        amount: totalDebitP, // Amount debited from wallet
        network: input.network,
        momoNumber: input.momoNumber,
        accountName: input.accountName,
        status: "PENDING",
        // Storing the net payout in the note for admin reference, since there's no dedicated fee column
        adminNote: feeP > 0 ? `Fee: GHS ${fromPesewas(feeP).toFixed(2)} | Net Payout: GHS ${fromPesewas(payoutAmountP).toFixed(2)}` : undefined,
      },
    });

    const autoApproveSetting = await prisma.systemSetting.findUnique({
      where: { key: "storefront_auto_approve_withdrawal" },
    });
    
    if (autoApproveSetting?.value === "true") {
      await approveWithdrawal(withdrawal.id, withdrawal.adminNote || "Auto-approved");
      withdrawal.status = "APPROVED";
    }

    return NextResponse.json({ withdrawal });
  } catch (err) {
    return handleRouteError(err);
  }
}

/** Admin: approve (debits wallet atomically) or reject a withdrawal. */
export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const input = storefrontWithdrawalReviewSchema.parse(body);
    const { id } = body as { id?: string };
    if (!id) return apiError(400, "Withdrawal id is required");

    const withdrawal =
      input.action === "APPROVE"
        ? await approveWithdrawal(id, input.adminNote || undefined)
        : await rejectWithdrawal(id, input.adminNote || undefined);

    return NextResponse.json({ withdrawal });
  } catch (err) {
    return handleRouteError(err);
  }
}
