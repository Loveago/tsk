import { prisma } from "../src/lib/prisma";
import { getProviderRoutingConfig } from "../src/lib/provider-apis/router";
import { ClickyfiedClient } from "../src/lib/provider-apis/clickyfied";
import { normalizePhoneLast9 } from "../src/lib/provider-apis/router";

/**
 * Fix False-SUCCESS Orders Script
 *
 * Finds MTN/Clickyfied orders that were incorrectly marked SUCCESS during
 * the buggy reconcile/recover run, then verifies each one against the
 * live Clickyfied API.
 *
 * Decision rules per order:
 *  - If Clickyfied confirms it as delivered/sent/success  -> leave as SUCCESS
 *  - If Clickyfied shows it as processing/in-flight       -> reset to PROCESSING
 *  - If Clickyfied has no record of it at all             -> reset to PENDING (re-dispatch)
 *  - If Clickyfied shows it as failed/rejected            -> set to FAILED
 *
 * Usage:
 *   npx tsx scripts/fix-false-success-orders.ts              # live fix
 *   npx tsx scripts/fix-false-success-orders.ts --dry-run    # preview only, no DB changes
 *   npx tsx scripts/fix-false-success-orders.ts --hours=48   # look back 48h (default: 72)
 */

const DRY_RUN = process.argv.includes("--dry-run");
const hoursArg = process.argv.find((a) => a.startsWith("--hours="));
const LOOKBACK_HOURS = hoursArg ? parseInt(hoursArg.split("=")[1], 10) : 72;

function mapStatus(raw: string): "SUCCESS" | "PROCESSING" | "FAILED" | "CANCELLED" | "PENDING" {
  const s = (raw || "").trim().toLowerCase();
  if (["completed", "delivered", "sent", "processed", "success"].includes(s)) return "SUCCESS";
  if (["failed", "rejected", "error", "unsuccessful"].includes(s)) return "FAILED";
  if (["cancelled", "canceled"].includes(s)) return "CANCELLED";
  if (["processing", "in_progress", "sending", "in-progress"].includes(s)) return "PROCESSING";
  return "PENDING";
}

