/**
 * fix-missing-balance-deductions.ts
 *
 * Finds all today's non-sandbox orders (from midnight until now) that were
 * placed but NOT debited from the user's wallet, then deducts the missing
 * amount from each affected user's balance.
 *
 * IMPORTANT: Run this on the VPS where DATABASE_URL points to production.
 *
 * Usage:
 *   npx tsx scripts/fix-missing-balance-deductions.ts             # Dry-run (safe, no changes)
 *   npx tsx scripts/fix-missing-balance-deductions.ts --apply      # Apply live deductions
 *   npx tsx scripts/fix-missing-balance-deductions.ts --from=2026-10-04T00:00:00Z  # Custom start (ISO UTC)
 *   npx tsx scripts/fix-missing-balance-deductions.ts --to=2026-10-04T23:59:59Z    # Custom end   (ISO UTC)
 *   npx tsx scripts/fix-missing-balance-deductions.ts --user=userId1,userId2       # Limit to specific users
 *   npx tsx scripts/fix-missing-balance-deductions.ts --apply --user=uid1,uid2     # Apply to specific users only
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: ["error"] });

// ── CLI flags ─────────────────────────────────────────────────────────────────
const APPLY = process.argv.includes("--apply");

const fromArg = process.argv.find((a) => a.startsWith("--from="));
const toArg   = process.argv.find((a) => a.startsWith("--to="));
const userArg = process.argv.find((a) => a.startsWith("--user="));

const targetUserIds: string[] = userArg
  ? userArg.replace("--user=", "").split(",").map((s) => s.trim()).filter(Boolean)
  : [];

// Default window: today midnight UTC → now
const todayMidnightUTC = new Date();
todayMidnightUTC.setUTCHours(0, 0, 0, 0);

const WINDOW_START = fromArg ? new Date(fromArg.replace("--from=", "")) : todayMidnightUTC;
const WINDOW_END   = toArg   ? new Date(toArg.replace("--to=", ""))     : new Date();

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatGHS(n: number) {
  return `GHS ${n.toFixed(2)}`;
}

function formatDate(d: Date) {
  return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("================================================================================");
  console.log("       TSKCONNECT — Fix Missing Wallet Deductions");
  console.log("================================================================================");
  console.log(`Mode        : ${APPLY ? "⚠️  LIVE — WILL DEDUCT BALANCES" : "✅ DRY RUN (no changes)"}`);
  console.log(`Window      : ${formatDate(WINDOW_START)}  →  ${formatDate(WINDOW_END)}`);
  if (targetUserIds.length > 0) {
    console.log(`Target users: ${targetUserIds.join(", ")}`);
  } else {
    console.log(`Target users: ALL users`);
  }
  console.log("");

  // ── 1. Fetch all non-sandbox orders in the window ──────────────────────────
  const orderWhere: Record<string, unknown> = {
    createdAt: { gte: WINDOW_START, lte: WINDOW_END },
    isSandbox: false,
    source: { not: "STOREFRONT" }, // Storefront orders are paid via Paystack; reseller wallet is credited separately
    status: { notIn: ["CANCELLED", "REFUNDED"] }, // Do NOT re-deduct cancelled/refunded orders
  };

  if (targetUserIds.length > 0) {
    orderWhere.userId = { in: targetUserIds };
  }

  const orders = await prisma.order.findMany({
    where: orderWhere,
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      userId: true,
      amount: true,
      source: true,
      status: true,
      network: true,
      gbAmount: true,
      phoneNumber: true,
      createdAt: true,
      batchId: true,
      batch: {
        select: { batchCode: true },
      },
      user: {
        select: { id: true, name: true, email: true, balance: true },
      },
    },
  });

  console.log(`Orders in window: ${orders.length}`);
  console.log("");

  if (orders.length === 0) {
    console.log("No orders found in window. Exiting.");
    await prisma.$disconnect();
    return;
  }

  // ── 2. For each order, check if a DEBIT WalletTransaction exists ───────────
  // References that the system creates:
  //   WEB orders    → "order:{id}"
  //   API v1 single → "api_order:{id}"   (used by /v1/orders)
  //   Public v1     → "order:{id}"
  //   API batch     → "api_batch:{batchCode}" (one txn per batch, not per order)
  //
  // Strategy: look for ANY DEBIT txn for this userId referencing order:{id}
  //           or api_order:{id}.  For batch orders, check api_batch:{batchCode}.
  //           If none found → mark as missing deduction.

  // Pre-load all DEBIT references for users in scope (to avoid N+1)
  const userIdsInScope = Array.from(new Set(orders.map((o) => o.userId)));

  const allDebitRefs = await prisma.walletTransaction.findMany({
    where: {
      userId: { in: userIdsInScope },
      type: "DEBIT",
      status: "APPROVED",
    },
    select: {
      userId: true,
      reference: true,
      amount: true,
    },
  });

  // Build Set of references per userId for fast lookup
  const debitRefsByUser = new Map<string, Set<string>>();
  for (const tx of allDebitRefs) {
    if (!tx.reference) continue;
    if (!debitRefsByUser.has(tx.userId)) debitRefsByUser.set(tx.userId, new Set());
    debitRefsByUser.get(tx.userId)!.add(tx.reference);
  }

  // ── 3. Find orders missing their debit ────────────────────────────────────
  interface MissingDeduction {
    orderId: number;
    userId: string;
    userEmail: string;
    userName: string;
    currentBalance: number;
    amount: number;
    network: string;
    gbAmount: number;
    phoneNumber: string;
    source: string;
    status: string;
    createdAt: Date;
    batchCode: string | null;
    checkedRefs: string[];
  }

  const missing: MissingDeduction[] = [];
  const batchDebited = new Set<string>(); // track api_batch refs already counted

  for (const order of orders) {
    const refs = debitRefsByUser.get(order.userId) ?? new Set<string>();

    const refOrder       = `order:${order.id}`;
    const refApiOrder    = `api_order:${order.id}`;
    const refApiBatch    = order.batch?.batchCode ? `api_batch:${order.batch.batchCode}` : null;

    const checkedRefs = [refOrder, refApiOrder];
    if (refApiBatch) checkedRefs.push(refApiBatch);

    const hasDebit =
      refs.has(refOrder) ||
      refs.has(refApiOrder) ||
      (refApiBatch !== null && refs.has(refApiBatch));

    // For batch-level txns (api_batch:*), the full batch cost is debited once.
    // We already account per-order amount — don't double-count the batch ref approach.
    if (!hasDebit) {
      missing.push({
        orderId: order.id,
        userId: order.userId,
        userEmail: order.user.email,
        userName: order.user.name,
        currentBalance: order.user.balance,
        amount: order.amount,
        network: order.network,
        gbAmount: order.gbAmount,
        phoneNumber: order.phoneNumber,
        source: order.source,
        status: order.status,
        createdAt: order.createdAt,
        batchCode: order.batch?.batchCode ?? null,
        checkedRefs,
      });
    }
  }

  if (missing.length === 0) {
    console.log("✅ All orders in window have corresponding DEBIT transactions. Nothing to fix.");
    await prisma.$disconnect();
    return;
  }

  // ── 4. Group by user for summary ──────────────────────────────────────────
  const byUser = new Map<
    string,
    { user: Pick<MissingDeduction, "userId" | "userEmail" | "userName" | "currentBalance">; orders: MissingDeduction[] }
  >();

  for (const m of missing) {
    if (!byUser.has(m.userId)) {
      byUser.set(m.userId, {
        user: { userId: m.userId, userEmail: m.userEmail, userName: m.userName, currentBalance: m.currentBalance },
        orders: [],
      });
    }
    byUser.get(m.userId)!.orders.push(m);
  }

  // ── 5. Print report ───────────────────────────────────────────────────────
  console.log(`Found ${missing.length} order(s) with MISSING deductions across ${byUser.size} user(s):`);
  console.log("─".repeat(80));

  for (const [, { user, orders: userOrders }] of Array.from(byUser)) {
    const totalOwed = userOrders.reduce((s, o) => s + o.amount, 0);
    const newBalance = user.currentBalance - totalOwed;

    console.log(`\nUser    : ${user.userName} <${user.userEmail}> [${user.userId}]`);
    console.log(`Balance : ${formatGHS(user.currentBalance)}  →  ${formatGHS(newBalance)} (owe: ${formatGHS(totalOwed)})`);
    console.log(`Orders  :`);

    for (const o of userOrders) {
      console.log(
        `   #${o.orderId.toString().padStart(6)}  ${o.network.padEnd(12)} ${o.gbAmount}GB → ${o.phoneNumber.padEnd(14)}  ${formatGHS(o.amount)}  [${o.status}]  ${formatDate(o.createdAt)}`
      );
      console.log(`            Checked refs: ${o.checkedRefs.join(", ")}`);
    }
  }

  console.log("\n" + "─".repeat(80));

  // ── 6. Safety: check if any user's balance would go negative ─────────────
  const wouldGoNegative: string[] = [];
  for (const [, { user, orders: userOrders }] of Array.from(byUser)) {
    const totalOwed = userOrders.reduce((s, o) => s + o.amount, 0);
    if (user.currentBalance - totalOwed < 0) {
      wouldGoNegative.push(
        `${user.userName} <${user.userEmail}>: balance ${formatGHS(user.currentBalance)}, owe ${formatGHS(totalOwed)}, would be ${formatGHS(user.currentBalance - totalOwed)}`
      );
    }
  }

  if (wouldGoNegative.length > 0) {
    console.log("\n⚠️  WARNING: The following users would have a NEGATIVE balance after deduction:");
    for (const msg of wouldGoNegative) console.log(`   ${msg}`);
    console.log("   These users WILL still be deducted (the admin can follow up manually for recovery).");
  }

  if (!APPLY) {
    console.log("\n✅ DRY RUN complete. Re-run with --apply to make changes.");
    await prisma.$disconnect();
    return;
  }

  // ── 7. Apply deductions ──────────────────────────────────────────────────
  console.log("\n⚡ Applying deductions...\n");

  let successCount = 0;
  let failCount    = 0;

  for (const [, { user, orders: userOrders }] of Array.from(byUser)) {
    const totalOwed = userOrders.reduce((s, o) => s + o.amount, 0);

    try {
      await prisma.$transaction(async (tx) => {
        // Deduct from balance (allow going negative — admin can handle recovery)
        await tx.user.update({
          where: { id: user.userId },
          data: { balance: { decrement: totalOwed } },
        });

        // Create itemized DEBIT ledger entries
        for (const o of userOrders) {
          // Check one final time inside transaction that txn doesn't already exist
          const existingRef = await tx.walletTransaction.findFirst({
            where: {
              userId: user.userId,
              type: "DEBIT",
              reference: `order:${o.orderId}`,
            },
          });

          if (existingRef) {
            console.log(`   ⚠️  Skipped #${o.orderId} — DEBIT transaction already exists (race avoided)`);
            continue;
          }

          await tx.walletTransaction.create({
            data: {
              userId: user.userId,
              type: "DEBIT",
              amount: o.amount,
              status: "APPROVED",
              reference: `order:${o.orderId}`,
              note: `[RETROACTIVE DEDUCTION] Data: ${o.network} ${o.gbAmount}GB to ${o.phoneNumber} (Order #${o.orderId}) — deducted via admin fix-missing-balance-deductions script`,
            },
          });
        }

        const updatedUser = await tx.user.findUnique({
          where: { id: user.userId },
          select: { balance: true },
        });

        console.log(
          `   ✅ ${user.userName} <${user.userEmail}> — deducted ${formatGHS(totalOwed)} for ${userOrders.length} order(s). New balance: ${formatGHS(updatedUser?.balance ?? 0)}`
        );
      });

      successCount++;
    } catch (err) {
      console.error(`   ❌ FAILED for ${user.userEmail}:`, err);
      failCount++;
    }
  }

  console.log("\n================================================================================");
  console.log(`Done. ${successCount} user(s) updated, ${failCount} failed.`);
  console.log("================================================================================");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  prisma.$disconnect();
  process.exit(1);
});
