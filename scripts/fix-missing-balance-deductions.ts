/**
 * fix-missing-balance-deductions.ts
 *
 * Finds all orders placed today (or in a specified window) that have NOT been
 * debited from the user's wallet, then deducts the missing amount from each
 * affected user's balance and creates the missing DEBIT ledger records.
 *
 * NOTE: This includes orders that were placed via API sandbox but were delivered
 * live to real recipients without deducting the user's balance.
 *
 * Usage:
 *   npx tsx scripts/fix-missing-balance-deductions.ts             # Dry-run (safe, no changes)
 *   npx tsx scripts/fix-missing-balance-deductions.ts --apply      # Apply live deductions
 *   npx tsx scripts/fix-missing-balance-deductions.ts --user=userId1,userId2       # Limit to specific users
 *   npx tsx scripts/fix-missing-balance-deductions.ts --from=2026-10-04T00:00:00Z  # Custom start (ISO UTC)
 *   npx tsx scripts/fix-missing-balance-deductions.ts --to=2026-10-04T23:59:59Z    # Custom end   (ISO UTC)
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

  // ── 1. Fetch all orders in the window ──────────────────────────────────────
  // We include API and WEB orders with amount > 0 that are NOT CANCELLED or REFUNDED.
  // Note: We DO include isSandbox: true orders because buggy sandbox API orders were dispatched live to real users!
  const orderWhere: Record<string, unknown> = {
    createdAt: { gte: WINDOW_START, lte: WINDOW_END },
    amount: { gt: 0 },
    source: { not: "STOREFRONT" }, // Storefront orders are paid via Paystack
    status: { notIn: ["CANCELLED", "REFUNDED"] }, // Do not charge cancelled/refunded orders
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
      isSandbox: true,
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

  console.log(`Total orders found in window: ${orders.length}`);

  if (orders.length === 0) {
    console.log("No orders found in window. Exiting.");
    await prisma.$disconnect();
    return;
  }

  // ── 2. Pre-load all DEBIT references for users in scope ─────────────────────
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
    debitRefsByUser.get(tx.userId)!.add(tx.reference.trim());
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
    isSandbox: boolean;
    createdAt: Date;
    batchCode: string | null;
    checkedRefs: string[];
  }

  const missing: MissingDeduction[] = [];

  for (const order of orders) {
    const refs = debitRefsByUser.get(order.userId) ?? new Set<string>();

    const refOrder    = `order:${order.id}`;
    const refApiOrder = `api_order:${order.id}`;
    const refApiBatch = order.batch?.batchCode ? `api_batch:${order.batch.batchCode}` : null;

    const checkedRefs = [refOrder, refApiOrder];
    if (refApiBatch) checkedRefs.push(refApiBatch);

    const hasDebit =
      refs.has(refOrder) ||
      refs.has(refApiOrder) ||
      (refApiBatch !== null && refs.has(refApiBatch));

    if (!hasDebit) {
      missing.push({
        orderId: order.id,
        userId: order.userId,
        userEmail: order.user?.email || "unknown",
        userName: order.user?.name || "unknown",
        currentBalance: order.user?.balance ?? 0,
        amount: order.amount,
        network: order.network,
        gbAmount: order.gbAmount,
        phoneNumber: order.phoneNumber,
        source: order.source,
        status: order.status,
        isSandbox: order.isSandbox,
        createdAt: order.createdAt,
        batchCode: order.batch?.batchCode ?? null,
        checkedRefs,
      });
    }
  }

  if (missing.length === 0) {
    console.log("✅ All orders in window already have corresponding DEBIT transactions. Nothing to fix.");
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
  console.log(`\nFound ${missing.length} order(s) with MISSING deductions across ${byUser.size} user(s):`);
  console.log("─".repeat(80));

  for (const [, { user, orders: userOrders }] of Array.from(byUser)) {
    const totalOwed = userOrders.reduce((s, o) => s + o.amount, 0);
    const newBalance = user.currentBalance - totalOwed;
    const sandboxCount = userOrders.filter((o) => o.isSandbox).length;

    console.log(`\nUser    : ${user.userName} <${user.userEmail}> [${user.userId}]`);
    console.log(`Balance : ${formatGHS(user.currentBalance)}  →  ${formatGHS(newBalance)} (to deduct: ${formatGHS(totalOwed)})`);
    console.log(`Orders  : ${userOrders.length} order(s) (${sandboxCount} were placed via API sandbox)`);

    for (const o of userOrders) {
      console.log(
        `   #${o.orderId.toString().padStart(6)}  ${o.network.padEnd(10)} ${o.gbAmount}GB → ${o.phoneNumber.padEnd(12)}  ${formatGHS(o.amount)}  [${o.status}] [${o.isSandbox ? "SANDBOX" : "LIVE"}]  ${formatDate(o.createdAt)}`
      );
    }
  }

  console.log("\n" + "─".repeat(80));

  // ── 6. Negative balance check ─────────────────────────────────────────────
  const wouldGoNegative: string[] = [];
  for (const [, { user, orders: userOrders }] of Array.from(byUser)) {
    const totalOwed = userOrders.reduce((s, o) => s + o.amount, 0);
    if (user.currentBalance - totalOwed < 0) {
      wouldGoNegative.push(
        `${user.userName} <${user.userEmail}>: current ${formatGHS(user.currentBalance)}, owed ${formatGHS(totalOwed)}, balance after: ${formatGHS(user.currentBalance - totalOwed)}`
      );
    }
  }

  if (wouldGoNegative.length > 0) {
    console.log("\n⚠️  WARNING: The following users would have a NEGATIVE balance after deduction:");
    for (const msg of wouldGoNegative) console.log(`   ${msg}`);
  }

  if (!APPLY) {
    console.log("\n✅ DRY RUN complete. No changes were made to balances or orders.");
    console.log("   To apply these deductions, run:");
    console.log("   npx tsx scripts/fix-missing-balance-deductions.ts --apply\n");
    await prisma.$disconnect();
    return;
  }

  // ── 7. Apply deductions ──────────────────────────────────────────────────
  console.log("\n⚡ Applying deductions...\n");

  let successCount = 0;
  let failCount    = 0;

  for (const [, { user, orders: userOrders }] of Array.from(byUser)) {
    const totalOwed = userOrders.reduce((s, o) => s + o.amount, 0);
    const orderIds = userOrders.map((o) => o.orderId);

    try {
      await prisma.$transaction(async (tx) => {
        // 1. Deduct balance from user
        await tx.user.update({
          where: { id: user.userId },
          data: { balance: { decrement: totalOwed } },
        });

        // 2. Mark any sandbox orders as live since they were real data deliveries
        await tx.order.updateMany({
          where: { id: { in: orderIds }, isSandbox: true },
          data: { isSandbox: false },
        });

        // 3. Create itemized DEBIT ledger entries
        for (const o of userOrders) {
          const existingRef = await tx.walletTransaction.findFirst({
            where: {
              userId: user.userId,
              type: "DEBIT",
              reference: `order:${o.orderId}`,
            },
          });

          if (existingRef) {
            console.log(`   ⚠️  Skipped #${o.orderId} — DEBIT transaction already exists`);
            continue;
          }

          await tx.walletTransaction.create({
            data: {
              userId: user.userId,
              type: "DEBIT",
              amount: o.amount,
              status: "APPROVED",
              reference: `order:${o.orderId}`,
              note: `Data: ${o.network} ${o.gbAmount}GB to ${o.phoneNumber} (Order #${o.orderId})`,
            },
          });
        }

        const updatedUser = await tx.user.findUnique({
          where: { id: user.userId },
          select: { balance: true },
        });

        console.log(
          `   ✅ ${user.userName} <${user.userEmail}>: Deducted ${formatGHS(totalOwed)} across ${userOrders.length} order(s). New balance: ${formatGHS(updatedUser?.balance ?? 0)}`
        );
      }, { timeout: 30000 });

      successCount++;
    } catch (err) {
      console.error(`   ❌ FAILED for ${user.userEmail}:`, err);
      failCount++;
    }
  }

  console.log("\n================================================================================");
  console.log(`Finished. ${successCount} user(s) updated, ${failCount} failed.`);
  console.log("================================================================================");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  prisma.$disconnect();
  process.exit(1);
});
