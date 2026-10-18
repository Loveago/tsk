import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, getClientIp } from "@/lib/auth";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { ensureWallet, applyLedgerEntry, fromPesewas } from "@/lib/storefront";
import { recordAudit } from "@/lib/audit";
import { z } from "zod";

const adjustSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  type: z.enum(["CREDIT", "DEBIT"]),
  target: z.enum(["BALANCE", "PENDING"]).default("BALANCE").optional(),
  amountGHS: z.number().positive("Amount must be greater than 0"),
  reason: z.string().min(3, "Reason must be at least 3 characters"),
});

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdmin();
    const body = await request.json();
    const input = adjustSchema.parse(body);
    const targetBalance = input.target ?? "BALANCE";

    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, name: true, email: true },
    });
    if (!user) {
      return apiError(404, "User not found");
    }

    const wallet = await ensureWallet(input.userId);
    const amountPesewas = Math.round(input.amountGHS * 100);

    if (input.type === "DEBIT") {
      if (targetBalance === "PENDING" && wallet.pendingBalance < amountPesewas) {
        return apiError(
          400,
          `Cannot debit GHS ${input.amountGHS.toFixed(2)}. Reseller's pending storefront balance is only GHS ${fromPesewas(wallet.pendingBalance).toFixed(2)}.`
        );
      } else if (targetBalance === "BALANCE" && wallet.balance < amountPesewas) {
        return apiError(
          400,
          `Cannot debit GHS ${input.amountGHS.toFixed(2)}. Reseller's available storefront balance is only GHS ${fromPesewas(wallet.balance).toFixed(2)}.`
        );
      }
    }

    const signedAmount = input.type === "CREDIT" ? amountPesewas : -amountPesewas;
    const ref = `ADMIN-ADJ-${Date.now()}`;
    const targetLabel = targetBalance === "PENDING" ? "pending balance" : "available balance";
    const description = `Manual ${input.type.toLowerCase()} (${targetLabel}) by admin (${actor.email}): ${input.reason.trim()}`;

    await prisma.$transaction(async (tx) => {
      await applyLedgerEntry(tx, wallet.id, {
        type: "ADJUSTMENT",
        amount: signedAmount,
        targetBalance,
        reference: ref,
        description,
      });
    });

    const updatedWallet = await prisma.storefrontWallet.findUniqueOrThrow({
      where: { id: wallet.id },
    });

    const ip = await getClientIp();
    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: `STOREFRONT_WALLET_${targetBalance}_${input.type}`,
      target: `user:${input.userId}`,
      previousValue: `${targetLabel}: ${fromPesewas(targetBalance === "PENDING" ? wallet.pendingBalance : wallet.balance)} GHS`,
      newValue: `${targetLabel}: ${fromPesewas(targetBalance === "PENDING" ? updatedWallet.pendingBalance : updatedWallet.balance)} GHS (amount: ${input.amountGHS.toFixed(2)} GHS, reason: ${input.reason})`,
      ip,
    });

    return NextResponse.json({
      ok: true,
      message: `Successfully ${input.type === "CREDIT" ? "credited" : "debited"} GHS ${input.amountGHS.toFixed(2)} to ${targetLabel} for ${user.name}`,
      wallet: {
        id: updatedWallet.id,
        balance: updatedWallet.balance,
        balanceGHS: fromPesewas(updatedWallet.balance),
        pendingBalance: updatedWallet.pendingBalance,
        pendingBalanceGHS: fromPesewas(updatedWallet.pendingBalance),
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
