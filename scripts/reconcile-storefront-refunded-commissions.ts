import { prisma } from "../src/lib/prisma";
import { applyLedgerEntry } from "../src/lib/storefront";

/**
 * Script to scan and reconcile storefront commission discrepancies where an in-flight
 * order was refunded and the commission was mistakenly deducted from the user's main
 * balance instead of their pending balance.
 *
 * Usage:
 *   npx tsx scripts/reconcile-storefront-refunded-commissions.ts           # Dry-run
 *   npx tsx scripts/reconcile-storefront-refunded-commissions.ts --execute # Commit changes
 */

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 5, delayMs = 2000): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < maxRetries - 1) {
        await new Promise((res) => setTimeout(res, delayMs));
      }
    }
  }
  throw lastErr;
}

async function main() {
  const isExecute = process.argv.includes("--execute");

  console.log("=================================================================");
  console.log(`STOREFRONT COMMISSION REFUND RECONCILIATION (${isExecute ? "EXECUTE MODE" : "DRY-RUN MODE"})`);
  console.log("=================================================================\n");

  const candidates = await withRetry(async () => {
    // 1. Find all COMMISSION_REVERSAL transactions deducted from main balance
    const reversalsFromMain = await prisma.storefrontWalletTransaction.findMany({
      where: {
        type: "COMMISSION_REVERSAL",
        description: { contains: "main balance" },
      },
      include: {
        wallet: {
          include: {
            user: { select: { id: true, email: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return reversalsFromMain;
  });

  console.log(`Found ${candidates.length} candidate reversal transaction(s) from main balance.\n`);

  const discrepancies: Array<{
    txId: string;
    walletId: string;
    userEmail: string;
    reference: string | null;
    amountPesewas: number;
    amountGhs: number;
    createdAt: Date;
    alreadyReconciled: boolean;
  }> = [];

  for (const tx of candidates) {
    if (!tx.reference) continue;

    // Check if this reference was ever released to main balance
    const wasReleased = await withRetry(async () => {
      return prisma.storefrontWalletTransaction.findFirst({
        where: {
          walletId: tx.walletId,
          reference: tx.reference,
          type: "COMMISSION_RELEASE",
        },
      });
    });

    if (wasReleased) {
      // The order was actually completed and released prior to refund, so deducting from main balance was correct!
      continue;
    }

    // Check if it has already been reconciled by an adjustment
    const alreadyReconciled = await withRetry(async () => {
      return prisma.storefrontWalletTransaction.findFirst({
        where: {
          walletId: tx.walletId,
          type: "ADJUSTMENT",
          reference: tx.reference,
          description: { contains: "Reconcile commission reversal" },
        },
      });
    });

    discrepancies.push({
      txId: tx.id,
      walletId: tx.walletId,
      userEmail: tx.wallet.user.email,
      reference: tx.reference,
      amountPesewas: tx.amount,
      amountGhs: tx.amount / 100,
      createdAt: tx.createdAt,
      alreadyReconciled: Boolean(alreadyReconciled),
    });
  }

  if (discrepancies.length === 0) {
    console.log("✓ No unreleased commission reversal discrepancies found.");
    return;
  }

  console.log(`Found ${discrepancies.length} discrepancy record(s):`);
  console.table(
    discrepancies.map((d) => ({
      User: d.userEmail,
      Reference: d.reference,
      "Amount (GHS)": d.amountGhs.toFixed(2),
      "Date Reversal Occurred": d.createdAt.toISOString(),
      "Already Reconciled": d.alreadyReconciled ? "YES" : "NO",
    }))
  );

  const pendingReconciliation = discrepancies.filter((d) => !d.alreadyReconciled);

  if (pendingReconciliation.length === 0) {
    console.log("\n✓ All discrepancies have already been reconciled.");
    return;
  }

  if (!isExecute) {
    console.log(`\nFound ${pendingReconciliation.length} transaction(s) needing reconciliation.`);
    console.log("Run with `--execute` to apply corrections to wallet balances and log audit adjustments.");
    return;
  }

  console.log(`\nApplying corrections for ${pendingReconciliation.length} transaction(s)...`);

  for (const item of pendingReconciliation) {
    await withRetry(async () => {
      await prisma.$transaction(async (tx) => {
        // 1. Restore mistakenly debited balance (+amount)
        await applyLedgerEntry(tx, item.walletId, {
          type: "ADJUSTMENT",
          amount: item.amountPesewas,
          targetBalance: "BALANCE",
          reference: item.reference ?? undefined,
          description: `Reconcile commission reversal: restore mistakenly debited main balance for ${item.reference}`,
        });

        // 2. Clear stranded pending balance (-amount)
        await applyLedgerEntry(tx, item.walletId, {
          type: "ADJUSTMENT",
          amount: -item.amountPesewas,
          targetBalance: "PENDING",
          reference: item.reference ?? undefined,
          description: `Reconcile commission reversal: remove stranded pending commission for ${item.reference}`,
        });
      });
    });

    console.log(`✓ Reconciled ${item.reference} for ${item.userEmail}: +GHS ${item.amountGhs.toFixed(2)} to balance, -GHS ${item.amountGhs.toFixed(2)} from pending.`);
  }

  console.log("\n✓ All affected wallets successfully reconciled!");
}

main()
  .catch((err) => {
    console.error("Reconciliation script error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