async function main() {
  console.log("================================================================================");
  console.log("       TSKCONNECT -- Fix False-SUCCESS Orders (Clickyfied reconcile bug)");
  console.log("================================================================================");
  console.log(`Mode         : ${DRY_RUN ? "DRY RUN -- no database changes will be made" : "LIVE -- changes WILL be written to DB"}`);
  console.log(`Look-back    : ${LOOKBACK_HOURS} hours`);
  console.log("");

  const cutoff = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000);

  const suspectOrders = await prisma.order.findMany({
    where: {
      network: "MTN",
      status: "SUCCESS",
      createdAt: { gte: cutoff },
      OR: [
        { providerReference: { startsWith: "CLICKYFIED:" } },
        { externalReference: { startsWith: "CF-BATCH-" } },
      ],
    },
    select: {
      id: true,
      phoneNumber: true,
      gbAmount: true,
      network: true,
      status: true,
      providerReference: true,
      externalReference: true,
      failureReason: true,
      batchId: true,
      clickyfiedBatchId: true,
      createdAt: true,
      history: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          status: true,
          previousStatus: true,
          note: true,
          createdAt: true,
          changedBy: true,
        },
      },
    },
    orderBy: { id: "asc" },
  });

  // Fingerprint: most recent history entry was written by the reconcile code path
  const fingerprinted = suspectOrders.filter((o) => {
    const latestEntry = o.history[0];
    if (!latestEntry) return false;
    const note = (latestEntry.note || "").toLowerCase();
    const actor = (latestEntry.changedBy || "").toLowerCase();
    return (
      note.includes("reconcil") ||
      actor.includes("reconcil") ||
      note.includes("restored from previous halt") ||
      note.includes("confirmed on provider")
    );
  });

  console.log(`Found ${suspectOrders.length} SUCCESS Clickyfied orders in the last ${LOOKBACK_HOURS}h`);
  console.log(`  -> ${fingerprinted.length} have a reconcile-run fingerprint in their history\n`);

  if (fingerprinted.length === 0) {
    console.log("Nothing to fix. All SUCCESS orders look legitimate.");
    await prisma.$disconnect();
    return;
  }

  const config = await getProviderRoutingConfig();
  const client = new ClickyfiedClient(config.clickyfied);

  // Pre-fetch batch entries from Clickyfied
  const batchQueryKeys = new Set<string>();
  for (const o of fingerprinted) {
    if (o.externalReference?.startsWith("CF-BATCH-")) batchQueryKeys.add(o.externalReference);
    if (o.providerReference?.startsWith("CLICKYFIED:")) {
      const parts = o.providerReference.replace("CLICKYFIED:", "").split(":");
      if (parts[0] && !parts[0].startsWith("CF-BATCH-") && parts[0] !== "BLOCKED") {
        batchQueryKeys.add(parts[0]);
      }
    }
  }

  console.log(`Querying ${batchQueryKeys.size} batch(es) from Clickyfied API...`);
  const batchEntriesMap = new Map<string, { canonicalId: string; entries: any[] }>();

  for (const queryKey of batchQueryKeys) {
    try {
      let canonical = queryKey;
      if (queryKey.startsWith("CF-BATCH-")) {
        canonical = await client.resolveCanonicalOrderId(queryKey);
        console.log(`  ${queryKey} -> resolved to ${canonical}`);
      }
      const details = await client.getOrderStatus(canonical);
      const rawAny = details.raw as any;
      const entries: any[] = rawAny?.order?.entries || rawAny?.entries || [];
      const canonicalId = String(rawAny?.order?.orderId || rawAny?.orderId || canonical);
      batchEntriesMap.set(queryKey, { canonicalId, entries });
      if (canonical !== queryKey) batchEntriesMap.set(canonical, { canonicalId, entries });
      console.log(`  OK ${canonicalId}: ${entries.length} entries`);
    } catch (err: any) {
      console.log(`  FAIL ${queryKey}: API error -- ${err?.message || err}`);
    }
  }

  console.log("\n-- Verifying each order against Clickyfied API --");

  const toRevertPending: number[] = [];
  const toRevertProcessing: number[] = [];
  const toRevertFailed: number[] = [];
  const confirmedSuccess: number[] = [];

  for (const order of fingerprinted) {
    const phoneNorm = normalizePhoneLast9(order.phoneNumber);

    const batchKey = order.externalReference?.startsWith("CF-BATCH-")
      ? order.externalReference
      : order.providerReference?.replace("CLICKYFIED:", "").split(":")[0];

    let matchedEntry: any = null;

    if (batchKey && batchEntriesMap.has(batchKey)) {
      const { entries } = batchEntriesMap.get(batchKey)!;
      matchedEntry = entries.find((e: any) => {
        const eNorm = normalizePhoneLast9(String(e.number || e.phoneNumber || e.phone || ""));
        const eAlloc = typeof e.allocationGB === "number" ? e.allocationGB : e.allocationGb;
        if (eNorm !== phoneNorm) return false;
        if (eAlloc !== undefined && Math.abs(eAlloc - order.gbAmount) > 0.1) return false;
        return true;
      }) || entries.find((e: any) => {
        const eNorm = normalizePhoneLast9(String(e.number || e.phoneNumber || e.phone || ""));
        return eNorm === phoneNorm;
      });
    }

    if (!matchedEntry) {
      try {
        const found = await client.findOrderByPhone(order.phoneNumber);
        if (found?.orderId) {
          matchedEntry = { id: found.orderEntryId, status: found.status, allocationGB: found.allocationGb };
        }
      } catch {}
    }

    if (!matchedEntry) {
      console.log(`  MISS  Order #${order.id} (${order.phoneNumber}, ${order.gbAmount}GB) -- NOT on Clickyfied -> PENDING`);
      toRevertPending.push(order.id);
      continue;
    }

    const rawStatus = matchedEntry.status || matchedEntry.currentStatus || matchedEntry.deliveryStatus;
    if (!rawStatus) {
      console.log(`  WAIT  Order #${order.id} (${order.phoneNumber}) -- found but no status -> PROCESSING`);
      toRevertProcessing.push(order.id);
      continue;
    }

    const mapped = mapStatus(rawStatus);
    if (mapped === "SUCCESS") {
      console.log(`  OK    Order #${order.id} (${order.phoneNumber}) -- confirmed delivered (${rawStatus}) -> LEAVE AS SUCCESS`);
      confirmedSuccess.push(order.id);
    } else if (mapped === "PROCESSING" || mapped === "PENDING") {
      console.log(`  WAIT  Order #${order.id} (${order.phoneNumber}) -- in-flight (${rawStatus}) -> PROCESSING`);
      toRevertProcessing.push(order.id);
    } else {
      console.log(`  FAIL  Order #${order.id} (${order.phoneNumber}) -- rejected (${rawStatus}) -> FAILED`);
      toRevertFailed.push(order.id);
    }
  }

  console.log("\n--------------------------------------------------------------------------------");
  console.log("SUMMARY:");
  console.log(`  OK   Confirmed genuinely delivered (leave as SUCCESS)   : ${confirmedSuccess.length}`);
  console.log(`  WAIT Confirmed in-flight (will set to PROCESSING)       : ${toRevertProcessing.length}`);
  console.log(`  MISS Not found on Clickyfied (will reset to PENDING)    : ${toRevertPending.length}`);
  console.log(`  FAIL Rejected/failed on Clickyfied (will set FAILED)    : ${toRevertFailed.length}`);
  console.log("--------------------------------------------------------------------------------");

  if (DRY_RUN) {
    console.log("\n[DRY RUN] No changes written. Re-run without --dry-run to apply fixes.");
    await prisma.$disconnect();
    return;
  }

  if (toRevertPending.length === 0 && toRevertProcessing.length === 0 && toRevertFailed.length === 0) {
    console.log("\nAll suspect orders are genuinely delivered. Nothing to fix!");
    await prisma.$disconnect();
    return;
  }

  console.log("\nApplying database corrections...");

  if (toRevertPending.length > 0) {
    await prisma.order.updateMany({
      where: { id: { in: toRevertPending } },
      data: {
        status: "PENDING",
        providerReference: null,
        externalReference: null,
        clickyfiedBatchId: null,
        failureReason: "Corrected: was falsely marked SUCCESS by reconcile bug -- not found on Clickyfied. Restored to pending queue.",
      },
    });
    await prisma.orderStatusHistory.createMany({
      data: toRevertPending.map((id) => ({
        orderId: id,
        status: "PENDING",
        previousStatus: "SUCCESS",
        note: "Corrected false-SUCCESS: Order was never received by Clickyfied. Reverted to PENDING for re-dispatch.",
        changedBy: "fix-false-success-orders script",
      })),
    });
    console.log(`  Reset ${toRevertPending.length} order(s) to PENDING`);
  }

  if (toRevertProcessing.length > 0) {
    await prisma.order.updateMany({
      where: { id: { in: toRevertProcessing } },
      data: { status: "PROCESSING", failureReason: null },
    });
    await prisma.orderStatusHistory.createMany({
      data: toRevertProcessing.map((id) => ({
        orderId: id,
        status: "PROCESSING",
        previousStatus: "SUCCESS",
        note: "Corrected false-SUCCESS: Order confirmed in-flight on Clickyfied. Reverted to PROCESSING.",
        changedBy: "fix-false-success-orders script",
      })),
    });
    console.log(`  Reset ${toRevertProcessing.length} order(s) to PROCESSING`);
  }

  if (toRevertFailed.length > 0) {
    await prisma.order.updateMany({
      where: { id: { in: toRevertFailed } },
      data: {
        status: "FAILED",
        failureReason: "Corrected: rejected by Clickyfied. Was falsely marked SUCCESS by reconcile bug.",
      },
    });
    await prisma.orderStatusHistory.createMany({
      data: toRevertFailed.map((id) => ({
        orderId: id,
        status: "FAILED",
        previousStatus: "SUCCESS",
        note: "Corrected false-SUCCESS: Order was rejected/failed on Clickyfied side.",
        changedBy: "fix-false-success-orders script",
      })),
    });
    console.log(`  Marked ${toRevertFailed.length} order(s) as FAILED`);
  }

  // Recompute parent batch statuses
  const allAffectedIds = [...toRevertPending, ...toRevertProcessing, ...toRevertFailed];
  if (allAffectedIds.length > 0) {
    const affectedOrders = await prisma.order.findMany({
      where: { id: { in: allAffectedIds } },
      select: { batchId: true, clickyfiedBatchId: true },
    });
    const parentBatchIds = [...new Set(affectedOrders.map((o) => o.batchId).filter(Boolean) as string[])];
    const cfBatchIds = [...new Set(affectedOrders.map((o) => o.clickyfiedBatchId).filter(Boolean) as string[])];

    if (parentBatchIds.length > 0) {
      const { recomputeBatchStatus } = await import("../src/lib/orders");
      for (const bId of parentBatchIds) {
        try { await recomputeBatchStatus(bId); } catch {}
      }
      console.log(`  Recomputed ${parentBatchIds.length} parent batch status(es)`);
    }

    for (const cfBatchId of cfBatchIds) {
      try {
        const orders = await prisma.order.findMany({
          where: { clickyfiedBatchId: cfBatchId },
          select: { status: true },
        });
        const processedCount = orders.filter((o) => o.status === "SUCCESS").length;
        const failedCount = orders.filter((o) => o.status === "FAILED" || o.status === "CANCELLED").length;
        const pendingCount = orders.filter((o) => o.status === "PROCESSING" || o.status === "PENDING").length;
        let st = "PROCESSING";
        if (pendingCount === 0) {
          if (failedCount === 0) st = "COMPLETED";
          else if (processedCount === 0) st = "FAILED";
          else st = "PARTIALLY_COMPLETED";
        }
        await prisma.clickyfiedBatch.update({
          where: { id: cfBatchId },
          data: { processedCount, failedCount, pendingCount, status: st, lastSyncedAt: new Date() },
        });
      } catch {}
    }
    if (cfBatchIds.length > 0) console.log(`  Updated ${cfBatchIds.length} Clickyfied batch record(s)`);
  }

  const total = toRevertPending.length + toRevertProcessing.length + toRevertFailed.length;
  console.log(`\nDone! Fixed ${total} falsely-SUCCESS order(s). ${confirmedSuccess.length} were genuinely delivered and left unchanged.`);
  if (toRevertPending.length > 0) {
    console.log(`${toRevertPending.length} orders restored to PENDING -- will be picked up by the next batch dispatch automatically.`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  prisma.$disconnect();
  process.exit(1);
});
