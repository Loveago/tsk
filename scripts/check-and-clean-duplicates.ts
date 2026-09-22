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
  // 2. INSPECT RECENT CLICKYFIED DISPATCHES & DETECT DOUBLE-DISPATCHED RECIPIENTS
  // ---------------------------------------------------------------------------
  console.log("[Phase 2] Inspecting recent Clickyfied API dispatches from today (ignoring Excel exports)...");
  const since = new Date(Date.now() - 12 * 60 * 60 * 1000); // Last 12 hours
  const recentOrders = await prisma.order.findMany({
    where: {
      network: "MTN",
      updatedAt: { gte: since },
      status: { in: ["PROCESSING", "SUCCESS"] },
      exportBatchId: null, // Exclude Excel manual exports which have Ref: none
      providerReference: { not: null },
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

  console.log(`Recent Clickyfied MTN orders in last 12h: ${recentOrders.length}`);

  // Check for numbers dispatched multiple times within a tight window (e.g. <= 45 minutes)
  const clickyfiedByPhone = new Map<string, typeof recentOrders>();
  for (const o of recentOrders) {
    const last9 = normalizePhoneLast9(o.phoneNumber);
    if (!clickyfiedByPhone.has(last9)) clickyfiedByPhone.set(last9, []);
    clickyfiedByPhone.get(last9)!.push(o);
  }

  // A true duplicate dispatch is when the same recipient was sent twice within 45 minutes
  const trueDuplicates: Array<{
    phone: string;
    orders: typeof recentOrders;
    intervalMins: number;
  }> = [];

  const repeatCustomers: Array<{
    phone: string;
    orders: typeof recentOrders;
  }> = [];

  for (const [phone, list] of clickyfiedByPhone.entries()) {
    if (list.length > 1) {
      // Sort ascending by creation time
      list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      
      let isNearDuplicate = false;
      let minInterval = Infinity;
      for (let i = 0; i < list.length - 1; i++) {
        const diffMins = Math.abs(list[i + 1].createdAt.getTime() - list[i].createdAt.getTime()) / (1000 * 60);
        if (diffMins < minInterval) minInterval = diffMins;
        if (diffMins <= 45) {
          isNearDuplicate = true;
        }
      }

      if (isNearDuplicate) {
        trueDuplicates.push({ phone, orders: list, intervalMins: Math.round(minInterval) });
      } else {
        repeatCustomers.push({ phone, orders: list });
      }
    }
  }

  console.log(`  • True Duplicate Dispatches (sent <= 45 mins apart) : ${trueDuplicates.length}`);
  console.log(`  • Normal Repeat Orders (placed hours apart)         : ${repeatCustomers.length}\n`);

  if (trueDuplicates.length > 0) {
    console.warn(`[True Duplicate Dispatches Found: ${trueDuplicates.length} recipients]`);
    for (const d of trueDuplicates.slice(0, 15)) {
      console.log(`  • Phone: ${d.phone} (Interval between orders: ~${d.intervalMins} mins):`);
      for (const o of d.orders) {
        console.log(`      Order #${o.id} (${o.gbAmount} GB, ${o.status}) | ProvRef: ${o.providerReference} | ExtRef: ${o.externalReference} | At: ${o.createdAt.toISOString()}`);
      }
    }
    if (trueDuplicates.length > 15) {
      console.log(`      ... and ${trueDuplicates.length - 15} more.`);
    }
    console.log("");
  } else {
    console.log("  -> SUCCESS: No rapid duplicate dispatches found on Clickyfied in the last 12 hours!\n");
  }

  // ---------------------------------------------------------------------------
  // 3. TARGETED 2:15 PM (13:30 - 15:00 UTC) BATCH ANALYSIS
  // ---------------------------------------------------------------------------
  console.log("[Phase 3] Investigating orders around 2:15 PM (13:30 UTC - 15:00 UTC)...");
  const windowStart = new Date("2026-09-22T13:30:00.000Z");
  const windowEnd = new Date("2026-09-22T15:00:00.000Z");

  const afternoonOrders = await prisma.order.findMany({
    where: {
      network: "MTN",
      createdAt: { gte: windowStart, lte: windowEnd },
    },
    select: {
      id: true,
      phoneNumber: true,
      gbAmount: true,
      status: true,
      providerReference: true,
      externalReference: true,
      createdAt: true,
    },
    orderBy: { id: "asc" },
  });

  const batchesInWindow = new Set(afternoonOrders.map((o) => o.externalReference).filter(Boolean));
  console.log(`Total MTN orders created in 2:15 PM window: ${afternoonOrders.length}`);
  console.log(`Batch codes referenced in this window: ${Array.from(batchesInWindow).join(", ") || "None"}\n`);

  // ---------------------------------------------------------------------------
  // 4. LIVE CLICKYFIED API CROSS-CHECK (If requested)
  // ---------------------------------------------------------------------------
  if (checkClickyfied) {
    console.log("[Phase 4] Querying Clickyfied live API for recent order batches...");
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
  console.log(`3. True Duplicate Dispatches (<=45m): ${trueDuplicates.length}`);
  console.log(`4. Legitimate Repeat Orders (hours): ${repeatCustomers.length}`);
  console.log("================================================================================\n");

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Diagnostic script error:", err);
  await prisma.$disconnect();
  process.exit(1);
});
