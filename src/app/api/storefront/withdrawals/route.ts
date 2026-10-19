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
  withdrawalCode,
  applyLedgerEntry,
} from "@/lib/storefront";

const activeWithdrawalUsers = new Set<string>();

/** Owner: request a MoMo withdrawal (min GHS 50, from available balance only). */
export async function POST(request: NextRequest) {
  let lockUserId: string | null = null;
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

    // Check user concurrency lock to prevent double clicks / parallel submissions
    if (activeWithdrawalUsers.has(user.id)) {
      return apiError(409, "Withdrawal is already in progress. Please wait a moment.");
    }
    activeWithdrawalUsers.add(user.id);
    lockUserId = user.id;

    // Fast check if user already has a pending withdrawal
    const existingPending = await prisma.storefrontWithdrawal.findFirst({
      where: { userId: user.id, status: "PENDING" },
    });
    if (existingPending) {
      return apiError(
        409,
        "Withdrawals are locked: you already have a pending withdrawal awaiting review. To prevent double withdrawals, please wait until it is processed."
      );
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

    // Execute atomic creation and lock check inside a database transaction
    const withdrawal = await prisma.$transaction(async (tx) => {
      // Double check inside transaction to prevent race conditions
      const pendingInTx = await tx.storefrontWithdrawal.findFirst({
        where: { userId: user.id, status: "PENDING" },
      });
      if (pendingInTx) {
        throw new Error("PENDING_WITHDRAWAL_LOCKED");
      }

      const freshWallet = await tx.storefrontWallet.findUnique({
        where: { userId: user.id },
      });
      if (!freshWallet || freshWallet.balance < totalDebitP) {
        throw new Error("INSUFFICIENT_BALANCE");
      }

      const seq = await nextStorefrontSeq(tx, "storefrontWithdrawal");
      const ref = withdrawalCode(seq);

      const createdWd = await tx.storefrontWithdrawal.create({
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
          reference: ref,
          note: `Withdrawal request of GHS ${fromPesewas(amount).toFixed(2)} (Fee: GHS ${fromPesewas(feeP).toFixed(2)}, Net Payout: GHS ${fromPesewas(payoutAmountP).toFixed(2)})`,
          adminNote: `Net payout to send: GHS ${fromPesewas(payoutAmountP).toFixed(2)} (Fee: GHS ${fromPesewas(feeP).toFixed(2)})`,
        },
      });

      // Deduct the requested amount from the wallet IMMEDIATELY so it is not left in the account
      await applyLedgerEntry(tx, freshWallet.id, {
        type: "WITHDRAWAL",
        amount: -totalDebitP,
        reference: ref,
        description: `MoMo withdrawal request (${input.network} ${input.momoNumber})`,
      });

      return createdWd;
    });

    // Check Paystack Auto-Payout Setting
    const paystackAutoSetting = await prisma.systemSetting.findUnique({
      where: { key: "storefront_paystack_auto_payout_enabled" },
    });
    const isPaystackAuto = paystackAutoSetting?.value === "true";

    if (isPaystackAuto) {
      const maxAutoSetting = await prisma.systemSetting.findUnique({
        where: { key: "storefront_paystack_max_auto_amount" },
      });
      const maxAutoGhs = maxAutoSetting?.value ? parseFloat(maxAutoSetting.value) : Infinity;
      const amountGhs = fromPesewas(amount);

      if (amountGhs <= maxAutoGhs) {
        const { executePaystackWithdrawalPayout } = await import("@/lib/paystack");
        const payout = await executePaystackWithdrawalPayout({
          amountPesewas: payoutAmountP,
          momoNumber: input.momoNumber,
          accountName: input.accountName,
          network: input.network,
          reference: withdrawal.reference || `TSK-WD-${String(withdrawal.seq).padStart(5, "0")}`,
          reason: `Storefront payout ${withdrawal.reference || withdrawal.seq}`,
        });

        if (payout.success) {
          const finalStatus = payout.status === "success" ? "APPROVED" : "PROCESSING";
          const updated = await prisma.storefrontWithdrawal.update({
            where: { id: withdrawal.id },
            data: {
              status: finalStatus,
              payoutMethod: "PAYSTACK_AUTO",
              paystackTransferCode: payout.transferCode,
              paystackRecipientCode: payout.recipientCode,
              processedBy: "PAYSTACK_AUTO",
              processedAt: new Date(),
              adminNote: `Paystack Auto-Payout (${payout.status}): Transfer Code ${payout.transferCode || "N/A"}`,
            },
          });
          return NextResponse.json({
            withdrawal: updated,
            autoPayout: true,
            message: "Withdrawal processed instantly via Paystack Mobile Money.",
          });
        } else {
          // If Paystack call fails (e.g. low balance), keep PENDING so admin can review and retry or pay manually
          const updated = await prisma.storefrontWithdrawal.update({
            where: { id: withdrawal.id },
            data: {
              payoutMethod: "PAYSTACK_AUTO",
              adminNote: `Paystack auto-payout initiation failed: ${payout.error || "Unknown error"}. Awaiting manual admin payout or retry.`,
            },
          });
          return NextResponse.json({
            withdrawal: updated,
            autoPayout: false,
            message: "Withdrawal request placed. Awaiting manual payout review.",
          });
        }
      }
    }

    const autoApproveSetting = await prisma.systemSetting.findUnique({
      where: { key: "storefront_auto_approve_withdrawal" },
    });
    
    if (autoApproveSetting?.value === "true") {
      await approveWithdrawal(withdrawal.id, withdrawal.adminNote || "Auto-approved", "SYSTEM");
      withdrawal.status = "APPROVED";
    }

    return NextResponse.json({ withdrawal });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "PENDING_WITHDRAWAL_LOCKED") {
        return apiError(
          409,
          "Withdrawals are locked: you already have a pending withdrawal awaiting review. To prevent double withdrawals, please wait until it is processed."
        );
      }
      if (err.message === "INSUFFICIENT_BALANCE") {
        return apiError(400, "Amount exceeds your available balance");
      }
    }
    return handleRouteError(err);
  } finally {
    if (lockUserId) {
      activeWithdrawalUsers.delete(lockUserId);
    }
  }
}

