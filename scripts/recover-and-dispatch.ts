import { prisma } from "../src/lib/prisma";
import { recomputeBatchStatus } from "../src/lib/orders";
import { dispatchClickyfiedMtnBatch } from "../src/lib/provider-apis/clickyfied-batch";

/**
 * Standalone Recovery & Dispatch Script for VPS
 * 
 * Usage:
 *   npx tsx scripts/recover-and-dispatch.ts
 *   npx tsx scripts/recover-and-dispatch.ts CF-BATCH-000104
 *   npx tsx scripts/recover-and-dispatch.ts --dry-run
 *   npx tsx scripts/recover-and-dispatch.ts --no-dispatch (reverts to PENDING only, without auto-dispatch)
 */
async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");
  const noDispatch = args.includes("--no-dispatch");
  const targetBatchCode = args.find((a) => !a.startsWith("--")) || "CF-BATCH-000104";

  console.log("================================================================================");
  console.log("             TSKCONNECT - RECOVERY & DISPATCH SCRIPT                           ");
  console.log("================================================================================");
  console.log(`Target Batch Code : ${targetBatchCode || "ALL STRANDED"}`);
  console.log(`Mode              : ${isDryRun ? "DRY RUN (No changes)" : "LIVE EXECUTION"}`);
  console.log(`Auto-Dispatch     : ${noDispatch ? "NO (Revert to PENDING only)" : "YES (Immediate dispatch to Clickyfied)"}`);
  console.log("--------------------------------------------------------------------------------\n");

  // 1. Search for target batch if specified
  let batch = null;
  if (targetBatchCode) {
    batch = await prisma.orderBatch.findFirst({
      where: {
        OR: [
          { batchCode: targetBatchCode },
          { id: targetBatchCode },
        ],
      },
      include: {
        orders: {
          select: {
            id: true,
            phoneNumber: true,
            gbAmount: true,
            network: true,
            status: true,
            providerReference: true,
            externalReference: true,
            createdAt: true,
          },
          orderBy: { id: "asc" },
        },
      },
    });
  }

  let candidates: Array<{
    id: number;
    phoneNumber: string;
    gbAmount: number;
    network: string;
    status: string;
    providerReference: string | null;
    externalReference: string | null;
    batchId?: string | null;
  }> = [];

  if (batch && batch.orders.length > 0) {
    console.log(`[Batch Found] ${batch.batchCode} (ID: ${batch.id})`);
    console.log(`Total Orders in Batch : ${batch.orders.length}`);
    console.log(`Total GB in Batch     : ${batch.totalGb} GB`);
    console.log(`Current Batch Status  : ${batch.status}\n`);

    candidates = batch.orders.map((o) => ({ ...o, batchId: batch.id }));
  } else {
    console.log(`[Batch Note] Target batch "${targetBatchCode}" not found by exact code, scanning all PROCESSING MTN orders...`);
    candidates = await prisma.order.findMany({
      where: {
        status: "PROCESSING",
        network: { equals: "MTN", mode: "insensitive" },
      },
      select: {
        id: true,
        phoneNumber: true,
        gbAmount: true,
        network: true,
        status: true,
        providerReference: true,
        externalReference: true,
        batchId: true,
      },
      orderBy: { id: "asc" },
    });
  }

  // 2. Classify orders: confirmed on Clickyfied vs stranded/missing
  const confirmedOnClickyfied: typeof candidates = [];
  const strandedOrders: typeof candidates = [];

  for (const order of candidates) {
    const ref = (order.providerReference || "").trim();
    // Confirmed on Clickyfied if providerReference contains a true Clickyfied order ID
    if (ref.includes("order-")) {
      confirmedOnClickyfied.push(order);
    } else {
      strandedOrders.push(order);
    }
  }

  console.log(`--------------------------------------------------------------------------------`);
  console.log(`ANALYSIS OF ORDERS (${candidates.length} total):`);
  console.log(`  • Confirmed on Clickyfied (have order- ID) : ${confirmedOnClickyfied.length} orders (${confirmedOnClickyfied.reduce((s, o) => s + o.gbAmount, 0)} GB)`);
  console.log(`  • Stranded / Missing from Clickyfied       : ${strandedOrders.length} orders (${strandedOrders.reduce((s, o) => s + o.gbAmount, 0)} GB)`);
  console.log(`--------------------------------------------------------------------------------\n`);

  if (strandedOrders.length === 0) {
    console.log("No stranded orders found! All processing orders have valid Clickyfied order IDs.");
    await prisma.$disconnect();
    return;
  }

  console.log("STRANDED ORDERS TO RECOVER:");
  for (const o of strandedOrders) {
    console.log(`  - Order #${o.id}: ${o.phoneNumber} | ${o.gbAmount} GB | Status: ${o.status} | providerRef: ${o.providerReference || "NULL"} | extRef: ${o.externalReference || "NULL"}`);
  }
  console.log("");

  if (isDryRun) {
    console.log("[DRY RUN] Would revert the above " + strandedOrders.length + " orders to PENDING.");
    await prisma.$disconnect();
    return;
  }

  // 3. Revert stranded orders to PENDING
  console.log(`[Step 1/3] Reverting ${strandedOrders.length} orders to PENDING...`);
  const strandedIds = strandedOrders.map((o) => o.id);

  await prisma.order.updateMany({
    where: { id: { in: strandedIds } },
    data: {
      status: "PENDING",
      providerReference: null,
      externalReference: null,
    },
  });

  await prisma.orderStatusHistory.createMany({
    data: strandedOrders.map((o) => ({
      orderId: o.id,
      status: "PENDING",
      previousStatus: o.status,
      note: `VPS Script Recovery: Reset stranded order to PENDING for re-dispatch.`,
      changedBy: "VPS Script",
    })),
  });
  console.log(`[Step 1/3] Successfully reverted ${strandedOrders.length} orders to PENDING.\n`);

  // 4. Recompute parent batch statuses
  console.log(`[Step 2/3] Recomputing parent batch statuses...`);
  const batchIds = Array.from(
    new Set(strandedOrders.map((o) => o.batchId).filter(Boolean) as string[])
  );
  for (const bId of batchIds) {
    const updated = await recomputeBatchStatus(bId);
    console.log(`  - Batch ${bId}: new status is "${updated}"`);
  }
  console.log(`[Step 2/3] Batch statuses updated.\n`);

  // 5. Dispatch to Clickyfied if requested
  if (noDispatch) {
    console.log("[Step 3/3] Skipped auto-dispatch (--no-dispatch specified). Orders are now PENDING in the batch queue.");
  } else {
    console.log(`[Step 3/3] Dispatching orders to Clickyfied...`);
    try {
      const result = await dispatchClickyfiedMtnBatch("VPS Manual Recovery Script");
      console.log("\n================================================================================");
      console.log("                     DISPATCH RESULTS FROM CLICKYFIED                           ");
      console.log("================================================================================");
      console.log(`Success          : ${result.success ? "YES" : "NO"}`);
      console.log(`Dispatched Count : ${result.dispatchedCount} orders`);
      console.log(`Dispatched GB    : ${result.totalGb} GB`);
      console.log(`Batch Code(s)    : ${result.batchCode || result.batchCodes?.join(", ") || "None"}`);
      console.log(`Batch Order IDs  : ${result.batchIds?.join(", ") || "None"}`);
      console.log(`Message          : ${result.message || result.error || "Completed"}`);
      
      if (result.groups && result.groups.length > 0) {
        console.log("\nDispatched Groups:");
        for (const g of result.groups) {
          console.log(`  • ${g.group}: Batch Code ${g.batchCode} | Clickyfied Order ID: ${g.batchOrderId} | ${g.count} orders (${g.totalGb} GB)`);
        }
      }
      console.log("================================================================================\n");
    } catch (dispatchErr: any) {
      console.error("[Dispatch Error] Failed to dispatch to Clickyfied:", dispatchErr?.message || dispatchErr);
      console.log("Orders remain in PENDING status in the queue. You can re-try dispatch anytime from the UI.");
    }
  }

  await prisma.$disconnect();
  console.log("Done!");
}

main().catch(async (e) => {
  console.error("FATAL ERROR in script:", e);
  await prisma.$disconnect();
  process.exit(1);
});
