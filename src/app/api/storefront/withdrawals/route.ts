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

    // Apply 1 GHS (100 pesewas) fixed fee for withdrawals
    const fixedFeeSetting = await prisma.systemSetting.findUnique({
      where: { key: "storefront_withdrawal_fee_fixed" },
    });
    const feeP = fixedFeeSetting?.value ? toPesewas(parseFloat(fixedFeeSetting.value)) : 100; // 100 pesewas = 1 GHS

    if (amount <= feeP) {
      return apiError(400, `Withdrawal amount must be greater than the GHS ${fromPesewas(feeP).toFixed(2)} fee`);
    }

    // We debit the full requested amount from the wallet, payout will be net of fee
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
        fee: feeP, // 1 GHS fee
        netAmount: payoutAmountP, // Net payout to user
        network: input.network,
        momoNumber: input.momoNumber,
        accountName: input.accountName,
        status: "PENDING",
        note: `Withdrawal request of GHS ${fromPesewas(amount).toFixed(2)} (Fee: GHS ${fromPesewas(feeP).toFixed(2)}, Net Payout: GHS ${fromPesewas(payoutAmountP).toFixed(2)})`,
        adminNote: `Net payout to send: GHS ${fromPesewas(payoutAmountP).toFixed(2)} (Fee: GHS ${fromPesewas(feeP).toFixed(2)})`,
      },
    });

    const autoApproveSetting = await prisma.systemSetting.findUnique({
      where: { key: "storefront_auto_approve_withdrawal" },
    });
    
    if (autoApproveSetting?.value === "true") {
      await approveWithdrawal(withdrawal.id, withdrawal.adminNote || "Auto-approved", "SYSTEM");
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
        ? await approveWithdrawal(id, input.adminNote || undefined, admin.email || admin.id)
        : await rejectWithdrawal(id, input.adminNote || undefined, admin.email || admin.id);

    return NextResponse.json({ withdrawal });
  } catch (err) {
    return handleRouteError(err);
  }
}
