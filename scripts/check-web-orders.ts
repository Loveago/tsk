import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: ["error"] });

async function main() {
  const fromArg = process.argv.find((a) => a.startsWith("--from="));
  const defaultFrom = new Date("2026-09-28T00:00:00Z");
  const fromDate = fromArg ? new Date(fromArg.replace("--from=", "")) : defaultFrom;

  console.log("================================================================================");
  console.log("       TSKCONNECT — Check 'Send Order' (WEB) Orders");
  console.log("================================================================================");
  console.log(`Checking orders from: ${fromDate.toISOString()} to now`);
  console.log(`Source filter        : WEB (Dashboard Send Order)\n`);

  const webOrders = await prisma.order.findMany({
    where: {
      source: "WEB",
      createdAt: { gte: fromDate },
      amount: { gt: 0 },
      status: { notIn: ["CANCELLED", "REFUNDED"] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      userId: true,
      amount: true,
      network: true,
      gbAmount: true,
      phoneNumber: true,
      status: true,
      createdAt: true,
      batchId: true,
      batch: { select: { batchCode: true } },
      user: { select: { id: true, name: true, email: true, balance: true } },
    },
  });

  console.log(`Total 'Send Order' (WEB) orders found: ${webOrders.length}`);

  if (webOrders.length === 0) {
    console.log("No WEB orders found in this period.");
    return;
  }

  // Pre-load all DEBIT transactions for these users
  const userIds = Array.from(new Set(webOrders.map((o) => o.userId)));
  const debitTxs = await prisma.walletTransaction.findMany({
    where: {
      userId: { in: userIds },
      type: "DEBIT",
      status: "APPROVED",
    },
    select: {
      userId: true,
      reference: true,
    },
  });

  const debitRefsByUser = new Map<string, Set<string>>();
  for (const tx of debitTxs) {
    if (!tx.reference) continue;
    if (!debitRefsByUser.has(tx.userId)) debitRefsByUser.set(tx.userId, new Set());
    debitRefsByUser.get(tx.userId)!.add(tx.reference.trim());
  }

  const missingDebits: typeof webOrders = [];

  for (const o of webOrders) {
    const userRefs = debitRefsByUser.get(o.userId) ?? new Set<string>();
    const ref = `order:${o.id}`;

    if (!userRefs.has(ref)) {
      missingDebits.push(o);
    }
  }

  console.log(`\nResults:`);
  console.log(` - Paid / Debited 'Send Order' (WEB) orders: ${webOrders.length - missingDebits.length}`);
  console.log(` - Missing Debits                          : ${missingDebits.length}`);

  if (missingDebits.length === 0) {
    console.log("\n✅ ALL 'Send Order' (WEB) orders since September 28th have valid DEBIT transactions!");
  } else {
    console.log(`\n⚠️  Found ${missingDebits.length} 'Send Order' orders without a DEBIT transaction:`);
    const byUser = new Map<string, { user: any; orders: typeof webOrders }>();
    for (const o of missingDebits) {
      if (!byUser.has(o.userId)) {
        byUser.set(o.userId, { user: o.user, orders: [] });
      }
      byUser.get(o.userId)!.orders.push(o);
    }

    for (const [, { user, orders }] of Array.from(byUser)) {
      const totalOwed = orders.reduce((s, o) => s + o.amount, 0);
      console.log(`\nUser: ${user.name} <${user.email}> (Balance: GHS ${user.balance.toFixed(2)})`);
      console.log(`Owes: GHS ${totalOwed.toFixed(2)} across ${orders.length} order(s):`);
      for (const o of orders.slice(0, 10)) {
        console.log(`  - #${o.id} ${o.network} ${o.gbAmount}GB to ${o.phoneNumber} | GHS ${o.amount.toFixed(2)} | ${o.status} | ${o.createdAt.toISOString()}`);
      }
      if (orders.length > 10) {
        console.log(`  ... and ${orders.length - 10} more orders`);
      }
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
