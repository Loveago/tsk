import { prisma } from "../src/lib/prisma";
import { getProviderRoutingConfig } from "../src/lib/provider-apis/router";
import { ClickyfiedClient } from "../src/lib/provider-apis/clickyfied";
import { normalizePhoneLast9 } from "../src/lib/provider-apis/router";

/**
 * Fix False-SUCCESS Orders Script
 *
 * Finds MTN/Clickyfied orders incorrectly marked SUCCESS during buggy reconcile run.
 *
 * Usage:
 *   npx tsx scripts/fix-false-success-orders.ts              # live fix
 *   npx tsx scripts/fix-false-success-orders.ts --dry-run    # preview only
 *   npx tsx scripts/fix-false-success-orders.ts --hours=48   # look back 48h (default: 72)
 *   npx tsx scripts/fix-false-success-orders.ts --force      # verify ALL success orders against API
 */

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE_ALL = process.argv.includes("--force");
const hoursArg = process.argv.find((a) => a.startsWith("--hours="));
const LOOKBACK_HOURS = hoursArg ? parseInt(hoursArg.split("=")[1], 10) : 72;

const RECONCILE_ACTOR_PATTERNS = ["reconcili", "reconcile", "admin (", "sync", "recover", "stranded"];
const RECONCILE_NOTE_PATTERNS = ["reconciled from clickyfied", "confirmed on provider", "restored from previous halt", "status synchronized from clickyfied", "synchronized from clickyfied"];

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
  console.log(`Mode      : ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`Look-back : ${LOOKBACK_HOURS}h | Scan: ${FORCE_ALL ? "ALL (--force)" : "Smart fingerprint"}`);
  console.log("");

  const cutoff = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000);

  const suspectOrders = await prisma.order.findMany({
    where: {
      network: "MTN", status: "SUCCESS", createdAt: { gte: cutoff },
      OR: [{ providerReference: { startsWith: "CLICKYFIED:" } }, { externalReference: { startsWith: "CF-BATCH-" } }],
    },
    select: {
      id: true, phoneNumber: true, gbAmount: true, status: true,
      providerReference: true, externalReference: true, batchId: true, clickyfiedBatchId: true,
      history: {
        orderBy: { createdAt: "desc" }, take: 10,
        select: { status: true, previousStatus: true, note: true, createdAt: true, changedBy: true },
      },
    },
    orderBy: { id: "asc" },
  });

  console.log(`Found ${suspectOrders.length} SUCCESS Clickyfied orders in the last ${LOOKBACK_HOURS}h`);

  let fingerprinted: typeof suspectOrders;

  if (FORCE_ALL) {
    fingerprinted = suspectOrders;
    console.log(`  -> All ${fingerprinted.length} selected (--force mode)\n`);
  } else {
    fingerprinted = suspectOrders.filter((o) => {
      for (const h of o.history) {
        if (h.status !== "SUCCESS") continue;
        const note = (h.note || "").toLowerCase();
        const actor = (h.changedBy || "").toLowerCase();
        if (actor.includes("webhook") || actor.includes("callback") || note.includes("webhook") || note.includes("callback")) continue;
        if (RECONCILE_ACTOR_PATTERNS.some((p) => actor.includes(p))) return true;
        if (RECONCILE_NOTE_PATTERNS.some((p) => note.includes(p))) return true;
      }
      return false;
    });

    console.log(`  -> ${fingerprinted.length} flagged (non-webhook actor set them SUCCESS)\n`);

    if (fingerprinted.length === 0) {
      console.log("Fingerprint found nothing. Sample of who marked recent orders SUCCESS:");
      for (const o of suspectOrders.slice(0, 15)) {
        const h = o.history.find((x) => x.status === "SUCCESS");
        if (h) console.log(`  Order #${o.id}: "${h.changedBy}" | "${(h.note || "").slice(0, 100)}"`);
      }
      console.log("\n-> If those are all 'Clickyfied Webhook' or similar, the orders are LEGITIMATE.");
      console.log("-> If you see admin/sync actors that shouldnt have set SUCCESS, re-run with --force");
      await prisma.$disconnect();
      return;
    }
  }

  const config = await getProviderRoutingConfig();
  const client = new ClickyfiedClient(config.clickyfied);

  const batchQueryKeys = new Set<string>();
  for (const o of fingerprinted) {
    let provKey: string | null = null;
    if (o.providerReference?.startsWith("CLICKYFIED:")) {
      const parts = o.providerReference.replace("CLICKYFIED:", "").split(":");
      if (parts[0] && !parts[0].startsWith("CF-BATCH-") && parts[0] !== "BLOCKED") {
        provKey = parts[0];
      }
    }
    if (provKey) {
      batchQueryKeys.add(provKey);
    } else if (o.externalReference?.startsWith("CF-BATCH-")) {
      batchQueryKeys.add(o.externalReference);
    }
  }

  console.log(`Querying ${batchQueryKeys.size} batch(es) from Clickyfied API...`);
  const batchEntriesMap = new Map<string, { canonicalId: string; entries: any[] }>();

  for (const queryKey of batchQueryKeys) {
    try {
      let canonical = queryKey;
      if (queryKey.startsWith("CF-BATCH-")) {
        canonical = await client.resolveCanonicalOrderId(queryKey);
        console.log(`  ${queryKey} -> ${canonical}`);
      }
      const details = await client.getOrderStatus(canonical);
      const rawAny = details.raw as any;
      const entries: any[] = rawAny?.order?.entries || rawAny?.entries || [];
      const canonicalId = String(rawAny?.order?.orderId || rawAny?.orderId || canonical);
      batchEntriesMap.set(queryKey, { canonicalId, entries });
      if (canonical !== queryKey) batchEntriesMap.set(canonical, { canonicalId, entries });
      console.log(`  OK ${canonicalId}: ${entries.length} entries`);
    } catch (err: any) {
      console.log(`  FAIL ${queryKey}: ${err?.message || err}`);
    }
  }

  console.log(`\n-- Verifying ${fingerprinted.length} order(s) --`);

  const toRevertPending: number[] = [];
  const toRevertProcessing: number[] = [];
  const toRevertFailed: number[] = [];
  const confirmedSuccess: number[] = [];

  for (const order of fingerprinted) {
    const phoneNorm = normalizePhoneLast9(order.phoneNumber);
    const provPart = order.providerReference?.startsWith("CLICKYFIED:")
      ? order.providerReference.replace("CLICKYFIED:", "").split(":")[0]
      : null;
    const batchKey = (provPart && !provPart.startsWith("CF-BATCH-") && provPart !== "BLOCKED")
      ? provPart
      : order.externalReference;

    let matchedEntry: any = null;

    const entryData = (batchKey && batchEntriesMap.get(batchKey)) ||
      (order.externalReference && batchEntriesMap.get(order.externalReference)) ||
      (provPart && batchEntriesMap.get(provPart));

    if (entryData) {
      const { entries } = entryData;
      matchedEntry =
        entries.find((e: any) => {
          const eNorm = normalizePhoneLast9(String(e.number || e.phoneNumber || e.phone || ""));
          const eAlloc = typeof e.allocationGB === "number" ? e.allocationGB : e.allocationGb;
          return eNorm === phoneNorm && (eAlloc === undefined || Math.abs(eAlloc - order.gbAmount) <= 0.1);
        }) ||
        entries.find((e: any) => normalizePhoneLast9(String(e.number || e.phoneNumber || e.phone || "")) === phoneNorm);
    }

    if (!matchedEntry) {
      console.log(`  MISS  #${order.id} ${order.phoneNumber} ${order.gbAmount}GB -- NOT on Clickyfied -> PENDING`);
      toRevertPending.push(order.id);
      continue;
    }

    const rawStatus = matchedEntry.status || matchedEntry.currentStatus || matchedEntry.deliveryStatus;
    if (!rawStatus) {
      console.log(`  WAIT  #${order.id} ${order.phoneNumber} -- found, no status -> PROCESSING`);
      toRevertProcessing.push(order.id);
      continue;
    }

    const mapped = mapStatus(rawStatus);
    if (mapped === "SUCCESS") {
      console.log(`  OK    #${order.id} ${order.phoneNumber} -- confirmed ${rawStatus} -> LEAVE`);
      confirmedSuccess.push(order.id);
    } else if (mapped === "PROCESSING" || mapped === "PENDING") {
      console.log(`  WAIT  #${order.id} ${order.phoneNumber} -- ${rawStatus} -> PROCESSING`);
      toRevertProcessing.push(order.id);
    } else {
      console.log(`  FAIL  #${order.id} ${order.phoneNumber} -- ${rawStatus} -> FAILED`);
      toRevertFailed.push(order.id);
    }
  }

  console.log("\n--------------------------------------------------------------------------------");
  console.log(`  OK   Genuinely delivered (leave SUCCESS)   : ${confirmedSuccess.length}`);
  console.log(`  WAIT In-flight (set PROCESSING)            : ${toRevertProcessing.length}`);
  console.log(`  MISS Not on Clickyfied (reset PENDING)     : ${toRevertPending.length}`);
  console.log(`  FAIL Rejected (set FAILED)                 : ${toRevertFailed.length}`);
  console.log("--------------------------------------------------------------------------------");

  if (DRY_RUN) {
    console.log("\n[DRY RUN] No changes written. Remove --dry-run to apply.");
    await prisma.$disconnect();
    return;
  }

  if (!toRevertPending.length && !toRevertProcessing.length && !toRevertFailed.length) {
    console.log("\nAll checked orders are genuinely delivered. Nothing to fix!");
    await prisma.$disconnect();
    return;
  }

  console.log("\nApplying corrections...");

  if (toRevertPending.length > 0) {
    await prisma.order.updateMany({
      where: { id: { in: toRevertPending } },
      data: { status: "PENDING", providerReference: null, externalReference: null, clickyfiedBatchId: null, failureReason: "Corrected: falsely marked SUCCESS -- not found on Clickyfied. Restored to pending queue." },
    });
    await prisma.orderStatusHistory.createMany({
      data: toRevertPending.map((id) => ({ orderId: id, status: "PENDING", previousStatus: "SUCCESS", note: "Corrected false-SUCCESS: never received by Clickyfied. Reverted to PENDING.", changedBy: "fix-false-success-orders script" })),
    });
    console.log(`  Reset ${toRevertPending.length} to PENDING`);
  }

  if (toRevertProcessing.length > 0) {
    await prisma.order.updateMany({ where: { id: { in: toRevertProcessing } }, data: { status: "PROCESSING", failureReason: null } });
    await prisma.orderStatusHistory.createMany({
      data: toRevertProcessing.map((id) => ({ orderId: id, status: "PROCESSING", previousStatus: "SUCCESS", note: "Corrected false-SUCCESS: confirmed in-flight. Reverted to PROCESSING.", changedBy: "fix-false-success-orders script" })),
    });
    console.log(`  Reset ${toRevertProcessing.length} to PROCESSING`);
  }

  if (toRevertFailed.length > 0) {
    await prisma.order.updateMany({ where: { id: { in: toRevertFailed } }, data: { status: "FAILED", failureReason: "Corrected: rejected by Clickyfied. Was falsely marked SUCCESS." } });
    await prisma.orderStatusHistory.createMany({
      data: toRevertFailed.map((id) => ({ orderId: id, status: "FAILED", previousStatus: "SUCCESS", note: "Corrected false-SUCCESS: rejected on Clickyfied side.", changedBy: "fix-false-success-orders script" })),
    });
    console.log(`  Marked ${toRevertFailed.length} as FAILED`);
  }

  const allAffectedIds = [...toRevertPending, ...toRevertProcessing, ...toRevertFailed];
  if (allAffectedIds.length > 0) {
    const affected = await prisma.order.findMany({ where: { id: { in: allAffectedIds } }, select: { batchId: true, clickyfiedBatchId: true } });
    const parentBatchIds = [...new Set(affected.map((o) => o.batchId).filter(Boolean) as string[])];
    const cfBatchIds = [...new Set(affected.map((o) => o.clickyfiedBatchId).filter(Boolean) as string[])];
    if (parentBatchIds.length > 0) {
      const { recomputeBatchStatus } = await import("../src/lib/orders");
      for (const bId of parentBatchIds) try { await recomputeBatchStatus(bId); } catch {}
      console.log(`  Recomputed ${parentBatchIds.length} parent batch(es)`);
    }
    for (const cfBatchId of cfBatchIds) {
      try {
        const orders = await prisma.order.findMany({ where: { clickyfiedBatchId: cfBatchId }, select: { status: true } });
        const pc = orders.filter((o) => o.status === "SUCCESS").length;
        const fc = orders.filter((o) => o.status === "FAILED" || o.status === "CANCELLED").length;
        const pend = orders.filter((o) => o.status === "PROCESSING" || o.status === "PENDING").length;
        let st = "PROCESSING";
        if (pend === 0) { if (fc === 0) st = "COMPLETED"; else if (pc === 0) st = "FAILED"; else st = "PARTIALLY_COMPLETED"; }
        await prisma.clickyfiedBatch.update({ where: { id: cfBatchId }, data: { processedCount: pc, failedCount: fc, pendingCount: pend, status: st, lastSyncedAt: new Date() } });
      } catch {}
    }
    if (cfBatchIds.length) console.log(`  Updated ${cfBatchIds.length} Clickyfied batch(es)`);
  }

  const total = toRevertPending.length + toRevertProcessing.length + toRevertFailed.length;
  console.log(`\nDone! Fixed ${total} order(s). ${confirmedSuccess.length} left unchanged (legitimate).`);
  if (toRevertPending.length > 0) console.log(`${toRevertPending.length} restored to PENDING -- auto-dispatched next cycle.`);
  await prisma.$disconnect();
}

main().catch((err) => { console.error("Fatal:", err); prisma.$disconnect(); process.exit(1); });