/** Admin: approve (debits wallet atomically), reject, or trigger Paystack payout. */
export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const input = storefrontWithdrawalReviewSchema.parse(body);
    const { id } = body as { id?: string };
    if (!id) return apiError(400, "Withdrawal id is required");

    if (input.action === "PAYSTACK_PAYOUT") {
      const wd = await prisma.storefrontWithdrawal.findUnique({ where: { id } });
      if (!wd) return apiError(404, "Withdrawal not found");
      if (wd.status !== "PENDING" && wd.status !== "PROCESSING") {
        return apiError(400, "Only PENDING or PROCESSING withdrawals can be paid via Paystack");
      }

      const netAmountP = wd.netAmount || (wd.amount - (wd.fee || 100));
      const ref = wd.reference || `TSK-WD-${String(wd.seq).padStart(5, "0")}`;
      // In case of retry, generate an execution reference
      const executionRef = `${ref}-R${Date.now().toString().slice(-4)}`;

      const { executePaystackWithdrawalPayout } = await import("@/lib/paystack");
      const payout = await executePaystackWithdrawalPayout({
        amountPesewas: netAmountP,
        momoNumber: wd.momoNumber,
        accountName: wd.accountName,
        network: wd.network,
        reference: executionRef,
        reason: `Storefront payout ${ref}`,
      });

      if (!payout.success) {
        await prisma.storefrontWithdrawal.update({
          where: { id },
          data: {
            adminNote: `Manual Paystack payout attempt failed: ${payout.error || "Unknown"}. (Attempted by ${admin.email || admin.id})`,
          },
        });
        return apiError(400, `Paystack transfer failed: ${payout.error || "Unknown error"}`);
      }

      const updated = await prisma.storefrontWithdrawal.update({
        where: { id },
        data: {
          status: payout.status === "success" ? "APPROVED" : "PROCESSING",
          payoutMethod: "PAYSTACK_AUTO",
          paystackTransferCode: payout.transferCode,
          paystackRecipientCode: payout.recipientCode,
          processedBy: admin.email || admin.id,
          processedAt: new Date(),
          adminNote: `Paid via Paystack by ${admin.email || "admin"}. Transfer Code: ${payout.transferCode || "N/A"}`,
        },
      });

      return NextResponse.json({
        withdrawal: updated,
        message: "Paystack transfer initiated successfully.",
      });
    }

    const withdrawal =
      input.action === "APPROVE"
        ? await approveWithdrawal(id, input.adminNote || undefined, admin.email || admin.id)
        : await rejectWithdrawal(id, input.adminNote || undefined, admin.email || admin.id);

    return NextResponse.json({ withdrawal });
  } catch (err) {
    return handleRouteError(err);
  }
}
