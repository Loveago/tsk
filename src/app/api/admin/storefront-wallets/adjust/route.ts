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
  amountGHS: z.number().positive("Amount must be greater than 0"),
  reason: z.string().min(3, "Reason must be at least 3 characters"),
});

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdmin();
    const body = await request.json();
    const input = adjustSchema.parse(body);

    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, name: true, email: true },
    });
    if (!user) {
      return apiError(404, "User not found");
    }

    const wallet = await ensureWallet(input.userId);
    const amountPesewas = Math.round(input.amountGHS * 100);

    if (input.type === "DEBIT" && wallet.balance < amountPesewas) {
      return apiError(
        400,
        `Cannot debit GHS ${input.amountGHS.toFixed(2)}. Reseller's available storefront balance is only GHS ${fromPesewas(wallet.balance).toFixed(2)}.`
      );
    }

    const signedAmount = input.type === "CREDIT" ? amountPesewas : -amountPesewas;
    const ref = `ADMIN-ADJ-${Date.now()}`;
    const description = `Manual ${input.type.toLowerCase()} by admin (${actor.email}): ${input.reason.trim()}`;

    await prisma.$transaction(async (tx) => {
      await applyLedgerEntry(tx, wallet.id, {
        type: "ADJUSTMENT",
        amount: signedAmount,
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
      action: `STOREFRONT_WALLET_${input.type}`,
      target: `user:${input.userId}`,
      previousValue: `balance: ${fromPesewas(wallet.balance)} GHS`,
      newValue: `balance: ${fromPesewas(updatedWallet.balance)} GHS (amount: ${input.amountGHS.toFixed(2)} GHS, reason: ${input.reason})`,
      ip,
    });

    return NextResponse.json({
      ok: true,
      message: `Successfully ${input.type === "CREDIT" ? "credited" : "debited"} GHS ${input.amountGHS.toFixed(2)} for ${user.name}`,
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
