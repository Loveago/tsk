import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";

/**
 * Compute the signed balance delta for a wallet transaction.
 * - TOPUP / REFUND / positive ADJUSTMENT → adds to balance
 * - DEBIT / SIGNUP_FEE / negative ADJUSTMENT → subtracts from balance
 * Only APPROVED transactions change the balance.
 */
function delta(type: string, amount: number, status: string): number {
  if (status !== "APPROVED") return 0;
  switch (type) {
    case "TOPUP":
    case "REFUND":
      return Math.abs(amount);
    case "DEBIT":
    case "SIGNUP_FEE":
      return -Math.abs(amount);
    case "ADJUSTMENT":
      // Adjustments can be positive (credit) or negative (debit).
      return amount;
    default:
      return 0;
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));
    const filterType = searchParams.get("type") || null; // "CREDIT" | "DEBIT" | null

    // -------------------------------------------------------------------
    // 1. Fetch ALL transactions ordered oldest-first so we can compute a
    //    running balance. This is necessary for accurate before/after values.
    // -------------------------------------------------------------------
    const allTxs = await prisma.walletTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });

    // Build running balance array
    let running = 0;
    const enriched = allTxs.map((tx) => {
      const balanceBefore = running;
      running += delta(tx.type, tx.amount, tx.status);
      const balanceAfter = running;
      return { ...tx, balanceBefore, balanceAfter };
    });

    // Reverse to newest-first for display
    const newestFirst = [...enriched].reverse();

    // -------------------------------------------------------------------
    // 2. Apply optional type filter
    //    "CREDIT" = TOPUP | REFUND | positive ADJUSTMENT
    //    "DEBIT"  = DEBIT | SIGNUP_FEE | negative ADJUSTMENT
    // -------------------------------------------------------------------
    const filtered =
      filterType === "CREDIT"
        ? newestFirst.filter(
            (tx) =>
              tx.type === "TOPUP" ||
              tx.type === "REFUND" ||
              (tx.type === "ADJUSTMENT" && tx.amount > 0)
          )
        : filterType === "DEBIT"
        ? newestFirst.filter(
            (tx) =>
              tx.type === "DEBIT" ||
              tx.type === "SIGNUP_FEE" ||
              (tx.type === "ADJUSTMENT" && tx.amount < 0)
          )
        : newestFirst;

    // -------------------------------------------------------------------
    // 3. Paginate
    // -------------------------------------------------------------------
    const total = filtered.length;
    const pages = Math.ceil(total / pageSize);
    const data = filtered.slice((page - 1) * pageSize, page * pageSize);

    // -------------------------------------------------------------------
    // 4. Summary stats from all APPROVED transactions
    // -------------------------------------------------------------------
    let totalCredits = 0;
    let totalDebits = 0;
    for (const tx of allTxs) {
      if (tx.status !== "APPROVED") continue;
      const d = delta(tx.type, tx.amount, tx.status);
      if (d > 0) totalCredits += d;
      else if (d < 0) totalDebits += Math.abs(d);
    }

    // Fresh balance from DB
    const freshUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { balance: true },
    });

    return NextResponse.json({
      data,
      total,
      page,
      pageSize,
      pages,
      balance: freshUser?.balance ?? user.balance,
      summary: {
        totalCredits,
        totalDebits,
        transactionCount: total,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
