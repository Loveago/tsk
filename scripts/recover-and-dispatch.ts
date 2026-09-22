import { prisma } from "../src/lib/prisma";
import { recomputeBatchStatus } from "../src/lib/orders";
import { dispatchClickyfiedMtnBatch } from "../src/lib/provider-apis/clickyfied-batch";
import { getProviderRoutingConfig } from "../src/lib/provider-apis/router";
import { ClickyfiedClient } from "../src/lib/provider-apis/clickyfied";

/**
 * Standalone Recovery & Dispatch Script for VPS
 * 
 * Accurately verifies each order against Clickyfied's live API to identify
 * which phone numbers were actually accepted vs which 41 numbers are missing.
 * 
 * Usage:
 *   npx tsx scripts/recover-and-dispatch.ts
 *   npx tsx scripts/recover-and-dispatch.ts CF-BATCH-000104
 *   npx tsx scripts/recover-and-dispatch.ts CF-BATCH-000104 --dry-run
 *   npx tsx scripts/recover-and-dispatch.ts CF-BATCH-000104 --no-dispatch
 */
async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");
  const noDispatch = args.includes("--no-dispatch");
  const forceAll = args.includes("--force-all");
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

  if (candidates.length === 0) {
    console.log("No orders found to inspect.");
    await prisma.$disconnect();
    return;
  }

  console.log(`[Step 1] Inspecting ${candidates.length} orders in batch...`);

  // 2. Extract referenced Clickyfied batch order IDs
  const clickyfiedOrderIds = new Set<string>();
  for (const o of candidates) {
    if (o.providerReference) {
      const parts = o.providerReference.split(":");
      for (const p of parts) {
        if (p.startsWith("order-")) {
          clickyfiedOrderIds.add(p);
        }
      }
    }
  }

  console.log(`Referenced Clickyfied Order IDs: ${Array.from(clickyfiedOrderIds).join(", ") || "None"}\n`);

  // 3. Live query Clickyfied API to get actual accepted phone numbers
  const confirmedNumbersOnProvider = new Set<string>();
  let providerApiReachable = false;

  try {
    const config = await getProviderRoutingConfig();
    if (config.clickyfied && config.clickyfied.apiKey) {
      const client = new ClickyfiedClient(config.clickyfied);
      for (const cOrderId of clickyfiedOrderIds) {
        try {
          console.log(`Querying Clickyfied API for [${cOrderId}]...`);
          const details = await client.getOrderStatus(cOrderId);
          const raw = details.raw as any;
          const entries: any[] = raw?.order?.entries || raw?.entries || [];
          console.log(`  -> Clickyfied has ${entries.length} recipient entries for ${cOrderId}`);
          for (const e of entries) {
            const num = String(e.number || e.phoneNumber || "").replace(/\D/g, "");
            if (num) {
              const norm = num.length > 9 ? num.slice(-9) : num;
              confirmedNumbersOnProvider.add(norm);
            }
          }
          providerApiReachable = true;
        } catch (apiErr: any) {
          console.warn(`  -> Could not fetch ${cOrderId} from Clickyfied: ${apiErr?.message || apiErr}`);
        }
      }
    }
  } catch (err: any) {
    console.warn(`Failed to connect to Clickyfied API: ${err?.message || err}`);
  }

  console.log(`\nClickyfied Confirmed Recipient Count: ${confirmedNumbersOnProvider.size}`);

  // 4. Classify orders: confirmed on Clickyfied vs missing/stranded
  const confirmedOnClickyfied: typeof candidates = [];
  const strandedOrders: typeof candidates = [];

  for (const order of candidates) {
    const cleanNum = order.phoneNumber.replace(/\D/g, "");
    const last9 = cleanNum.length > 9 ? cleanNum.slice(-9) : cleanNum;
    const ref = (order.providerReference || "").trim();

    // If forceAll is passed, all are treated as stranded
    if (forceAll) {
      strandedOrders.push(order);
      continue;
    }

    // If we successfully fetched from Clickyfied, use ground truth from Clickyfied API
    if (providerApiReachable && confirmedNumbersOnProvider.size > 0) {
      if (confirmedNumbersOnProvider.has(last9)) {
        confirmedOnClickyfied.push(order);
      } else {
        strandedOrders.push(order);
      }
    } else {
      // Fallback: an order is confirmed ONLY if it has an individual entryId (3 parts e.g. CLICKYFIED:order-XXXXX:entryId)
      const parts = ref.split(":");
      const hasEntryId = parts.length >= 3 && parts[2] && parts[2].length > 0;
      if (hasEntryId) {
        confirmedOnClickyfied.push(order);
      } else {
        strandedOrders.push(order);
      }
    }
  }

  console.log(`--------------------------------------------------------------------------------`);
  console.log(`ANALYSIS OF ORDERS (${candidates.length} total):`);
  console.log(`  • Confirmed on Clickyfied : ${confirmedOnClickyfied.length} orders (${confirmedOnClickyfied.reduce((s, o) => s + o.gbAmount, 0)} GB)`);
  console.log(`  • Stranded / Missing      : ${strandedOrders.length} orders (${strandedOrders.reduce((s, o) => s + o.gbAmount, 0)} GB)`);
  console.log(`--------------------------------------------------------------------------------\n`);

  if (strandedOrders.length === 0) {
    console.log("All orders in this batch are confirmed on Clickyfied! None are stranded.");
    await prisma.$disconnect();
    return;
  }

  console.log(`STRANDED ORDERS TO RECOVER (${strandedOrders.length} orders, ${strandedOrders.reduce((s, o) => s + o.gbAmount, 0)} GB):`);
  for (const o of strandedOrders) {
    console.log(`  - Order #${o.id}: ${o.phoneNumber} | ${o.gbAmount} GB | providerRef: ${o.providerReference || "NONE"}`);
  }
  console.log("");

  if (isDryRun) {
    console.log(`[DRY RUN] Would revert the above ${strandedOrders.length} orders to PENDING.`);
    await prisma.$disconnect();
    return;
  }

  // 5. Revert stranded orders to PENDING
  console.log(`[Step 2/3] Reverting ${strandedOrders.length} orders to PENDING...`);
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
      note: `VPS Script Recovery: Missing from Clickyfied. Reverted to PENDING for re-dispatch.`,
      changedBy: "VPS Script",
    })),
  });
  console.log(`[Step 2/3] Successfully reverted ${strandedOrders.length} orders to PENDING.\n`);

  // 6. Recompute parent batch statuses
  console.log(`[Step 3/3] Recomputing parent batch statuses...`);
  const batchIds = Array.from(
    new Set(strandedOrders.map((o) => o.batchId).filter(Boolean) as string[])
  );
  for (const bId of batchIds) {
    const updated = await recomputeBatchStatus(bId);
    console.log(`  - Batch ${bId}: updated status is "${updated}"`);
  }
  console.log(`[Step 3/3] Batch statuses updated.\n`);

  // 7. Dispatch to Clickyfied if requested
  if (noDispatch) {
    console.log("[Dispatch] Skipped auto-dispatch (--no-dispatch specified). Orders are now PENDING in the batch queue.");
  } else {
    console.log(`[Dispatch] Initiating immediate batch dispatch to Clickyfied...`);
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
  console.log("Recovery process finished successfully!");
}

main().catch(async (e) => {
  console.error("FATAL ERROR in script:", e);
  await prisma.$disconnect();
  process.exit(1);
});
