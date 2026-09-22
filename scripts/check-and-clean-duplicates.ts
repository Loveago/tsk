import { prisma } from "../src/lib/prisma";
import { normalizePhoneLast9 } from "../src/lib/provider-apis/router";
import { ClickyfiedClient } from "../src/lib/provider-apis/clickyfied";
import { getProviderRoutingConfig } from "../src/lib/provider-apis/router";

/**
 * TSKCONNECT - Duplicate Queue & Dispatch Diagnostic Tool
 * 
 * Usage:
 *   npx tsx scripts/check-and-clean-duplicates.ts
 *   npx tsx scripts/check-and-clean-duplicates.ts --clean-pending
 *   npx tsx scripts/check-and-clean-duplicates.ts --check-clickyfied
 */
async function main() {
  const args = process.argv.slice(2);
  const cleanPending = args.includes("--clean-pending");
  const checkClickyfied = args.includes("--check-clickyfied");

  console.log("================================================================================");
  console.log("       TSKCONNECT - DUPLICATE QUEUE & DISPATCH DIAGNOSTIC TOOL                  ");
  console.log("================================================================================\n");

  // ---------------------------------------------------------------------------
  // 1. INSPECT PENDING QUEUE FOR DUPLICATES
  // ---------------------------------------------------------------------------
  console.log("[Phase 1] Scanning PENDING order queue for duplicates...");
  const pendingOrders = await prisma.order.findMany({
    where: { status: "PENDING" },
    select: {
      id: true,
      phoneNumber: true,
      network: true,
      gbAmount: true,
      amount: true,
      userId: true,
      batchId: true,
      createdAt: true,
      providerReference: true,
      externalReference: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Total PENDING orders found: ${pendingOrders.length}`);

  const pendingByPhone = new Map<string, typeof pendingOrders>();
  for (const o of pendingOrders) {
    const key = `${normalizePhoneLast9(o.phoneNumber)}:${o.network.toUpperCase()}:${o.gbAmount}`;
    if (!pendingByPhone.has(key)) pendingByPhone.set(key, []);
    pendingByPhone.get(key)!.push(o);
  }

  const duplicateGroups: Array<{ key: string; orders: typeof pendingOrders }> = [];
  let totalDuplicatePendingCount = 0;
  let totalDuplicatePendingGb = 0;

  for (const [key, orders] of pendingByPhone.entries()) {
    if (orders.length > 1) {
      duplicateGroups.push({ key, orders });
      const dupCount = orders.length - 1;
      totalDuplicatePendingCount += dupCount;
      totalDuplicatePendingGb += dupCount * orders[0].gbAmount;
    }
  }

  if (duplicateGroups.length === 0) {
    console.log("  -> SUCCESS: No duplicate orders found in the PENDING queue! (All numbers are unique)\n");
  } else {
    console.warn(`  -> WARNING: Found ${duplicateGroups.length} phone number(s) with duplicate pending entries!`);
    console.warn(`  -> Duplicate Orders: ${totalDuplicatePendingCount} orders (${totalDuplicatePendingGb} GB excess)\n`);

    for (const group of duplicateGroups) {
      const first = group.orders[0];
      const duplicates = group.orders.slice(1);
      console.log(`  • Phone: ${first.phoneNumber} (${first.network} ${first.gbAmount} GB):`);
      console.log(`      Keep (Original): Order #${first.id} created at ${first.createdAt.toISOString()}`);
      for (const d of duplicates) {
        console.log(`      DUPLICATE:      Order #${d.id} created at ${d.createdAt.toISOString()} (Amount: GHS ${d.amount})`);
      }
    }
    console.log("");

    if (cleanPending) {
      console.log("[Phase 1 - Fix] Cancelling duplicate pending orders and refunding balances...");
      const duplicateIdsToCancel = duplicateGroups.flatMap((g) => g.orders.slice(1));
      
      for (const dup of duplicateIdsToCancel) {
        await prisma.order.update({
          where: { id: dup.id },
          data: {
            status: "CANCELLED",
            failureReason: "Cancelled by system: duplicate order in queue for same recipient and GB amount.",
          },
        });

        if (dup.amount > 0) {
          await prisma.user.update({
            where: { id: dup.userId },
            data: { balance: { increment: dup.amount } },
          });
        }

        await prisma.orderStatusHistory.create({
          data: {
            orderId: dup.id,
            status: "CANCELLED",
            previousStatus: "PENDING",
            note: `Cancelled by duplicate cleaner. Refunded GHS ${dup.amount}.`,
            changedBy: "Duplicate Cleanup Script",
          },
        });
      }
      console.log(`  -> Successfully cancelled ${duplicateIdsToCancel.length} duplicate pending orders!\n`);
    } else {
      console.log("  [Tip] Run with --clean-pending to automatically cancel duplicate pending orders and refund users.\n");
    }
  }

  // ---------------------------------------------------------------------------
  // 2. INSPECT RECENT DISPATCHES & DETECT DOUBLE-DISPATCHED ORDERS
  // ---------------------------------------------------------------------------
  console.log("[Phase 2] Inspecting recent PROCESSING / DISPATCHED orders from today...");
  const since = new Date(Date.now() - 12 * 60 * 60 * 1000); // Last 12 hours
  const recentOrders = await prisma.order.findMany({
    where: {
      network: "MTN",
      updatedAt: { gte: since },
      status: { in: ["PROCESSING", "SUCCESS"] },
    },
    select: {
      id: true,
      phoneNumber: true,
      gbAmount: true,
      status: true,
      providerReference: true,
      externalReference: true,
      batchId: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  console.log(`Recent MTN orders in last 12h: ${recentOrders.length}`);

  // Check for numbers that appear more than once in processing orders
  const procByPhone = new Map<string, typeof recentOrders>();
  for (const o of recentOrders) {
    const last9 = normalizePhoneLast9(o.phoneNumber);
    if (!procByPhone.has(last9)) procByPhone.set(last9, []);
    procByPhone.get(last9)!.push(o);
  }

  const multiDispatched = Array.from(procByPhone.entries()).filter(([_, list]) => list.length > 1);

  if (multiDispatched.length === 0) {
    console.log("  -> No duplicate recipient dispatches found in recent orders.");
  } else {
    console.log(`  -> Found ${multiDispatched.length} phone number(s) that have multiple recent orders:`);
    for (const [phone, list] of multiDispatched.slice(0, 10)) {
      console.log(`     • ${phone} (${list.length} orders, total ${list.reduce((s, o) => s + o.gbAmount, 0)} GB):`);
      for (const o of list) {
        console.log(`         Order #${o.id} (${o.gbAmount} GB, ${o.status}) | Ref: ${o.providerReference || "none"} | ExtRef: ${o.externalReference || "none"} | At: ${o.createdAt.toISOString()}`);
      }
    }
    if (multiDispatched.length > 10) {
      console.log(`     ... and ${multiDispatched.length - 10} more.`);
    }
  }

  // ---------------------------------------------------------------------------
  // 3. LIVE CLICKYFIED API CROSS-CHECK (If requested)
  // ---------------------------------------------------------------------------
  if (checkClickyfied) {
    console.log("\n[Phase 3] Querying Clickyfied live API for recent order batches...");
    try {
      const config = await getProviderRoutingConfig();
      if (config.clickyfied && config.clickyfied.apiKey) {
        const client = new ClickyfiedClient(config.clickyfied);
        const recentBatches = await client.listOrders(20);
        console.log(`Retrieved ${recentBatches.length} recent orders from Clickyfied:`);
        for (const b of recentBatches) {
          console.log(`  • ID: ${b.orderId || b.id} | ExtRef: ${b.externalReference || "none"} | Status: ${b.status} | Entries: ${b.totalEntries || b.entriesCount || "?"} | At: ${b.createdAt || "?"}`);
        }
      } else {
        console.log("Clickyfied is not configured or disabled.");
      }
    } catch (apiErr: any) {
      console.warn("Could not query Clickyfied API:", apiErr?.message || apiErr);
    }
  }

  console.log("\n================================================================================");
  console.log("                             DIAGNOSTIC SUMMARY                                 ");
  console.log("================================================================================");
  console.log(`1. Pending Queue Duplicate Orders  : ${totalDuplicatePendingCount}`);
  console.log(`2. Excess GB in Pending Queue      : ${totalDuplicatePendingGb} GB`);
  console.log(`3. Multi-Dispatched Recipient Count: ${multiDispatched.length}`);
  console.log("================================================================================\n");

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Diagnostic script error:", err);
  await prisma.$disconnect();
  process.exit(1);
});
