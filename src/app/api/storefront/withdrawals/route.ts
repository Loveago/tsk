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
    const input = storefrontWithdrawalSchema.parse(await request.json());

    const wallet = await ensureWallet(user.id);
    const amount = toPesewas(input.amount);
    if (amount < MIN_WITHDRAWAL_P) {
      return apiError(400, `Minimum withdrawal is GHS ${fromPesewas(MIN_WITHDRAWAL_P).toFixed(2)}`);
    }
    if (wallet.balance < amount) {
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
        amount,
        network: input.network,
        momoNumber: input.momoNumber,
        accountName: input.accountName,
        status: "PENDING",
      },
    });
    return NextResponse.json({ withdrawal });
  } catch (err) {
    return handleRouteError(err);
  }
}

/** Admin: approve (debits wallet atomically) or reject a withdrawal. */
export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const input = storefrontWithdrawalReviewSchema.parse(await request.json());
    const { id } = (await request.json()) as { id?: string };
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
