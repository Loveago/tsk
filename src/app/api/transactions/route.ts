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
    const period = searchParams.get("period") || "all"; // "all" | "today" | "yesterday" | "7days" | "month" | "custom"
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");
    const q = searchParams.get("q")?.trim().toLowerCase() || null;

    // Fresh balance from DB (the source of truth)
    const freshUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { balance: true },
    });
    const currentBalance = freshUser?.balance ?? user.balance;

    // -------------------------------------------------------------------
    // 1. Fetch ALL transactions ordered oldest-first so we can compute a
    //    running balance anchored to current user balance.
    // -------------------------------------------------------------------
    const allTxs = await prisma.walletTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      include: {
        sendClaim: {
          select: {
            id: true,
            transactionReference: true,
            senderPhone: true,
            status: true,
          },
        },
      },
    });

    // Compute sum of all deltas
    let sumDeltas = 0;
    for (const tx of allTxs) {
      sumDeltas += delta(tx.type, tx.amount, tx.status);
    }
    // Baseline starting balance (handles any legacy balance or signup credit)
    const baseline = currentBalance - sumDeltas;

    // Build running balance array
    let running = baseline;
    const enriched = allTxs.map((tx) => {
      const balanceBefore = running;
      running += delta(tx.type, tx.amount, tx.status);
      const balanceAfter = running;
      return {
        ...tx,
        balanceBefore: Math.round(balanceBefore * 100) / 100,
        balanceAfter: Math.round(balanceAfter * 100) / 100,
      };
    });

    // -------------------------------------------------------------------
    // 2. Determine Date Boundaries for Period
    // -------------------------------------------------------------------
    const now = new Date();
    let periodStart: Date | null = null;
    let periodEnd: Date | null = null;

    if (period === "today") {
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (period === "yesterday") {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      periodStart = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0, 0);
      periodEnd = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999);
    } else if (period === "7days") {
      periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      periodEnd = now;
    } else if (period === "month") {
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      periodEnd = now;
    } else if (period === "custom" && startDateParam) {
      periodStart = new Date(startDateParam);
      periodEnd = endDateParam ? new Date(endDateParam) : new Date();
      if (endDateParam && endDateParam.length <= 10) {
        periodEnd.setHours(23, 59, 59, 999);
      }
    }

    // -------------------------------------------------------------------
    // 3. Compute Period Ledger Stats (Starting Balance & Ending Balance)
    // -------------------------------------------------------------------
    let periodStartingBalance = baseline;
    let periodEndingBalance = currentBalance;

    if (periodStart) {
      // Find the last transaction that occurred BEFORE the period started
      const priorTxs = enriched.filter((tx) => new Date(tx.createdAt) < periodStart!);
      if (priorTxs.length > 0) {
        periodStartingBalance = priorTxs[priorTxs.length - 1].balanceAfter;
      } else {
        periodStartingBalance = baseline;
      }
    }

    if (periodEnd) {
      // Find the last transaction that occurred on or before periodEnd
      const withinOrPriorTxs = enriched.filter((tx) => new Date(tx.createdAt) <= periodEnd!);
      if (withinOrPriorTxs.length > 0) {
        periodEndingBalance = withinOrPriorTxs[withinOrPriorTxs.length - 1].balanceAfter;
      } else {
        periodEndingBalance = periodStartingBalance;
      }
    }

    // Period specific items
    const inPeriodTxs = enriched.filter((tx) => {
      const txDate = new Date(tx.createdAt);
      if (periodStart && txDate < periodStart) return false;
      if (periodEnd && txDate > periodEnd) return false;
      return true;
    });

    let periodCredits = 0;
    let periodDebits = 0;
    for (const tx of inPeriodTxs) {
      if (tx.status !== "APPROVED") continue;
      const d = delta(tx.type, tx.amount, tx.status);
      if (d > 0) periodCredits += d;
      else if (d < 0) periodDebits += Math.abs(d);
    }

    // -------------------------------------------------------------------
    // 4. Apply Type and Query Filters
    // -------------------------------------------------------------------
    // Reverse newest-first for user display
    const newestFirst = [...inPeriodTxs].reverse();

    const filtered = newestFirst.filter((tx) => {
      // Type filter
      if (filterType === "CREDIT") {
        const isCredit =
          tx.type === "TOPUP" ||
          tx.type === "REFUND" ||
          (tx.type === "ADJUSTMENT" && tx.amount > 0);
        if (!isCredit) return false;
      } else if (filterType === "DEBIT") {
        const isDebit =
          tx.type === "DEBIT" ||
          tx.type === "SIGNUP_FEE" ||
          (tx.type === "ADJUSTMENT" && tx.amount < 0);
        if (!isDebit) return false;
      }

      // Query filter
      if (q) {
        const matchNote = tx.note?.toLowerCase().includes(q);
        const matchRef = tx.reference?.toLowerCase().includes(q);
        const matchType = tx.type.toLowerCase().includes(q);
        const matchAmount = String(tx.amount).includes(q);
        const matchPhone = tx.sendClaim?.senderPhone?.toLowerCase().includes(q);
        if (!matchNote && !matchRef && !matchType && !matchAmount && !matchPhone) {
          return false;
        }
      }

      return true;
    });

    // -------------------------------------------------------------------
    // 5. Paginate
    // -------------------------------------------------------------------
    const total = filtered.length;
    const pages = Math.ceil(total / pageSize);
    const data = filtered.slice((page - 1) * pageSize, page * pageSize);

    // -------------------------------------------------------------------
    // 6. Overall All-time Stats
    // -------------------------------------------------------------------
    let totalCredits = 0;
    let totalDebits = 0;
    for (const tx of allTxs) {
      if (tx.status !== "APPROVED") continue;
      const d = delta(tx.type, tx.amount, tx.status);
      if (d > 0) totalCredits += d;
      else if (d < 0) totalDebits += Math.abs(d);
    }

    return NextResponse.json({
      data,
      total,
      page,
      pageSize,
      pages,
      balance: currentBalance,
      period,
      periodStats: {
        startingBalance: Math.round(periodStartingBalance * 100) / 100,
        endingBalance: Math.round(periodEndingBalance * 100) / 100,
        credits: Math.round(periodCredits * 100) / 100,
        debits: Math.round(periodDebits * 100) / 100,
        netChange: Math.round((periodCredits - periodDebits) * 100) / 100,
        count: inPeriodTxs.length,
      },
      summary: {
        totalCredits: Math.round(totalCredits * 100) / 100,
        totalDebits: Math.round(totalDebits * 100) / 100,
        netChange: Math.round((totalCredits - totalDebits) * 100) / 100,
        transactionCount: allTxs.length,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
