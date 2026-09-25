import crypto from "crypto";
import { prisma } from "../prisma";
import {
  getProviderRoutingConfig,
  getProviderForNetwork,
  mapClickyfiedStatus,
  normalizePhoneLast9,
} from "./router";
import { ClickyfiedClient, generateClickyfiedReference, type ClickyfiedFilteredOutEntry } from "./clickyfied";
import { normalizeGhanaPhoneNumber } from "@/lib/phone-utils";
import { recordAudit } from "../audit";
import { recordOrderApiLog } from "../order-api-logs";

export interface ClickyfiedBatchConfig {
  enabled: boolean;
  gbThreshold: number;
  timerMinutes: number;
  lastDispatchedAt: Date | null;
  maxEntries?: number;
}

export interface PendingMtnBatchStats {
  pendingCount: number;
  totalGb: number;
  gbThreshold: number;
  timerMinutes: number;
  lastDispatchedAt: string | null;
  firstOrderAt: string | null;
  minutesElapsed: number;
  minutesRemaining: number;
  secondsRemaining: number;
  secondsElapsed: number;
  batchEnabled: boolean;
  clickyfiedEnabled: boolean;
  currentBatchCount: number;
  currentBatchGb: number;
  nextBatchCount: number;
  nextBatchGb: number;
  thresholdMet: boolean;
  timerExpired: boolean;
  // Two-group breakdown:
  group1Count: number;
  group1Gb: number;
  group2Count: number;
  group2Gb: number;
  orders: Array<{
    id: number;
    phoneNumber: string;
    gbAmount: number;
    amount: number;
    createdAt: Date;
  }>;
}

// In-memory mutex to ensure two simultaneous dispatches do not race in the same process
let isDispatchingBatch = false;

/**
 * Acquires a distributed database lock for batch dispatch with a lease window.
 * Uses atomic PostgreSQL test-and-set query to guarantee that only ONE worker dispatches at a time,
 * even across multi-process PM2 clusters or parallel invocations.
 */
async function acquireBatchDispatchLock(leaseSeconds = 180): Promise<boolean> {
  const lockKey = "clickyfied_batch_dispatch_lock";
  const now = Date.now();
  const leaseMs = leaseSeconds * 1000;

  try {
    // 1. Ensure the setting record exists
    await prisma.systemSetting.upsert({
      where: { key: lockKey },
      create: { key: lockKey, value: "0" },
      update: {},
    });

    // 2. Perform atomic test-and-set update in PostgreSQL:
    // Only updates if lock is currently free ("0", null, empty) or has expired (older than leaseMs)
    const updatedCount: number = await prisma.$executeRaw`
      UPDATE "SystemSetting"
      SET "value" = ${String(now)}
      WHERE "key" = ${lockKey}
        AND (
          "value" IS NULL 
          OR "value" = '0' 
          OR "value" = ''
          OR (${now} - CAST(NULLIF("value", '') AS BIGINT)) > ${leaseMs}
        )
    `;

    return updatedCount > 0;
  } catch (err) {
    console.error("[acquireBatchDispatchLock] Error acquiring lock:", err);
    return false; // Safely deny lock on error to prevent race conditions
  }
}

async function releaseBatchDispatchLock(): Promise<void> {
  const lockKey = "clickyfied_batch_dispatch_lock";
  try {
    await prisma.systemSetting.update({
      where: { key: lockKey },
      data: { value: "0" },
    }).catch(() => {});
  } catch {}
}

/**
 * Partitions orders sequentially into batches respecting the GB threshold window (e.g. 100–120 GB).
 * Recipient entries per batch are no longer artificially capped at 100, allowing higher recipient counts.
 */
export function partitionIntoBatches<T extends { gbAmount: number }>(
  orders: T[],
  limitGb = 100,
  maxEntries?: number,
  maxChunkGb = 120
): Array<{ orders: T[]; totalGb: number }> {
  const batches: Array<{ orders: T[]; totalGb: number }> = [];
  let currentBatch: T[] = [];
  let currentGb = 0;

  const targetLimit = Math.max(1, limitGb);
  const upperCap = Math.max(targetLimit, maxChunkGb);

  for (const order of orders) {
    const reachedTarget = currentGb >= targetLimit;
    const reachedMaxEntries = maxEntries !== undefined && maxEntries > 0 ? currentBatch.length >= maxEntries : false;
    const wouldExceedMax = currentGb + order.gbAmount > upperCap;

    if (currentBatch.length > 0 && (reachedTarget || reachedMaxEntries || wouldExceedMax)) {
      batches.push({ orders: currentBatch, totalGb: currentGb });
      currentBatch = [];
      currentGb = 0;
    }

    currentBatch.push(order);
    currentGb += order.gbAmount;
  }

  if (currentBatch.length > 0) {
    batches.push({ orders: currentBatch, totalGb: currentGb });
  }

  return batches;
}


/**
 * Retrieves the current Clickyfied MTN batch configuration from SystemSettings
 */
export async function getClickyfiedBatchConfig(): Promise<ClickyfiedBatchConfig> {
  const settings = await prisma.systemSetting.findMany({
    where: {
      key: {
        in: [
          "clickyfied_batch_enabled",
          "clickyfied_batch_gb_threshold",
          "clickyfied_batch_timer_minutes",
          "clickyfied_batch_last_dispatched_at",
          "clickyfied_batch_max_entries",
        ],
      },
    },
  });

  const map = new Map<string, string>();
  for (const s of settings) map.set(s.key, s.value);

  const enabled = map.get("clickyfied_batch_enabled") !== "false";
  const gbThreshold = Math.max(1, Number(map.get("clickyfied_batch_gb_threshold") ?? 100));
  const timerMinutes = Math.max(1, Number(map.get("clickyfied_batch_timer_minutes") ?? 15));
  const lastDispStr = map.get("clickyfied_batch_last_dispatched_at");
  const lastDispatchedAt = lastDispStr ? new Date(lastDispStr) : null;
  const maxEntriesStr = map.get("clickyfied_batch_max_entries");
  const maxEntries = maxEntriesStr && !isNaN(Number(maxEntriesStr)) && Number(maxEntriesStr) > 0 ? Number(maxEntriesStr) : undefined;

  return {
    enabled,
    gbThreshold,
    timerMinutes,
    lastDispatchedAt,
    maxEntries,
  };
}

/**
 * Fetches all pending MTN orders that are routed to Clickyfied.
 * Includes strict in-flight and intra-queue deduplication:
 * 1. Excludes orders whose recipient phone number is currently being fulfilled (status: PROCESSING).
 * 2. Deduplicates multiple orders for the same phone number within the current batch cycle so that
 *    recipients receive exactly ONE delivery per dispatch, holding back any duplicates.
 */
export async function getPendingMtnClickyfiedOrders() {
  const config = await getProviderRoutingConfig();
  if (!config.enabled || !config.clickyfied.enabled) {
    return {
      orders: [],
      count: 0,
      totalGb: 0,
    };
  }

  const batchConfig = await getClickyfiedBatchConfig();
  if (!batchConfig.enabled) {
    return {
      orders: [],
      count: 0,
      totalGb: 0,
    };
  }

  // Check resumption watermark if automated processing was paused and re-enabled
  const resumedSetting = await prisma.systemSetting.findUnique({
    where: { key: "api_processing_resumed_at" },
  });
  const resumedAt = resumedSetting?.value ? new Date(resumedSetting.value) : null;

  const whereClause: any = {
    status: "PENDING",
    network: "MTN",
    providerReference: null,
    failureReason: null, // Orders with any prior failure are strictly held for manual fulfillment only
    exportBatchId: null, // Exclude exported orders
    exportCount: 0,      // Exclude any order that was ever exported
    lastExportedAt: null,
  };

  if (resumedAt && !isNaN(resumedAt.getTime())) {
    whereClause.createdAt = { gte: resumedAt };
  }

  const pendingOrders = await prisma.order.findMany({
    where: whereClause,
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      phoneNumber: true,
      network: true,
      gbAmount: true,
      amount: true,
      userId: true,
      source: true,
      batchId: true,
      externalReference: true,
      createdAt: true,
    },
  });

  // Query phone numbers that currently have an active in-flight PROCESSING order
  const activeProcessingOrders = await prisma.order.findMany({
    where: {
      status: "PROCESSING",
      network: { equals: "MTN", mode: "insensitive" },
    },
    select: { phoneNumber: true },
  });
  const inFlightPhones = new Set<string>();
  for (const o of activeProcessingOrders) {
    const last9 = normalizePhoneLast9(o.phoneNumber);
    if (last9) inFlightPhones.add(last9);
  }

  // Filter to only orders that resolve to CLICKYFIED provider and are not in-flight or duplicate
  const eligibleOrders: typeof pendingOrders = [];
  const queuedPhones = new Set<string>();

  for (const order of pendingOrders) {
    const provider = await getProviderForNetwork(order.network);
    if (provider !== "CLICKYFIED") continue;

    const last9 = normalizePhoneLast9(order.phoneNumber);
    // If this recipient already has an in-flight order being processed by Clickyfied, hold back this order
    if (inFlightPhones.has(last9)) {
      continue;
    }
    // If this recipient already has an order in this batch queue, hold back duplicate
    if (queuedPhones.has(last9)) {
      continue;
    }

    queuedPhones.add(last9);
    eligibleOrders.push(order);
  }

  const totalGb = eligibleOrders.reduce((sum, o) => sum + o.gbAmount, 0);

  return {
    orders: eligibleOrders,
    count: eligibleOrders.length,
    totalGb,
  };
}

/**
 * Gets a complete overview of the current MTN batch queue and timer status
 */
export async function getClickyfiedBatchStatus(): Promise<PendingMtnBatchStats> {
  const config = await getProviderRoutingConfig();
  const batchConfig = await getClickyfiedBatchConfig();

  // Self-heal stranded processing orders ONLY if automated routing is actively enabled
  if (config.enabled && config.clickyfied.enabled && batchConfig.enabled) {
    try {
      const { recoverStrandedMtnOrders } = await import("./router");
      await recoverStrandedMtnOrders();
    } catch {}
  }

  const { orders, count, totalGb } = await getPendingMtnClickyfiedOrders();

  const now = Date.now();
  const windowSeconds = Math.max(1, batchConfig.timerMinutes) * 60;
  let firstOrderAt: string | null = null;
  let secondsElapsed = 0;
  let secondsRemaining = windowSeconds;
  let minutesElapsed = 0;
  let minutesRemaining = batchConfig.timerMinutes;
  let timerExpired = false;

  // The countdown window is strictly bound to the oldest pending order in the current queue
  if (orders.length > 0) {
    const oldestOrderTime = new Date(orders[0].createdAt).getTime();
    firstOrderAt = orders[0].createdAt.toISOString();
    secondsElapsed = Math.max(0, Math.floor((now - oldestOrderTime) / 1000));
    secondsRemaining = Math.max(0, windowSeconds - secondsElapsed);
    minutesElapsed = Math.floor(secondsElapsed / 60);
    minutesRemaining = Math.ceil(secondsRemaining / 60);
    timerExpired = secondsRemaining === 0;
  }

  // Partition queue to understand current batch vs roll-over next batch
  const upperCap = Math.max(batchConfig.gbThreshold, batchConfig.gbThreshold + 20);
  const batches = partitionIntoBatches(orders, batchConfig.gbThreshold, batchConfig.maxEntries, upperCap);
  const currentBatch = batches[0] ?? { orders: [], totalGb: 0 };
  const currentBatchGb = currentBatch.totalGb;
  const currentBatchCount = currentBatch.orders.length;
  const nextBatchCount = count - currentBatchCount;
  const nextBatchGb = Math.max(0, totalGb - currentBatchGb);

  const group1Orders = orders.filter((o) => o.gbAmount <= 5);
  const group1Count = group1Orders.length;
  const group1Gb = group1Orders.reduce((sum, o) => sum + o.gbAmount, 0);

  const group2Orders = orders.filter((o) => o.gbAmount > 5);
  const group2Count = group2Orders.length;
  const group2Gb = group2Orders.reduce((sum, o) => sum + o.gbAmount, 0);

  const thresholdMet =
    currentBatchGb >= batchConfig.gbThreshold ||
    totalGb >= batchConfig.gbThreshold ||
    (batchConfig.maxEntries ? currentBatchCount >= batchConfig.maxEntries : false) ||
    group1Gb >= batchConfig.gbThreshold ||
    group2Gb >= batchConfig.gbThreshold;

  return {
    pendingCount: count,
    totalGb,
    gbThreshold: batchConfig.gbThreshold,
    timerMinutes: batchConfig.timerMinutes,
    lastDispatchedAt: batchConfig.lastDispatchedAt ? batchConfig.lastDispatchedAt.toISOString() : null,
    firstOrderAt,
    minutesElapsed,
    minutesRemaining,
    secondsRemaining,
    secondsElapsed,
    batchEnabled: batchConfig.enabled,
    clickyfiedEnabled: config.clickyfied.enabled,
    currentBatchCount,
    currentBatchGb,
    nextBatchCount,
    nextBatchGb,
    thresholdMet,
    timerExpired,
    group1Count,
    group1Gb,
    group2Count,
    group2Gb,
    orders: orders.map((o) => ({
      id: o.id,
      phoneNumber: o.phoneNumber,
      gbAmount: o.gbAmount,
      amount: o.amount,
      createdAt: o.createdAt,
    })),
  };
}

/**
 * Generates or increments a clean sequential batch code (e.g. CF-BATCH-000001, CF-BATCH-000002)
 */
export async function getNextClickyfiedBatchCode(): Promise<string> {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: "clickyfied_batch_seq" },
  });
  let seq = parseInt(setting?.value || "0", 10);
  if (seq === 0) {
    const lastOrder = await prisma.order.findFirst({
      where: { externalReference: { startsWith: "CF-BATCH-" } },
      orderBy: { id: "desc" },
      select: { externalReference: true },
    });
    if (lastOrder?.externalReference) {
      const match = lastOrder.externalReference.match(/CF-BATCH-(\d+)/i);
      if (match) seq = parseInt(match[1], 10);
    }
  }
  seq += 1;
  await prisma.systemSetting.upsert({
    where: { key: "clickyfied_batch_seq" },
    create: { key: "clickyfied_batch_seq", value: String(seq) },
    update: { value: String(seq) },
  });
  return `CF-BATCH-${String(seq).padStart(6, "0")}`;
}

interface SingleBatchChunkResult {
  success: boolean;
  batchCode: string;
  batchOrderId: string;
  dispatchedCount: number;
  totalGb: number;
  error?: string;
}

/**
 * Submits a single batch chunk to Clickyfied.
 * Handles atomic order claiming, formatting entries, calling external API,
 * updating order statuses, recomputing user batch statuses, and audit logging.
 */
async function submitSingleBatchChunk(
  targetOrders: Array<{
    id: number;
    phoneNumber: string;
    network: string;
    gbAmount: number;
    amount: number;
    userId: string;
    source: string;
    batchId: string | null;
    externalReference: string | null;
    createdAt: Date;
  }>,
  groupLabel: "Group 1 (1–5 GB)" | "Group 2 (6+ GB)",
  actorLabel: string,
  client: ClickyfiedClient,
  callbackUrl?: string,
  signingSecret?: string
): Promise<SingleBatchChunkResult> {
  const config = await getProviderRoutingConfig();
  if (!config.enabled) {
    return {
      success: false,
      batchCode: "",
      batchOrderId: "",
      dispatchedCount: 0,
      totalGb: 0,
      error: "Automated API order processing is currently turned OFF. Dispatches are blocked.",
    };
  }
  if (!config.clickyfied.enabled) {
    return {
      success: false,
      batchCode: "",
      batchOrderId: "",
      dispatchedCount: 0,
      totalGb: 0,
      error: "Clickyfied provider integration is currently disabled in provider settings.",
    };
  }

  const batchCode = await getNextClickyfiedBatchCode();
  const targetOrderIds = targetOrders.map((o) => o.id);
  const totalGb = targetOrders.reduce((sum, o) => sum + o.gbAmount, 0);
  const claimToken = `CLICKYFIED_CLAIMED:${batchCode}`;

  // Deterministic idempotency key: hash of sorted order IDs
  // If Clickyfied ever receives a retry for this chunk, the idempotency key is identical,
  // preventing duplicate execution on Clickyfied!
  const sortedIdsStr = [...targetOrderIds].sort((a, b) => a - b).join(",");
  const chunkHash = crypto.createHash("sha256").update(sortedIdsStr).digest("hex").slice(0, 16);
  const idempotencyKey = `CF-B2-${chunkHash}`;

  // Atomic DB claiming to prevent race conditions across PM2 workers.
  // Transition immediately from PENDING to PROCESSING so no other worker, runner tick,
  // or query can select these orders while in flight!
  const claimResult = await prisma.order.updateMany({
    where: {
      id: { in: targetOrderIds },
      status: "PENDING",
      providerReference: null,
      exportBatchId: null,
      exportCount: 0,
      lastExportedAt: null,
    },
    data: {
      status: "PROCESSING",
      providerReference: claimToken,
      externalReference: batchCode,
    },
  });

  if (claimResult.count !== targetOrderIds.length) {
    console.warn(`[ClickyfiedBatch] Claim mismatch for ${groupLabel} (${batchCode}): expected ${targetOrderIds.length}, claimed ${claimResult.count}. Rolling back.`);
    if (claimResult.count > 0) {
      await prisma.order.updateMany({
        where: {
          id: { in: targetOrderIds },
          providerReference: claimToken,
        },
        data: {
          status: "PENDING",
          providerReference: null,
          externalReference: null,
        },
      }).catch(() => {});
    }
    return {
      success: false,
      batchCode,
      batchOrderId: "",
      dispatchedCount: 0,
      totalGb: 0,
      error: `Orders in ${groupLabel} were already claimed or processed by another dispatch cycle.`,
    };
  }

  // Create initial ClickyfiedBatch record and link claimed orders
  const batchTotalAmount = targetOrders.reduce((sum, o) => sum + (o.amount || 0), 0);
  try {
    const initialBatch = await prisma.clickyfiedBatch.upsert({
      where: { batchCode },
      create: {
        batchCode,
        groupLabel,
        status: "PROCESSING",
        totalOrders: targetOrders.length,
        totalGb,
        totalAmount: batchTotalAmount,
        pendingCount: targetOrders.length,
        processedCount: 0,
        failedCount: 0,
        actorLabel,
        idempotencyKey,
      },
      update: {
        groupLabel,
        status: "PROCESSING",
        totalOrders: targetOrders.length,
        totalGb,
        totalAmount: batchTotalAmount,
        pendingCount: targetOrders.length,
      },
    });

    if (initialBatch?.id) {
      await prisma.order.updateMany({
        where: { id: { in: targetOrderIds } },
        data: { clickyfiedBatchId: initialBatch.id },
      });
    }
  } catch (batchInitErr) {
    console.error(`[ClickyfiedBatch] Error creating initial ClickyfiedBatch record for ${batchCode}:`, batchInitErr);
  }

  // Deduplicate entries by normalized phone number so Clickyfied never receives duplicates in the same batch
  const seenEntries = new Set<string>();
  const entries: Array<{ number: string; allocationGB: number }> = [];
  for (const o of targetOrders) {
    let num = o.phoneNumber.replace(/\D/g, "");
    if (num.startsWith("233")) num = "0" + num.slice(3);
    if (num.length === 9 && !num.startsWith("0")) num = "0" + num;
    if (!seenEntries.has(num)) {
      seenEntries.add(num);
      entries.push({ number: num, allocationGB: o.gbAmount });
    }
  }

  const startTime = Date.now();
  let submitRes: any = null;
  let activeEntries = [...entries];
  let currentIdempotencyKey = idempotencyKey;

  try {
    try {
      submitRes = await client.submitOrder({
        externalReference: batchCode,
        entries: activeEntries,
        callbackUrl,
        callbackSigningSecret: signingSecret || undefined,
        idempotencyKey: currentIdempotencyKey,
      });
    } catch (initialErr: any) {
      const msg = (initialErr?.message || "").toLowerCase();
      if (
        msg.includes("already have pending or processing orders") ||
        msg.includes("please wait for those orders to complete")
      ) {
        const conflictPhones = (initialErr.message.match(/\b0\d{9}\b/g) || []) as string[];
        const conflictSet = new Set(conflictPhones.map((p: string) => normalizePhoneLast9(p)));

        if (conflictSet.size > 0) {
          const conflictingOrders = targetOrders.filter((o) =>
            conflictSet.has(normalizePhoneLast9(o.phoneNumber))
          );
          const nonConflictingOrders = targetOrders.filter(
            (o) => !conflictSet.has(normalizePhoneLast9(o.phoneNumber))
          );

          if (conflictingOrders.length > 0 && nonConflictingOrders.length > 0) {
            console.warn(
              `[ClickyfiedBatch] Detected ${conflictingOrders.length} conflicting in-flight number(s) in batch #${batchCode}. Isolating and retrying clean remainder.`
            );

            const conflictIds = conflictingOrders.map((o) => o.id);
            await prisma.order.updateMany({
              where: { id: { in: conflictIds } },
              data: {
                status: "PENDING",
                providerReference: `CLICKYFIED_INFLIGHT_HOLD:${batchCode}`,
                externalReference: batchCode,
                clickyfiedBatchId: null,
                failureReason: "Recipient currently has in-flight order on Clickyfied. Held back from batch.",
              },
            });

            await prisma.orderStatusHistory.createMany({
              data: conflictIds.map((id) => ({
                orderId: id,
                status: "PENDING",
                previousStatus: "PROCESSING",
                note: "Held back: Recipient already has an active order on Clickyfied. Auto-retry held.",
                changedBy: actorLabel,
              })),
            });

            activeEntries = entries.filter((e) => !conflictSet.has(normalizePhoneLast9(e.number)));
            currentIdempotencyKey = `CF-B2-${chunkHash}-CLEAN-${Date.now().toString().slice(-4)}`;

            submitRes = await client.submitOrder({
              externalReference: batchCode,
              entries: activeEntries,
              callbackUrl,
              callbackSigningSecret: signingSecret || undefined,
              idempotencyKey: currentIdempotencyKey,
            });

            targetOrders = nonConflictingOrders;
          } else {
            throw initialErr;
          }
        } else {
          throw initialErr;
        }
      } else {
        throw initialErr;
      }
    }

    let batchOrderId = String(submitRes.orderId || "");
    if (!batchOrderId) {
      try {
        batchOrderId = await client.resolveCanonicalOrderId(batchCode);
      } catch {}
    }
    if (!batchOrderId) {
      batchOrderId = batchCode;
    }
    const providerRef = `CLICKYFIED:${batchOrderId}`;

    // Record successful batch chunk in OrderApiLog
    try {
      await recordOrderApiLog({
        orderId: targetOrders[0]?.id,
        provider: "CLICKYFIED",
        action: "BATCH_CHUNK",
        endpoint: "/api/public/v1/orders",
        method: "POST",
        requestPayload: {
          batchCode,
          groupLabel,
          entriesCount: activeEntries.length,
          totalGb,
          entries: activeEntries,
          callbackUrl,
          idempotencyKey: currentIdempotencyKey,
        },
        responsePayload: submitRes.raw,
        statusCode: 200,
        success: true,
        providerReference: providerRef,
        durationMs: Date.now() - startTime,
      });
    } catch (logErr) {
      console.error("[ClickyfiedBatch] Failed to record OrderApiLog:", logErr);
    }

    // Extract Clickyfied reported status
    const rawAny = submitRes.raw as any;
    const summary = rawAny?.order?.entrySummary || rawAny?.entrySummary;
    const rawStatus = rawAny?.order?.status || submitRes.status || rawAny?.status || "pending";
    const processedAt = rawAny?.order?.processedAt || rawAny?.processedAt;
    const overallStatus = mapClickyfiedStatus(rawStatus, summary, processedAt);

    let returnedEntries: Array<any> =
      rawAny?.order?.entries || rawAny?.entries || submitRes.entries || [];

    // Parse blocked / filtered out entries from Clickyfied
    const rawFiltered =
      (submitRes as any)?.filteredOutEntries ||
      rawAny?.filteredOutEntries ||
      rawAny?.order?.filteredOutEntries ||
      [];

    const parsedFilteredOut: Array<{
      number: string;
      normPhone: string;
      allocationGb?: number;
      reason: string;
      type: string;
    }> = [];

    for (const fo of rawFiltered) {
      const num = fo.number || fo.phone || fo.phoneNumber || "";
      const norm = normalizePhoneLast9(String(num));
      const alloc = typeof fo.allocationGB === "number" ? fo.allocationGB : typeof fo.allocationGb === "number" ? fo.allocationGb : undefined;
      if (norm) {
        parsedFilteredOut.push({
          number: String(num),
          normPhone: norm,
          allocationGb: alloc,
          reason: fo.reason || "Number is blocked by provider",
          type: fo.type || "blocked",
        });
      }
    }

    const parsedEntries: Array<{
      id?: string | number;
      number?: string;
      normPhone: string;
      allocationGb?: number;
      status?: string;
    }> = [];

    for (const re of returnedEntries) {
      const num = re.number || re.phoneNumber || re.phone || "";
      const norm = normalizePhoneLast9(String(num));
      const st = re.status || re.currentStatus || re.deliveryStatus;
      const eId = re.id ?? re.orderEntryId ?? re.entryId ?? re._id;
      const alloc = typeof re.allocationGB === "number" ? re.allocationGB : typeof re.allocationGb === "number" ? re.allocationGb : undefined;
      if (norm) {
        parsedEntries.push({
          id: eId !== undefined && eId !== null ? eId : undefined,
          number: num,
          normPhone: norm,
          allocationGb: alloc,
          status: st,
        });
      }
    }

    const hasAnyEntryId = parsedEntries.some((e) => e.id !== undefined && e.id !== null);
    if (!hasAnyEntryId && batchOrderId && !batchOrderId.startsWith("CF-BATCH-")) {
      try {
        const ordDetails = await client.getOrderStatus(batchOrderId);
        const rawD = ordDetails.raw as any;
        const freshEntries: any[] = rawD?.order?.entries || rawD?.entries || [];
        parsedEntries.length = 0;
        for (const fe of freshEntries) {
          const num = fe.number || fe.phoneNumber || fe.phone || "";
          const norm = normalizePhoneLast9(String(num));
          const st = fe.status || fe.currentStatus || fe.deliveryStatus;
          const eId = fe.id ?? fe.orderEntryId ?? fe.entryId ?? fe._id;
          const alloc = typeof fe.allocationGB === "number" ? fe.allocationGB : typeof fe.allocationGb === "number" ? fe.allocationGb : undefined;
          if (norm) {
            parsedEntries.push({
              id: eId !== undefined && eId !== null ? eId : undefined,
              number: num,
              normPhone: norm,
              allocationGb: alloc,
              status: st,
            });
          }
        }
      } catch {
        // Continue if immediate fetch is not available
      }
    }

    const claimedEntryIndices = new Set<number>();
    const claimedFilteredIndices = new Set<number>();

    for (const order of targetOrders) {
      const phoneNorm = normalizePhoneLast9(order.phoneNumber);

      // 1. Check if this order was filtered out (blocked) by Clickyfied
      let matchedFilteredIdx = parsedFilteredOut.findIndex(
        (fo, idx) =>
          !claimedFilteredIndices.has(idx) &&
          fo.normPhone === phoneNorm &&
          fo.allocationGb !== undefined &&
          Math.abs(fo.allocationGb - order.gbAmount) <= 0.1
      );
      if (matchedFilteredIdx === -1) {
        matchedFilteredIdx = parsedFilteredOut.findIndex(
          (fo, idx) => !claimedFilteredIndices.has(idx) && fo.normPhone === phoneNorm
        );
      }

      if (matchedFilteredIdx !== -1) {
        claimedFilteredIndices.add(matchedFilteredIdx);
        const filteredItem = parsedFilteredOut[matchedFilteredIdx];
        const blockReason = filteredItem.reason || "Number is blocked by Clickyfied";
        const failureReason = `Blocked by provider: ${blockReason}`;

        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: "FAILED",
            providerReference: `CLICKYFIED:${batchOrderId}:BLOCKED`,
            externalReference: batchCode,
            failureReason,
          },
        });

        await prisma.orderStatusHistory.create({
          data: {
            orderId: order.id,
            status: "FAILED",
            previousStatus: "PENDING",
            note: `Excluded from batch #${batchCode}: ${failureReason}`,
            changedBy: actorLabel,
          },
        });

        // Record number as rejected in our verification system so future attempts are blocked
        try {
          const { recordUnverifiedMtnNumber } = await import("../mtn-verification");
          await recordUnverifiedMtnNumber({ number: order.phoneNumber });
          const canonical = normalizeGhanaPhoneNumber(order.phoneNumber);
          await prisma.blockedMtnNumber.updateMany({
            where: { normalizedNumber: canonical },
            data: { status: "REJECTED" },
          });
          await prisma.acceptedMtnNumber.deleteMany({
            where: { normalizedNumber: canonical },
          });
        } catch {}

        continue;
      }

      let matchedIdx = parsedEntries.findIndex(
        (pe, idx) =>
          !claimedEntryIndices.has(idx) &&
          pe.normPhone === phoneNorm &&
          pe.allocationGb !== undefined &&
          Math.abs(pe.allocationGb - order.gbAmount) <= 0.1
      );
      if (matchedIdx === -1) {
        matchedIdx = parsedEntries.findIndex(
          (pe, idx) => !claimedEntryIndices.has(idx) && pe.normPhone === phoneNorm
        );
      }

      const matchedEntry = matchedIdx !== -1 ? parsedEntries[matchedIdx] : null;
      if (matchedIdx !== -1) {
        claimedEntryIndices.add(matchedIdx);
      } else {
        // Recipient was not accepted into Clickyfied's order entries and was not in filteredOutEntries.
        // We MUST NOT leave this order in PROCESSING with a provider reference that doesn't contain it!
        // Revert it back to PENDING for manual processing, preventing duplicate auto-retries.
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: "PENDING",
            providerReference: `CLICKYFIED_MANUAL_HOLD:${batchCode}`,
            externalReference: batchCode,
            clickyfiedBatchId: null,
            failureReason: `Excluded by provider from batch #${batchCode} (${batchOrderId}). Held in PENDING for manual fulfillment only.`,
          },
        });

        await prisma.orderStatusHistory.create({
          data: {
            orderId: order.id,
            status: "PENDING",
            previousStatus: "PROCESSING",
            note: `Excluded by provider from batch #${batchCode} (${batchOrderId}). Reverted to PENDING for manual fulfillment only (auto-retries held).`,
            changedBy: actorLabel,
          },
        });
        continue;
      }

      const entryRawStatus = matchedEntry?.status;
      const entryId = matchedEntry?.id;
      let targetStatus: "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED" | "CANCELLED";
      if (entryRawStatus) {
        const mappedEntry = mapClickyfiedStatus(entryRawStatus);
        if (["SUCCESS", "FAILED", "CANCELLED"].includes(mappedEntry)) {
          targetStatus = mappedEntry;
        } else {
          targetStatus = "PROCESSING";
        }
      } else if (["SUCCESS", "FAILED", "CANCELLED"].includes(overallStatus)) {
        targetStatus = overallStatus;
      } else {
        targetStatus = "PROCESSING";
      }

      const orderProviderRef =
        entryId !== undefined && entryId !== null
          ? `CLICKYFIED:${batchOrderId}:${entryId}`
          : providerRef;

      await prisma.order.update({
        where: { id: order.id },
        data: {
          status: targetStatus,
          providerReference: orderProviderRef,
          externalReference: batchCode,
          failureReason: targetStatus === "FAILED" ? `Failed to deliver: ${rawStatus}` : null,
        },
      });

      await prisma.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: targetStatus,
          previousStatus: "PENDING",
          note: `Submitted in automated ${groupLabel} batch #${batchCode} (${targetOrders.length} entries, ${totalGb} GB). Status: ${entryRawStatus || rawStatus || targetStatus}`,
          changedBy: actorLabel,
        },
      });
    }

    // Recompute user parent batch statuses
    const parentBatchIds = Array.from(
      new Set(targetOrders.map((o) => o.batchId).filter(Boolean) as string[])
    );

    const { recomputeBatchStatus } = await import("../orders");
    for (const bId of parentBatchIds) {
      try {
        await recomputeBatchStatus(bId);
      } catch (err) {
        console.error(`Error recomputing batch status for ${bId}:`, err);
      }
    }

    // Persist final ClickyfiedBatch state and metrics
    try {
      const finalOrders = await prisma.order.findMany({
        where: { id: { in: targetOrderIds }, status: { not: "PENDING" } },
        select: { status: true, gbAmount: true, amount: true },
      });
      const acceptedCount = finalOrders.length;
      const acceptedGb = finalOrders.reduce((sum, o) => sum + o.gbAmount, 0);
      const acceptedAmount = finalOrders.reduce((sum, o) => sum + (o.amount || 0), 0);
      const processedCount = finalOrders.filter((o) => o.status === "SUCCESS").length;
      const failedCount = finalOrders.filter((o) => o.status === "FAILED" || o.status === "CANCELLED").length;
      const pendingCount = finalOrders.filter((o) => o.status === "PROCESSING").length;

      let finalBatchStatus = "PROCESSING";
      if (acceptedCount === 0) {
        finalBatchStatus = "FAILED";
      } else if (pendingCount === 0) {
        if (failedCount === 0) finalBatchStatus = "COMPLETED";
        else if (processedCount === 0) finalBatchStatus = "FAILED";
        else finalBatchStatus = "PARTIALLY_COMPLETED";
      }

      await prisma.clickyfiedBatch.update({
        where: { batchCode },
        data: {
          clickyfiedOrderId: batchOrderId,
          status: finalBatchStatus,
          totalOrders: acceptedCount,
          totalGb: acceptedGb,
          totalAmount: acceptedAmount,
          processedCount,
          failedCount,
          pendingCount,
          rawFilteredOut: parsedFilteredOut.length > 0 ? JSON.stringify(parsedFilteredOut) : null,
          rawResponse: JSON.stringify(submitRes.raw),
          lastSyncedAt: new Date(),
        },
      });
    } catch (batchUpdateErr) {
      console.error(`[ClickyfiedBatch] Failed to update ClickyfiedBatch record for ${batchCode}:`, batchUpdateErr);
    }

    await recordAudit({
      actorLabel,
      action: "provider.clickyfied_mtn_batch_dispatched",
      target: `clickyfied:batch:mtn`,
      newValue: JSON.stringify({
        groupLabel,
        batchCode,
        batchOrderId,
        dispatchedCount: targetOrders.length,
        totalGb,
      }),
    });

    return {
      success: true,
      batchCode,
      batchOrderId,
      dispatchedCount: targetOrders.length,
      totalGb,
    };
  } catch (batchErr: any) {
    const durationMs = Date.now() - startTime;
    console.error(`[ClickyfiedBatch] Dispatch of ${groupLabel} (${batchCode}) encountered an error/timeout:`, batchErr);

    const msgLower = (batchErr?.message || "").toLowerCase();
    const httpStatus = batchErr?.status || (batchErr?.name === "AbortError" ? 504 : 500);

    // Record failed batch chunk in OrderApiLog for complete admin visibility
    try {
      await recordOrderApiLog({
        orderId: targetOrders[0]?.id,
        provider: "CLICKYFIED",
        action: "BATCH_CHUNK",
        endpoint: batchErr?.endpoint || "/api/public/v1/orders",
        method: "POST",
        requestPayload: {
          batchCode,
          groupLabel,
          entriesCount: activeEntries.length,
          totalGb,
          entries: activeEntries,
          callbackUrl,
          idempotencyKey: currentIdempotencyKey,
        },
        responsePayload: batchErr?.rawResponse || { error: batchErr?.message || "Unknown error" },
        statusCode: httpStatus,
        success: false,
        errorMessage: batchErr?.message || "Batch submission failed",
        providerReference: `CLICKYFIED_CLAIMED:${batchCode}`,
        durationMs,
      });
    } catch (logErr) {
      console.error("[ClickyfiedBatch] Failed to record OrderApiLog:", logErr);
    }

    const isProviderHaltedOrDown =
      msgLower.includes("halt") ||
      msgLower.includes("pause") ||
      msgLower.includes("lock") ||
      msgLower.includes("closed") ||
      msgLower.includes("disabled") ||
      msgLower.includes("maintenance") ||
      msgLower.includes("unavailable") ||
      msgLower.includes("temporarily") ||
      msgLower.includes("service error") ||
      msgLower.includes("not accepting") ||
      msgLower.includes("stopped") ||
      httpStatus === 503 ||
      httpStatus === 502;

    if (isProviderHaltedOrDown) {
      console.warn(`[ClickyfiedBatch] Clickyfied provider is temporarily halted/locked (${batchErr?.message}). Releasing orders to PENDING for manual processing:`, batchCode);
      await prisma.order.updateMany({
        where: { id: { in: targetOrderIds } },
        data: {
          status: "PENDING",
          providerReference: `CLICKYFIED_MANUAL_HOLD:${batchCode}`,
          externalReference: batchCode,
          clickyfiedBatchId: null,
          failureReason: `Clickyfied is locked/halted: ${batchErr?.message || "Unavailable"}. Restored to PENDING for manual fulfillment only.`,
        },
      });

      await prisma.orderStatusHistory.createMany({
        data: targetOrders.map((o) => ({
          orderId: o.id,
          status: "PENDING",
          previousStatus: "PROCESSING",
          note: `Clickyfied halted or locked (${batchErr?.message || "Orders paused"}). Restored to PENDING for manual processing (automated retries blocked).`,
          changedBy: actorLabel,
        })),
      });

      try {
        await prisma.clickyfiedBatch.update({
          where: { batchCode },
          data: {
            status: "FAILED",
            failedCount: targetOrders.length,
            pendingCount: 0,
            errorMessage: `Provider halted/locked: ${batchErr?.message || "Unavailable"}`,
            lastSyncedAt: new Date(),
          },
        });
      } catch {}

      return {
        success: false,
        batchCode,
        batchOrderId: "",
        dispatchedCount: 0,
        totalGb: 0,
        error: `Clickyfied is locked/halted: ${batchErr?.message || "Unavailable"}. Orders released to PENDING for manual processing.`,
      };
    }

    // If ALL submitted entries were genuinely blocked and filtered out by Clickyfied (HTTP 400 with blocked list)
    const isAllBlocked =
      batchErr?.isAllBlocked ||
      (Array.isArray(batchErr?.filteredOutEntries) && batchErr.filteredOutEntries.length > 0) ||
      (typeof batchErr?.message === "string" &&
        (batchErr.message.toLowerCase().includes("all submitted entries are blocked") ||
          batchErr.message.toLowerCase().includes("entries are blocked and were filtered out")));

    if (isAllBlocked) {
      console.warn(`[ClickyfiedBatch] All orders in ${groupLabel} (${batchCode}) were blocked by Clickyfied:`, batchErr.message);
      const failReason = `Blocked by provider: ${batchErr.message || "All entries were blocked by provider"}`;

      await prisma.order.updateMany({
        where: { id: { in: targetOrderIds } },
        data: {
          status: "FAILED",
          providerReference: `CLICKYFIED:BLOCKED`,
          externalReference: batchCode,
          failureReason: failReason,
        },
      });

      await prisma.orderStatusHistory.createMany({
        data: targetOrders.map((o) => ({
          orderId: o.id,
          status: "FAILED",
          previousStatus: "PENDING",
          note: failReason,
          changedBy: actorLabel,
        })),
      });

      for (const o of targetOrders) {
        try {
          const { recordUnverifiedMtnNumber } = await import("../mtn-verification");
          await recordUnverifiedMtnNumber({ number: o.phoneNumber });
          const canonical = normalizeGhanaPhoneNumber(o.phoneNumber);
          await prisma.blockedMtnNumber.updateMany({
            where: { normalizedNumber: canonical },
            data: { status: "REJECTED" },
          });
          await prisma.acceptedMtnNumber.deleteMany({
            where: { normalizedNumber: canonical },
          });
        } catch {}
      }

      try {
        await prisma.clickyfiedBatch.update({
          where: { batchCode },
          data: {
            status: "FAILED",
            failedCount: targetOrders.length,
            pendingCount: 0,
            errorMessage: failReason,
            rawFilteredOut: (batchErr as any)?.filteredOutEntries ? JSON.stringify((batchErr as any).filteredOutEntries) : null,
            lastSyncedAt: new Date(),
          },
        });
      } catch {}

      return {
        success: false,
        batchCode,
        batchOrderId: "",
        dispatchedCount: 0,
        totalGb: 0,
        error: failReason,
      };
    }

    // 4xx Client Errors (HTTP 400 Bad Request, 401 Invalid Credentials, 403 Forbidden, 422 Unprocessable):
    // Clickyfied rejected the submission entirely. Clickyfied has NOT created any order.
    // We MUST mark the batch as FAILED and restore orders back to PENDING so they are not stranded in PROCESSING!
    const isClientError = httpStatus >= 400 && httpStatus < 500;
    if (isClientError) {
      console.warn(`[ClickyfiedBatch] Provider rejected ${groupLabel} (${batchCode}) with HTTP ${httpStatus}: ${batchErr?.message}. Reverting orders to PENDING queue.`);
      const failReason = `Rejected by provider (${httpStatus}): ${batchErr?.message || "Bad Request"}`;

      await prisma.order.updateMany({
        where: { id: { in: targetOrderIds } },
        data: {
          status: "PENDING",
          providerReference: `CLICKYFIED_MANUAL_HOLD:${batchCode}`,
          externalReference: batchCode,
          clickyfiedBatchId: null,
          failureReason: `${failReason}. Restored to PENDING for manual fulfillment only.`,
        },
      });

      await prisma.orderStatusHistory.createMany({
        data: targetOrders.map((o) => ({
          orderId: o.id,
          status: "PENDING",
          previousStatus: "PROCESSING",
          note: `Batch rejected by provider (${httpStatus}: ${batchErr?.message || "Rejected"}). Returned to PENDING for manual fulfillment only (automated retries blocked).`,
          changedBy: actorLabel,
        })),
      });

      try {
        await prisma.clickyfiedBatch.update({
          where: { batchCode },
          data: {
            status: "FAILED",
            failedCount: targetOrders.length,
            pendingCount: 0,
            errorMessage: failReason,
            lastSyncedAt: new Date(),
          },
        });
      } catch {}

      return {
        success: false,
        batchCode,
        batchOrderId: "",
        dispatchedCount: 0,
        totalGb: 0,
        error: failReason,
      };
    }

    // Network timeouts (HTTP 504 / AbortError / Network blips):
    // Check if Clickyfied actually received and created this batch during the blip
    let verifiedOrderId: string | null = null;
    try {
      const canonical = await client.resolveCanonicalOrderId(batchCode);
      if (canonical && canonical !== batchCode && canonical.startsWith("order-")) {
        verifiedOrderId = canonical;
      } else {
        const recent = await client.listOrders(20);
        const match = recent.find((r: any) => r.externalReference === batchCode || r.orderId === batchCode);
        if (match?.orderId) {
          verifiedOrderId = String(match.orderId);
        }
      }
    } catch {
      verifiedOrderId = null;
    }

    if (verifiedOrderId) {
      console.log(`[ClickyfiedBatch] Batch ${batchCode} was received by Clickyfied as ${verifiedOrderId}. Keeping as PROCESSING.`);
      await prisma.order.updateMany({
        where: { id: { in: targetOrderIds } },
        data: {
          status: "PROCESSING",
          providerReference: `CLICKYFIED:${verifiedOrderId}`,
          externalReference: batchCode,
        },
      });

      await prisma.orderStatusHistory.createMany({
        data: targetOrders.map((o) => ({
          orderId: o.id,
          status: "PROCESSING",
          previousStatus: "PENDING",
          note: `Batch dispatched with network blip, confirmed on Clickyfied as ${verifiedOrderId} (#${batchCode}).`,
          changedBy: actorLabel,
        })),
      });

      try {
        await prisma.clickyfiedBatch.update({
          where: { batchCode },
          data: {
            clickyfiedOrderId: verifiedOrderId,
            status: "PROCESSING",
            errorMessage: `Dispatched with network blip, confirmed on Clickyfied as ${verifiedOrderId}`,
            lastSyncedAt: new Date(),
          },
        });
      } catch {}

      return {
        success: true,
        batchCode,
        batchOrderId: verifiedOrderId,
        dispatchedCount: targetOrders.length,
        totalGb,
      };
    }

    // If timeout and unconfirmed on provider, revert to PENDING and mark batch as FAILED so orders don't get stuck forever
    console.warn(`[ClickyfiedBatch] Batch delivery attempt for ${groupLabel} (${batchCode}) timed out without provider confirmation. Reverting orders to PENDING:`, batchErr?.message);
    const timeoutMsg = batchErr?.message ? `Timeout / network failure: ${String(batchErr.message).slice(0, 150)}` : "Batch dispatch timed out";

    await prisma.order.updateMany({
      where: {
        id: { in: targetOrderIds },
        providerReference: claimToken,
      },
      data: {
        status: "PENDING",
        providerReference: `CLICKYFIED_MANUAL_HOLD:${batchCode}`,
        externalReference: batchCode,
        clickyfiedBatchId: null,
        failureReason: `${timeoutMsg}. Restored to PENDING for manual fulfillment only.`,
      },
    }).catch(() => {});

    await prisma.orderStatusHistory.createMany({
      data: targetOrders.map((o) => ({
        orderId: o.id,
        status: "PENDING",
        previousStatus: "PROCESSING",
        note: `Batch delivery unconfirmed on provider (#${batchCode}). Reverted to PENDING for manual fulfillment only (automated retries blocked).`,
        changedBy: actorLabel,
      })),
    });

    try {
      await prisma.clickyfiedBatch.update({
        where: { batchCode },
        data: {
          status: "FAILED",
          errorMessage: timeoutMsg,
          lastSyncedAt: new Date(),
        },
      });
    } catch {}

    return {
      success: false,
      batchCode,
      batchOrderId: "",
      dispatchedCount: 0,
      totalGb: 0,
      error: timeoutMsg,
    };
  }
}

/**
 * Dispatches eligible pending MTN orders in batches grouped into two distinct groups:
 * 1. Group 1: 1 GB to 5 GB orders (small bundles)
 * 2. Group 2: 6 GB and above orders (large bundles)
 * 
 * Each group is sent as its own separate batch to Clickyfied with its own sequential batch code,
 * sized by the configured GB threshold window without artificial recipient caps.
 */
export async function dispatchClickyfiedMtnBatch(
  actorLabel = "Batch System",
  options: { onlyFullBatches?: boolean } = {}
): Promise<{
  success: boolean;
  dispatchedCount: number;
  totalGb: number;
  batchIds: string[];
  batchCode?: string;
  batchCodes?: string[];
  groups?: Array<{
    group: string;
    batchCode: string;
    batchOrderId: string;
    count: number;
    totalGb: number;
  }>;
  error?: string;
  message?: string;
}> {
  if (isDispatchingBatch) {
    return {
      success: false,
      dispatchedCount: 0,
      totalGb: 0,
      batchIds: [],
      error: "A batch dispatch operation is already in progress in this worker.",
    };
  }

  // Acquire distributed lock so other PM2 cluster workers do not dispatch concurrently
  const lockAcquired = await acquireBatchDispatchLock(180);
  if (!lockAcquired) {
    return {
      success: false,
      dispatchedCount: 0,
      totalGb: 0,
      batchIds: [],
      error: "Another cluster worker or server is currently dispatching a batch.",
    };
  }

  isDispatchingBatch = true;

  try {
    const config = await getProviderRoutingConfig();
    if (!config.enabled) {
      return {
        success: false,
        dispatchedCount: 0,
        totalGb: 0,
        batchIds: [],
        error: "Automated order processing is currently disabled.",
      };
    }
    if (!config.clickyfied.enabled) {
      return {
        success: false,
        dispatchedCount: 0,
        totalGb: 0,
        batchIds: [],
        error: "Clickyfied provider is currently disabled.",
      };
    }

    const batchConfig = await getClickyfiedBatchConfig();
    if (!batchConfig.enabled) {
      return {
        success: false,
        dispatchedCount: 0,
        totalGb: 0,
        batchIds: [],
        error: "Clickyfied MTN batch processing is currently disabled in settings.",
      };
    }

    const { orders, count, totalGb } = await getPendingMtnClickyfiedOrders();
    if (count === 0) {
      return {
        success: true,
        dispatchedCount: 0,
        totalGb: 0,
        batchIds: [],
        message: "No pending MTN orders to dispatch.",
      };
    }

    // Partition orders into Group 1 (1–5 GB) and Group 2 (6+ GB)
    const group1Orders = orders.filter((o) => o.gbAmount <= 5);
    const group2Orders = orders.filter((o) => o.gbAmount > 5);

    const group1Gb = group1Orders.reduce((sum, o) => sum + o.gbAmount, 0);
    const group2Gb = group2Orders.reduce((sum, o) => sum + o.gbAmount, 0);

    // If options.onlyFullBatches is set (volume threshold trigger):
    // Only dispatch if total queue meets threshold OR either group meets threshold
    if (options.onlyFullBatches) {
      const thresholdMet =
        totalGb >= batchConfig.gbThreshold ||
        (batchConfig.maxEntries ? count >= batchConfig.maxEntries : false) ||
        group1Gb >= batchConfig.gbThreshold ||
        group2Gb >= batchConfig.gbThreshold;

      if (!thresholdMet) {
        return {
          success: true,
          dispatchedCount: 0,
          totalGb: 0,
          batchIds: [],
          message: `Current queue (${totalGb} GB, ${count} entries; Group 1: ${group1Gb} GB, Group 2: ${group2Gb} GB) has not reached the ${batchConfig.gbThreshold} GB limit yet. Orders remain queued to accumulate.`,
        };
      }
    }

    const upperCap = Math.max(batchConfig.gbThreshold, batchConfig.gbThreshold + 20);
    const group1Chunks = partitionIntoBatches(group1Orders, batchConfig.gbThreshold, batchConfig.maxEntries, upperCap);
    const group2Chunks = partitionIntoBatches(group2Orders, batchConfig.gbThreshold, batchConfig.maxEntries, upperCap);

    const client = new ClickyfiedClient(config.clickyfied);

    const settingBaseUrl = await prisma.systemSetting.findUnique({ where: { key: "app_base_url" } });
    const appBaseUrl = settingBaseUrl?.value
      ? settingBaseUrl.value.replace(/\/+$/, "")
      : process.env.NEXTAUTH_URL || process.env.APP_URL || "https://tsk05.net";

    const isPublicUrl = appBaseUrl.startsWith("https://") && !appBaseUrl.includes("localhost");
    const signingSecret = (config.clickyfied.callbackSigningSecret || process.env.CLICKYFIED_CALLBACK_SECRET || "").trim();
    const callbackUrl = isPublicUrl
      ? `${appBaseUrl}/api/webhooks/providers/clickyfied`
      : undefined;

    const dispatchedBatches: Array<{
      group: string;
      batchCode: string;
      batchOrderId: string;
      count: number;
      totalGb: number;
    }> = [];
    const batchCodes: string[] = [];
    const batchIds: string[] = [];
    const chunkErrors: string[] = [];
    let totalDispatchedCount = 0;
    let totalDispatchedGb = 0;

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    // 1. Dispatch Group 1 (1–5 GB) batches
    for (let i = 0; i < group1Chunks.length; i++) {
      const chunk = group1Chunks[i];
      if (chunk.orders.length === 0) continue;
      // When onlyFullBatches is requested (threshold trigger), hold back remainder chunks that have not reached threshold
      if (options.onlyFullBatches && chunk.totalGb < batchConfig.gbThreshold && (!batchConfig.maxEntries || chunk.orders.length < batchConfig.maxEntries)) {
        continue;
      }
      if (i > 0) {
        await sleep(1500);
      }
      const res = await submitSingleBatchChunk(
        chunk.orders,
        "Group 1 (1–5 GB)",
        actorLabel,
        client,
        callbackUrl,
        signingSecret
      );
      if (res.success) {
        batchCodes.push(res.batchCode);
        if (res.batchOrderId) batchIds.push(res.batchOrderId);
        totalDispatchedCount += res.dispatchedCount;
        totalDispatchedGb += res.totalGb;
        dispatchedBatches.push({
          group: "Group 1 (1–5 GB)",
          batchCode: res.batchCode,
          batchOrderId: res.batchOrderId,
          count: res.dispatchedCount,
          totalGb: res.totalGb,
        });
      } else if (res.error) {
        chunkErrors.push(`Group 1 (${res.batchCode}): ${res.error}`);
      }
    }

    // 2. Dispatch Group 2 (6+ GB) batches
    for (let i = 0; i < group2Chunks.length; i++) {
      const chunk = group2Chunks[i];
      if (chunk.orders.length === 0) continue;
      // When onlyFullBatches is requested (threshold trigger), hold back remainder chunks that have not reached threshold
      if (options.onlyFullBatches && chunk.totalGb < batchConfig.gbThreshold && (!batchConfig.maxEntries || chunk.orders.length < batchConfig.maxEntries)) {
        continue;
      }
      if (dispatchedBatches.length > 0 || i > 0) {
        await sleep(1500);
      }
      const res = await submitSingleBatchChunk(
        chunk.orders,
        "Group 2 (6+ GB)",
        actorLabel,
        client,
        callbackUrl,
        signingSecret
      );
      if (res.success) {
        batchCodes.push(res.batchCode);
        if (res.batchOrderId) batchIds.push(res.batchOrderId);
        totalDispatchedCount += res.dispatchedCount;
        totalDispatchedGb += res.totalGb;
        dispatchedBatches.push({
          group: "Group 2 (6+ GB)",
          batchCode: res.batchCode,
          batchOrderId: res.batchOrderId,
          count: res.dispatchedCount,
          totalGb: res.totalGb,
        });
      } else if (res.error) {
        chunkErrors.push(`Group 2 (${res.batchCode}): ${res.error}`);
      }
    }

    if (totalDispatchedCount > 0) {
      // Reset the last dispatched timestamp so timer starts fresh for the next batch cycle
      await prisma.systemSetting.upsert({
        where: { key: "clickyfied_batch_last_dispatched_at" },
        create: { key: "clickyfied_batch_last_dispatched_at", value: new Date().toISOString() },
        update: { value: new Date().toISOString() },
      });
    }

    const remainingOrdersCount = count - totalDispatchedCount;
    const remainingOrdersGb = Math.max(0, totalGb - totalDispatchedGb);

    if (totalDispatchedCount === 0 && chunkErrors.length > 0) {
      return {
        success: false,
        dispatchedCount: 0,
        totalGb: 0,
        batchIds: [],
        batchCodes: [],
        error: `Clickyfied dispatch failed: ${chunkErrors.join("; ")}`,
        message: `Clickyfied dispatch failed: ${chunkErrors.join("; ")}`,
      };
    }

    const groupSummaryText = dispatchedBatches
      .map((b) => `${b.group} (${b.batchCode}): ${b.count} orders (${b.totalGb} GB)`)
      .join("; ");

    return {
      success: totalDispatchedCount > 0,
      dispatchedCount: totalDispatchedCount,
      totalGb: totalDispatchedGb,
      batchIds,
      batchCode: batchCodes.join(", "),
      batchCodes,
      groups: dispatchedBatches,
      message: totalDispatchedCount > 0
        ? `Dispatched ${dispatchedBatches.length} batch(es) to Clickyfied: ${groupSummaryText}.${remainingOrdersCount > 0 ? ` ${remainingOrdersCount} order(s) (${remainingOrdersGb} GB) remain queued.` : " Queue is now empty."}`
        : "No batches were dispatched.",
    };
  } finally {
    isDispatchingBatch = false;
    await releaseBatchDispatchLock();
  }
}

/**
 * Checks triggers (volume threshold or timer expiration) and executes batch dispatch if warranted.
 * 
 * - THRESHOLD: Dispatches batches that have accumulated >= configured GB threshold.
 *   If a massive order arrives (e.g. 250 GB), it dispatches Chunk 1 (~100 GB), Chunk 2 (~100 GB),
 *   leaving any remainder (< threshold) in queue to accumulate or wait for timer.
 * 
 * - TIMER: Dispatches all remaining queued orders ONLY when the countdown timer window has actually
 *   expired (hit 0, default 15 minutes after oldest order).
 */
export async function checkAndTriggerMtnBatch(
  trigger?: "THRESHOLD" | "TIMER" | string
): Promise<{ triggered: boolean; reason?: string }> {
  try {
    const config = await getProviderRoutingConfig();
    if (!config.enabled || !config.clickyfied.enabled) return { triggered: false };

    const batchConfig = await getClickyfiedBatchConfig();
    if (!batchConfig.enabled) return { triggered: false };

    const status = await getClickyfiedBatchStatus();
    if (status.pendingCount === 0) return { triggered: false };

    // 1. Volume threshold trigger: dispatch only full batches (chunks that reached configured GB threshold)
    if (status.thresholdMet) {
      let dispatchTotalGb = 0;
      let dispatchCount = 0;
      let iterations = 0;

      while (iterations < 10) {
        iterations++;
        const currentStatus = await getClickyfiedBatchStatus();
        if (currentStatus.pendingCount === 0 || !currentStatus.thresholdMet) break;

        const res = await dispatchClickyfiedMtnBatch(
          `Volume Threshold (${currentStatus.totalGb} GB in queue, chunk ${iterations})`,
          { onlyFullBatches: true }
        );
        if (!res.success || res.dispatchedCount === 0) break;
        dispatchTotalGb += res.totalGb;
        dispatchCount += res.dispatchedCount;
      }

      if (dispatchCount > 0) {
        return {
          triggered: true,
          reason: `Volume threshold dispatched ${dispatchCount} order(s) (${dispatchTotalGb} GB)`,
        };
      }
    }

    // 2. Timer expiration trigger: ONLY when countdown timer has ACTUALLY reached 0 (expired)
    if (status.timerExpired && status.pendingCount > 0) {
      // Immediately reset timer timestamp so no subsequent ticks or other threads see expired timer
      await prisma.systemSetting.upsert({
        where: { key: "clickyfied_batch_last_dispatched_at" },
        create: { key: "clickyfied_batch_last_dispatched_at", value: new Date().toISOString() },
        update: { value: new Date().toISOString() },
      });

      let dispatchTotalGb = 0;
      let dispatchCount = 0;
      let iterations = 0;

      while (iterations < 10) {
        iterations++;
        const currentStatus = await getClickyfiedBatchStatus();
        if (currentStatus.pendingCount === 0) break;

        const res = await dispatchClickyfiedMtnBatch(
          `Timer Window Expired (${status.minutesElapsed} mins, chunk ${iterations})`,
          { onlyFullBatches: false }
        );
        if (!res.success || res.dispatchedCount === 0) break;
        dispatchTotalGb += res.totalGb;
        dispatchCount += res.dispatchedCount;
      }

      if (dispatchCount > 0) {
        return {
          triggered: true,
          reason: `Timer expired dispatched ${dispatchCount} order(s) (${dispatchTotalGb} GB)`,
        };
      }
    }

    return { triggered: false };
  } catch (err: any) {
    console.error("[ClickyfiedBatch] Trigger check error:", err);
    return { triggered: false, reason: err?.message };
  }
}

/**
 * Dedicated background runner for Clickyfied MTN batch queue.
 * Runs completely independent of the status sync poller.
 * Checks the queue every 10 seconds:
 * - If volume threshold is reached (>= 100 GB or >= 100 orders), dispatches immediately.
 * - If accumulation timer hits 0:00, dispatches whatever orders have piled up.
 */
export function startClickyfiedBatchRunner() {
  if (typeof window !== "undefined") return;

  const instanceId = process.env.pm_id ?? process.env.NODE_APP_INSTANCE;
  if (instanceId !== undefined && instanceId !== "" && instanceId !== "0") {
    console.log(`[ClickyfiedBatchRunner] Skipping runner initialization on PM2 cluster worker #${instanceId}`);
    return;
  }

  const g = globalThis as any;
  if (g.__clickyfiedBatchRunnerStarted) return;
  g.__clickyfiedBatchRunnerStarted = true;

  console.log("[ClickyfiedBatchRunner] Dedicated MTN batch queue runner initialized (10s check interval).");

  let isRunning = false;
  const tick = async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      const config = await getProviderRoutingConfig();
      if (!config.enabled || !config.clickyfied.enabled) return;

      const batchConfig = await getClickyfiedBatchConfig();
      if (!batchConfig.enabled) return;

      const status = await getClickyfiedBatchStatus();
      if (status.pendingCount === 0) return;

      if (status.thresholdMet) {
        console.log(`[ClickyfiedBatchRunner] Volume threshold met (${status.totalGb} GB, ${status.pendingCount} orders). Triggering dispatch.`);
        await checkAndTriggerMtnBatch("THRESHOLD");
        return;
      }

      if (status.timerExpired) {
        console.log(`[ClickyfiedBatchRunner] Accumulation timer expired (${status.minutesElapsed}m elapsed, ${status.totalGb} GB, ${status.pendingCount} orders). Triggering dispatch.`);
        await checkAndTriggerMtnBatch("TIMER");
      }
    } catch (err: any) {
      console.error("[ClickyfiedBatchRunner] Error during queue check:", err?.message || err);
    } finally {
      isRunning = false;
    }
  };

  // Run initial check after 3 seconds, then every 10 seconds
  setTimeout(tick, 3000);
  setInterval(tick, 10_000);
}

// ─────────────────────────────────────────────────────────────────────────────
// CLICKYFIED BATCHES ADMIN & MANAGEMENT FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Backfills any existing Clickyfied batches from Order.externalReference (CF-BATCH-XXXXXX)
 * into the dedicated ClickyfiedBatch table so all historical batches are visible immediately.
 */
export async function backfillPastClickyfiedBatches(): Promise<number> {
  try {
    const unlinkedBatches = await prisma.order.groupBy({
      by: ["externalReference"],
      where: {
        externalReference: { startsWith: "CF-BATCH-" },
        clickyfiedBatchId: null,
      },
      _count: { id: true },
      _sum: { gbAmount: true, amount: true },
    });

    if (unlinkedBatches.length === 0) return 0;

    let backfilled = 0;
    for (const b of unlinkedBatches) {
      const batchCode = b.externalReference;
      if (!batchCode) continue;

      const orders = await prisma.order.findMany({
        where: { externalReference: batchCode },
        select: {
          id: true,
          status: true,
          gbAmount: true,
          amount: true,
          providerReference: true,
          createdAt: true,
        },
      });

      if (orders.length === 0) continue;

      // Extract canonical orderId from providerReference
      let clickyfiedOrderId: string | null = null;
      for (const o of orders) {
        if (o.providerReference && o.providerReference.startsWith("CLICKYFIED:")) {
          const parts = o.providerReference.split(":");
          if (parts[1] && parts[1] !== "BLOCKED") {
            clickyfiedOrderId = parts[1];
            break;
          }
        }
      }

      const totalOrders = orders.length;
      const totalGb = orders.reduce((sum, o) => sum + o.gbAmount, 0);
      const totalAmount = orders.reduce((sum, o) => sum + o.amount, 0);
      const processedCount = orders.filter((o) => o.status === "SUCCESS").length;
      const failedCount = orders.filter((o) => o.status === "FAILED" || o.status === "CANCELLED").length;
      const pendingCount = orders.filter((o) => o.status === "PROCESSING" || o.status === "PENDING").length;

      let status = "PROCESSING";
      if (pendingCount === 0) {
        if (failedCount === 0) status = "COMPLETED";
        else if (processedCount === 0) status = "FAILED";
        else status = "PARTIALLY_COMPLETED";
      }

      const maxGb = Math.max(...orders.map((o) => o.gbAmount));
      const groupLabel = maxGb <= 5 ? "Group 1 (1–5 GB)" : "Group 2 (6+ GB)";
      const minCreatedAt = orders.reduce((min, o) => (o.createdAt < min ? o.createdAt : min), orders[0].createdAt);

      const batch = await prisma.clickyfiedBatch.upsert({
        where: { batchCode },
        create: {
          batchCode,
          clickyfiedOrderId,
          groupLabel,
          status,
          totalOrders,
          totalGb,
          totalAmount,
          processedCount,
          failedCount,
          pendingCount,
          actorLabel: "System (Historical Backfill)",
          createdAt: minCreatedAt,
          updatedAt: new Date(),
        },
        update: {
          clickyfiedOrderId: clickyfiedOrderId || undefined,
          status,
          totalOrders,
          totalGb,
          totalAmount,
          processedCount,
          failedCount,
          pendingCount,
        },
      });

      await prisma.order.updateMany({
        where: { externalReference: batchCode },
        data: { clickyfiedBatchId: batch.id },
      });

      backfilled++;
    }

    return backfilled;
  } catch (err) {
    console.error("[ClickyfiedBatch] Error backfilling past batches:", err);
    return 0;
  }
}

export interface ClickyfiedBatchesFilter {
  page?: number;
  pageSize?: number;
  status?: string;
  group?: string;
  search?: string;
}

/**
 * Returns a paginated list of all batches sent to Clickyfied with status breakdowns and summary metrics.
 */
export async function getClickyfiedBatches(params: ClickyfiedBatchesFilter = {}) {
  // Ensure unlinked historical orders are backfilled
  try {
    await backfillPastClickyfiedBatches();
  } catch {}

  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));
  const skip = (page - 1) * pageSize;

  const where: any = {};
  if (params.status && params.status !== "ALL") {
    where.status = params.status;
  }
  if (params.group && params.group !== "ALL") {
    where.groupLabel = { contains: params.group, mode: "insensitive" };
  }
  if (params.search && params.search.trim()) {
    const q = params.search.trim();
    where.OR = [
      { batchCode: { contains: q, mode: "insensitive" } },
      { clickyfiedOrderId: { contains: q, mode: "insensitive" } },
      { errorMessage: { contains: q, mode: "insensitive" } },
      {
        orders: {
          some: {
            phoneNumber: { contains: q },
          },
        },
      },
    ];
  }

  try {
    const [total, batches, metricsAgg, processingBatchesCount] = await Promise.all([
      prisma.clickyfiedBatch.count({ where }),
      prisma.clickyfiedBatch.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          _count: {
            select: { orders: true },
          },
        },
      }),
      prisma.clickyfiedBatch.aggregate({
        _count: { id: true },
        _sum: {
          totalGb: true,
          totalOrders: true,
          processedCount: true,
          failedCount: true,
          pendingCount: true,
        },
      }),
      prisma.clickyfiedBatch.count({
        where: { status: "PROCESSING" },
      }),
    ]);

    return {
      batches,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
      metrics: {
        totalBatches: metricsAgg._count.id || 0,
        totalGb: metricsAgg._sum.totalGb || 0,
        totalOrders: metricsAgg._sum.totalOrders || 0,
        deliveredOrders: metricsAgg._sum.processedCount || 0,
        failedOrders: metricsAgg._sum.failedCount || 0,
        inFlightOrders: metricsAgg._sum.pendingCount || 0,
        processingBatches: processingBatchesCount,
      },
    };
  } catch (dbErr: any) {
    console.error("[ClickyfiedBatch] Error querying batches:", dbErr?.message || dbErr);
    return {
      batches: [],
      total: 0,
      page,
      pageSize,
      totalPages: 1,
      metrics: {
        totalBatches: 0,
        totalGb: 0,
        totalOrders: 0,
        deliveredOrders: 0,
        failedOrders: 0,
        inFlightOrders: 0,
        processingBatches: 0,
      },
      error: dbErr?.message || "Failed to load batches from database",
    };
  }
}

/**
 * Returns comprehensive details for a specific batch, including all linked orders,
 * Clickyfied canonical order ID, raw response, blocked entries, and status logs.
 */
export async function getClickyfiedBatchDetail(idOrBatchCode: string) {
  const batch = await prisma.clickyfiedBatch.findFirst({
    where: {
      OR: [{ id: idOrBatchCode }, { batchCode: idOrBatchCode }],
    },
    include: {
      orders: {
        include: {
          user: {
            select: { id: true, name: true, email: true, phone: true },
          },
          history: {
            orderBy: { createdAt: "desc" },
            take: 5,
          },
        },
        orderBy: { id: "asc" },
      },
    },
  });

  if (!batch) return null;

  let parsedFilteredOut: any[] = [];
  if (batch.rawFilteredOut) {
    try {
      parsedFilteredOut = JSON.parse(batch.rawFilteredOut);
    } catch {}
  }

  let parsedRawResponse: any = null;
  if (batch.rawResponse) {
    try {
      parsedRawResponse = JSON.parse(batch.rawResponse);
    } catch {}
  }

  return {
    ...batch,
    parsedFilteredOut,
    parsedRawResponse,
  };
}

/**
 * Syncs delivery status for a batch from Clickyfied's API, updating individual orders and batch counters.
 */
export async function syncClickyfiedBatchStatus(
  idOrBatchCode: string,
  actorLabel = "Staff Manual Sync"
): Promise<{
  success: boolean;
  batch: any;
  updatedCount: number;
  message?: string;
}> {
  const batch = await prisma.clickyfiedBatch.findFirst({
    where: {
      OR: [{ id: idOrBatchCode }, { batchCode: idOrBatchCode }],
    },
    include: {
      orders: true,
    },
  });

  if (!batch) {
    throw new Error(`Clickyfied batch not found: ${idOrBatchCode}`);
  }

  const config = await getProviderRoutingConfig();
  const client = new ClickyfiedClient(config.clickyfied);
  const queryTarget = batch.clickyfiedOrderId || batch.batchCode;

  let details: any;
  try {
    details = await client.getOrderStatus(queryTarget);
  } catch (err: any) {
    // If order lookup by current ID failed, attempt resolving by batchCode
    if (batch.batchCode && batch.batchCode !== queryTarget) {
      try {
        const canonical = await client.resolveCanonicalOrderId(batch.batchCode);
        if (canonical && canonical !== batch.batchCode) {
          details = await client.getOrderStatus(canonical);
          await prisma.clickyfiedBatch.update({
            where: { id: batch.id },
            data: { clickyfiedOrderId: canonical },
          });
        } else {
          throw err;
        }
      } catch {
        throw new Error(`Failed to query Clickyfied API for batch #${batch.batchCode}: ${err?.message || "Unknown error"}`);
      }
    } else {
      throw new Error(`Failed to query Clickyfied API for batch #${batch.batchCode}: ${err?.message || "Unknown error"}`);
    }
  }

  const rawAny = details.raw as any;
  const returnedEntries: any[] = rawAny?.order?.entries || rawAny?.entries || [];
  const rawFiltered: any[] = rawAny?.order?.filteredOutEntries || rawAny?.filteredOutEntries || [];

  const canonicalId =
    rawAny?.order?.orderId ||
    rawAny?.orderId ||
    batch.clickyfiedOrderId ||
    batch.batchCode;

  // Build lookup maps for fast matching
  const parsedEntries: Array<{
    id?: string | number;
    number?: string;
    normPhone: string;
    allocationGb?: number;
    status?: string;
  }> = [];

  for (const re of returnedEntries) {
    const num = re.number || re.phoneNumber || re.phone || "";
    const norm = normalizePhoneLast9(String(num));
    const st = re.status || re.currentStatus || re.deliveryStatus;
    const eId = re.id ?? re.orderEntryId ?? re.entryId ?? re._id;
    const alloc = typeof re.allocationGB === "number" ? re.allocationGB : typeof re.allocationGb === "number" ? re.allocationGb : undefined;
    if (norm) {
      parsedEntries.push({
        id: eId !== undefined && eId !== null ? eId : undefined,
        number: num,
        normPhone: norm,
        allocationGb: alloc,
        status: st,
      });
    }
  }

  const parsedFilteredOut: Array<{
    number: string;
    normPhone: string;
    allocationGb?: number;
    reason: string;
    type: string;
  }> = [];

  for (const fo of rawFiltered) {
    const num = fo.number || fo.phone || fo.phoneNumber || "";
    const norm = normalizePhoneLast9(String(num));
    const alloc = typeof fo.allocationGB === "number" ? fo.allocationGB : typeof fo.allocationGb === "number" ? fo.allocationGb : undefined;
    if (norm) {
      parsedFilteredOut.push({
        number: String(num),
        normPhone: norm,
        allocationGb: alloc,
        reason: fo.reason || "Number is blocked by provider",
        type: fo.type || "blocked",
      });
    }
  }

  const claimedEntryIndices = new Set<number>();
  let updatedOrdersCount = 0;

  for (const order of batch.orders) {
    const phoneNorm = normalizePhoneLast9(order.phoneNumber);

    let matchedIdx = parsedEntries.findIndex(
      (pe, idx) =>
        !claimedEntryIndices.has(idx) &&
        pe.normPhone === phoneNorm &&
        pe.allocationGb !== undefined &&
        Math.abs(pe.allocationGb - order.gbAmount) <= 0.1
    );
    if (matchedIdx === -1) {
      matchedIdx = parsedEntries.findIndex(
        (pe, idx) => !claimedEntryIndices.has(idx) && pe.normPhone === phoneNorm
      );
    }

    if (matchedIdx !== -1) {
      claimedEntryIndices.add(matchedIdx);
      const matched = parsedEntries[matchedIdx];
      const entryRawStatus = matched.status;
      const entryId = matched.id;

      let nextStatus: "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED" | "CANCELLED" = order.status as any;
      if (entryRawStatus) {
        const mapped = mapClickyfiedStatus(entryRawStatus);
        // Only allow status upgrades to terminal states if the raw status explicitly says so.
        // Never map to SUCCESS from an empty/ambiguous status.
        if (["SUCCESS", "FAILED", "CANCELLED"].includes(mapped)) {
          nextStatus = mapped as any;
        } else if (mapped === "PROCESSING") {
          // Keep the order in PROCESSING — it's confirmed in-flight on the provider.
          nextStatus = "PROCESSING";
        }
        // If mapped === "PENDING", keep existing status — don't downgrade a PROCESSING order back to PENDING
        // just because Clickyfied reports it as "queued"; that's expected for recently dispatched batches.
      }

      const nextProviderRef =
        entryId !== undefined && entryId !== null
          ? `CLICKYFIED:${canonicalId}:${entryId}`
          : `CLICKYFIED:${canonicalId}`;

      const statusChanged = order.status !== nextStatus;
      const refChanged = order.providerReference !== nextProviderRef;

      if (statusChanged || refChanged) {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: nextStatus,
            providerReference: nextProviderRef,
            failureReason: nextStatus === "FAILED" ? `Reported by provider: ${entryRawStatus}` : null,
          },
        });

        if (statusChanged) {
          await prisma.orderStatusHistory.create({
            data: {
              orderId: order.id,
              status: nextStatus,
              previousStatus: order.status,
              note: `Status synchronized from Clickyfied (${entryRawStatus || nextStatus}) for batch #${batch.batchCode}`,
              changedBy: actorLabel,
            },
          });
          updatedOrdersCount++;
        }
      }
    } else {
      // Order was NOT in Clickyfied entries
      // Check if order was blocked / filtered out by Clickyfied
      const matchedFiltered = parsedFilteredOut.find(
        (fo) => fo.normPhone === phoneNorm
      );
      if (matchedFiltered) {
        const failReason = `Blocked by provider: ${matchedFiltered.reason || "Number blocked"}`;
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: "FAILED",
            providerReference: `CLICKYFIED:${canonicalId}:BLOCKED`,
            failureReason: failReason,
          },
        });
        await prisma.orderStatusHistory.create({
          data: {
            orderId: order.id,
            status: "FAILED",
            previousStatus: order.status,
            note: `Excluded from Clickyfied batch #${batch.batchCode}: ${failReason}`,
            changedBy: actorLabel,
          },
        });
        updatedOrdersCount++;
      } else if (order.status === "PROCESSING" || order.status === "PENDING") {
        // Order never existed on Clickyfied in this batch!
        // Revert it back to PENDING so it unblocks the queue and can be dispatched cleanly!
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: "PENDING",
            providerReference: null,
            externalReference: null,
            clickyfiedBatchId: null,
            failureReason: `Not found on Clickyfied in batch #${batch.batchCode} (${canonicalId}). Restored to pending queue.`,
          },
        });

        await prisma.orderStatusHistory.create({
          data: {
            orderId: order.id,
            status: "PENDING",
            previousStatus: order.status,
            note: `Restored to pending queue: Recipient was never received by Clickyfied in batch #${batch.batchCode} (${canonicalId}).`,
            changedBy: actorLabel,
          },
        });
        updatedOrdersCount++;
      }
    }
  }

  // Recalculate batch statistics based on orders ACTUALLY in the batch
  const currentOrders = await prisma.order.findMany({
    where: { clickyfiedBatchId: batch.id, status: { not: "PENDING" } },
    select: { status: true, gbAmount: true, amount: true },
  });

  const totalOrders = currentOrders.length;
  const totalGb = currentOrders.reduce((sum, o) => sum + o.gbAmount, 0);
  const totalAmount = currentOrders.reduce((sum, o) => sum + (o.amount || 0), 0);
  const processedCount = currentOrders.filter((o) => o.status === "SUCCESS").length;
  const failedCount = currentOrders.filter((o) => o.status === "FAILED" || o.status === "CANCELLED").length;
  const pendingCount = currentOrders.filter((o) => o.status === "PROCESSING").length;

  let overallBatchStatus = "PROCESSING";
  if (totalOrders === 0) {
    overallBatchStatus = "FAILED";
  } else if (pendingCount === 0) {
    if (failedCount === 0) overallBatchStatus = "COMPLETED";
    else if (processedCount === 0) overallBatchStatus = "FAILED";
    else overallBatchStatus = "PARTIALLY_COMPLETED";
  }

  const updatedBatch = await prisma.clickyfiedBatch.update({
    where: { id: batch.id },
    data: {
      clickyfiedOrderId: canonicalId,
      status: overallBatchStatus,
      totalOrders,
      totalGb,
      totalAmount,
      processedCount,
      failedCount,
      pendingCount,
      rawFilteredOut: rawFiltered.length > 0 ? JSON.stringify(rawFiltered) : batch.rawFilteredOut,
      rawResponse: JSON.stringify(details.raw),
      lastSyncedAt: new Date(),
    },
  });

  // Recompute parent batch statuses if orders changed
  if (updatedOrdersCount > 0) {
    const parentBatchIds = Array.from(
      new Set(batch.orders.map((o) => o.batchId).filter(Boolean) as string[])
    );
    const { recomputeBatchStatus } = await import("../orders");
    for (const bId of parentBatchIds) {
      try {
        await recomputeBatchStatus(bId);
      } catch {}
    }
  }

  await recordAudit({
    actorLabel,
    action: "provider.clickyfied_batch_synced",
    target: `clickyfied:batch:${batch.batchCode}`,
    newValue: JSON.stringify({
      batchCode: batch.batchCode,
      updatedOrdersCount,
      processedCount,
      failedCount,
      pendingCount,
      status: overallBatchStatus,
    }),
  });

  return {
    success: true,
    batch: updatedBatch,
    updatedCount: updatedOrdersCount,
    message: `Batch #${batch.batchCode} synced successfully (${updatedOrdersCount} orders updated).`,
  };
}

/**
 * Resets failed orders in a batch back to PENDING so they can be re-dispatched safely.
 */
export async function retryClickyfiedBatchFailedOrders(
  idOrBatchCode: string,
  actorLabel = "Staff Retry"
): Promise<{
  success: boolean;
  retriedCount: number;
  message: string;
}> {
  const config = await getProviderRoutingConfig();
  if (!config.enabled) {
    throw new Error("Automated API order processing is currently turned OFF. Cannot re-queue orders while API processing is disabled.");
  }
  if (!config.clickyfied.enabled) {
    throw new Error("Clickyfied provider integration is currently disabled in provider settings.");
  }

  const batch = await prisma.clickyfiedBatch.findFirst({
    where: {
      OR: [{ id: idOrBatchCode }, { batchCode: idOrBatchCode }],
    },
    include: {
      orders: {
        where: { status: "FAILED" },
      },
    },
  });

  if (!batch) {
    throw new Error(`Clickyfied batch not found: ${idOrBatchCode}`);
  }

  const failedOrders = batch.orders;
  if (failedOrders.length === 0) {
    return {
      success: true,
      retriedCount: 0,
      message: `No failed orders found in batch #${batch.batchCode} to retry.`,
    };
  }

  const failedIds = failedOrders.map((o) => o.id);

  // Reset failed orders to PENDING and detach from current batch
  await prisma.order.updateMany({
    where: { id: { in: failedIds } },
    data: {
      status: "PENDING",
      providerReference: null,
      externalReference: null,
      failureReason: null,
      clickyfiedBatchId: null,
    },
  });

  await prisma.orderStatusHistory.createMany({
    data: failedIds.map((id) => ({
      orderId: id,
      status: "PENDING",
      previousStatus: "FAILED",
      note: `Retried failed order from Clickyfied batch #${batch.batchCode} by ${actorLabel}. Returned to pending queue.`,
      changedBy: actorLabel,
    })),
  });

  // Recompute batch counts
  const remainingOrders = await prisma.order.findMany({
    where: { clickyfiedBatchId: batch.id },
    select: { status: true, gbAmount: true, amount: true },
  });

  const totalOrders = remainingOrders.length;
  const totalGb = remainingOrders.reduce((sum, o) => sum + o.gbAmount, 0);
  const totalAmount = remainingOrders.reduce((sum, o) => sum + o.amount, 0);
  const processedCount = remainingOrders.filter((o) => o.status === "SUCCESS").length;
  const failedCount = remainingOrders.filter((o) => o.status === "FAILED").length;
  const pendingCount = remainingOrders.filter((o) => o.status === "PROCESSING" || o.status === "PENDING").length;

  let newBatchStatus = "PROCESSING";
  if (totalOrders === 0) {
    newBatchStatus = "FAILED";
  } else if (pendingCount === 0) {
    if (failedCount === 0) newBatchStatus = "COMPLETED";
    else if (processedCount === 0) newBatchStatus = "FAILED";
    else newBatchStatus = "PARTIALLY_COMPLETED";
  }

  await prisma.clickyfiedBatch.update({
    where: { id: batch.id },
    data: {
      totalOrders,
      totalGb,
      totalAmount,
      processedCount,
      failedCount,
      pendingCount,
      status: newBatchStatus,
      updatedAt: new Date(),
    },
  });

  await recordAudit({
    actorLabel,
    action: "provider.clickyfied_batch_retried",
    target: `clickyfied:batch:${batch.batchCode}`,
    newValue: JSON.stringify({
      batchCode: batch.batchCode,
      retriedCount: failedIds.length,
    }),
  });

  return {
    success: true,
    retriedCount: failedIds.length,
    message: `Successfully reset ${failedIds.length} failed order(s) back to the pending queue for re-dispatch.`,
  };
}

/**
 * Reconciles any MTN orders currently marked as FAILED in our database against Clickyfied.
 * If Clickyfied accepted, processed, or delivered them (e.g. when provider halted and resumed),
 * this automatically recovers them to SUCCESS or PROCESSING and restores any wrongly blocked numbers.
 */
export async function reconcileFailedClickyfiedOrders(
  actorLabel = "Staff Failed Reconciliation",
  options: { lookbackHours?: number } = {}
): Promise<{
  success: boolean;
  reconciledCount: number;
  totalChecked: number;
  reconciledOrders: Array<{ id: number; phoneNumber: string; newStatus: string; reason: string }>;
  message: string;
}> {
  const lookbackHours = options.lookbackHours ?? 72; // default 3 days
  const cutoff = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);

  // Find all failed MTN orders from the lookback period
  const failedOrders = await prisma.order.findMany({
    where: {
      network: "MTN",
      status: "FAILED",
      createdAt: { gte: cutoff },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      phoneNumber: true,
      gbAmount: true,
      status: true,
      providerReference: true,
      externalReference: true,
      failureReason: true,
      clickyfiedBatchId: true,
      batchId: true,
      createdAt: true,
    },
  });

  if (failedOrders.length === 0) {
    return {
      success: true,
      reconciledCount: 0,
      totalChecked: 0,
      reconciledOrders: [],
      message: "No failed MTN orders found in the specified window to reconcile.",
    };
  }

  const config = await getProviderRoutingConfig();
  const client = new ClickyfiedClient(config.clickyfied);
  const reconciledOrders: Array<{ id: number; phoneNumber: string; newStatus: string; reason: string }> = [];

  // Group failed orders by batch reference if available
  const batchQueryKeys = new Set<string>();
  for (const o of failedOrders) {
    if (o.externalReference && o.externalReference.startsWith("CF-BATCH-")) {
      batchQueryKeys.add(o.externalReference);
    }
    if (o.providerReference && o.providerReference.startsWith("CLICKYFIED:")) {
      const parts = o.providerReference.replace("CLICKYFIED:", "").split(":");
      const pId = parts[0];
      if (pId && pId !== "BLOCKED") {
        batchQueryKeys.add(pId);
      }
    }
  }

  // Pre-fetch Clickyfied batch statuses for all involved batches
  const batchEntriesMap = new Map<string, { canonicalId: string; entries: any[] }>();
  for (const queryKey of batchQueryKeys) {
    try {
      let canonical = queryKey;
      if (queryKey.startsWith("CF-BATCH-")) {
        canonical = await client.resolveCanonicalOrderId(queryKey);
      }
      const details = await client.getOrderStatus(canonical);
      const rawAny = details.raw as any;
      const entries: any[] = rawAny?.order?.entries || rawAny?.entries || [];
      const canonicalId = String(rawAny?.order?.orderId || rawAny?.orderId || canonical);
      batchEntriesMap.set(queryKey, { canonicalId, entries });
      if (canonical !== queryKey) {
        batchEntriesMap.set(canonical, { canonicalId, entries });
      }
    } catch {
      // batch query failed or not on provider
    }
  }

  const affectedBatchIds = new Set<string>();
  const affectedClickyfiedBatchIds = new Set<string>();

  for (const ord of failedOrders) {
    const phoneNorm = normalizePhoneLast9(ord.phoneNumber);
    let matchedEntry: any = null;
    let matchedCanonicalId: string | null = null;

    // 1. Try matching from pre-fetched batch data
    const batchKey = ord.externalReference?.startsWith("CF-BATCH-")
      ? ord.externalReference
      : ord.providerReference?.replace("CLICKYFIED:", "").split(":")[0];

    if (batchKey && batchEntriesMap.has(batchKey)) {
      const { canonicalId, entries } = batchEntriesMap.get(batchKey)!;
      matchedCanonicalId = canonicalId;
      // Find matching entry by phone & GB
      matchedEntry = entries.find((e: any) => {
        const eNorm = normalizePhoneLast9(String(e.number || e.phoneNumber || e.phone || ""));
        const eAlloc = typeof e.allocationGB === "number" ? e.allocationGB : e.allocationGb;
        if (eNorm !== phoneNorm) return false;
        if (eAlloc !== undefined && Math.abs(eAlloc - ord.gbAmount) > 0.1) return false;
        return true;
      });
      if (!matchedEntry) {
        matchedEntry = entries.find((e: any) => {
          const eNorm = normalizePhoneLast9(String(e.number || e.phoneNumber || e.phone || ""));
          return eNorm === phoneNorm;
        });
      }
    }

    // 2. If not found in batch, search recent orders on Clickyfied
    if (!matchedEntry) {
      try {
        const found = await client.findOrderByPhone(ord.phoneNumber);
        if (found && found.orderId) {
          matchedCanonicalId = found.orderId;
          matchedEntry = {
            id: found.orderEntryId,
            status: found.status,
            allocationGB: found.allocationGb,
          };
        }
      } catch {}
    }

    // If an entry exists on Clickyfied for this order:
    if (matchedEntry) {
      // IMPORTANT: Do NOT default to "success" if status is missing — the entry may still be queued.
      // Defaulting to "pending" maps safely to PROCESSING (in-flight), never to SUCCESS.
      const rawEntryStatus = matchedEntry.status || matchedEntry.currentStatus || matchedEntry.deliveryStatus || "pending";
      const mapped = mapClickyfiedStatus(rawEntryStatus);

      // If Clickyfied fulfilled it or has it in-flight:
      if (mapped === "SUCCESS" || mapped === "PROCESSING") {
        const eId = matchedEntry.id ?? matchedEntry.orderEntryId ?? matchedEntry.entryId;
        const newProviderRef = eId && matchedCanonicalId
          ? `CLICKYFIED:${matchedCanonicalId}:${eId}`
          : matchedCanonicalId
          ? `CLICKYFIED:${matchedCanonicalId}`
          : ord.providerReference;

        await prisma.order.update({
          where: { id: ord.id },
          data: {
            status: mapped,
            providerReference: newProviderRef,
            failureReason: null,
          },
        });

        await prisma.orderStatusHistory.create({
          data: {
            orderId: ord.id,
            status: mapped,
            previousStatus: "FAILED",
            note: `Reconciled from Clickyfied: Confirmed on provider as ${String(rawEntryStatus).toUpperCase()} (${newProviderRef}). Restored from previous halt/error.`,
            changedBy: actorLabel,
          },
        });

        // Unblock number from blockedMtnNumber if it was erroneously marked as REJECTED
        try {
          const canonical = normalizeGhanaPhoneNumber(ord.phoneNumber);
          await prisma.blockedMtnNumber.deleteMany({
            where: { normalizedNumber: canonical, status: "REJECTED" },
          });
        } catch {}

        reconciledOrders.push({
          id: ord.id,
          phoneNumber: ord.phoneNumber,
          newStatus: mapped,
          reason: `Found on Clickyfied (${rawEntryStatus})`,
        });

        if (ord.batchId) affectedBatchIds.add(ord.batchId);
        if (ord.clickyfiedBatchId) affectedClickyfiedBatchIds.add(ord.clickyfiedBatchId);
      }
    }
  }

  // Recompute affected batches
  if (affectedBatchIds.size > 0) {
    const { recomputeBatchStatus } = await import("../orders");
    for (const bId of affectedBatchIds) {
      try {
        await recomputeBatchStatus(bId);
      } catch {}
    }
  }

  for (const cfBatchId of affectedClickyfiedBatchIds) {
    try {
      const orders = await prisma.order.findMany({
        where: { clickyfiedBatchId: cfBatchId },
        select: { status: true, gbAmount: true, amount: true },
      });
      const processedCount = orders.filter((o) => o.status === "SUCCESS").length;
      const failedCount = orders.filter((o) => o.status === "FAILED").length;
      const pendingCount = orders.filter((o) => o.status === "PROCESSING" || o.status === "PENDING").length;

      let st = "PROCESSING";
      if (pendingCount === 0) {
        if (failedCount === 0) st = "COMPLETED";
        else if (processedCount === 0) st = "FAILED";
        else st = "PARTIALLY_COMPLETED";
      }

      await prisma.clickyfiedBatch.update({
        where: { id: cfBatchId },
        data: {
          processedCount,
          failedCount,
          pendingCount,
          status: st,
          lastSyncedAt: new Date(),
        },
      });
    } catch {}
  }

  await recordAudit({
    actorLabel,
    action: "provider.clickyfied_failed_orders_reconciled",
    target: "clickyfied:orders:failed",
    newValue: JSON.stringify({
      totalChecked: failedOrders.length,
      reconciledCount: reconciledOrders.length,
      reconciledOrderIds: reconciledOrders.map((o) => o.id),
    }),
  });

  return {
    success: true,
    reconciledCount: reconciledOrders.length,
    totalChecked: failedOrders.length,
    reconciledOrders,
    message: `Reconciled ${reconciledOrders.length} order(s) out of ${failedOrders.length} checked from Clickyfied.`,
  };
}

/**
 * Force re-dispatches an existing batch directly to Clickyfied.
 * Used when a batch was never received by Clickyfied, failed with 4xx, or was stranded in processing.
 */
export async function resendClickyfiedBatch(
  idOrBatchCode: string,
  actorLabel = "Staff Force Re-dispatch"
): Promise<{
  success: boolean;
  batchCode: string;
  batchOrderId?: string;
  dispatchedCount: number;
  totalGb: number;
  error?: string;
  message?: string;
}> {
  const batch = await prisma.clickyfiedBatch.findFirst({
    where: {
      OR: [{ id: idOrBatchCode }, { batchCode: idOrBatchCode }],
    },
    include: {
      orders: true,
    },
  });

  if (!batch) {
    throw new Error(`Clickyfied batch not found: ${idOrBatchCode}`);
  }

  let targetOrders = batch.orders;
  if (targetOrders.length === 0 && batch.batchCode) {
    targetOrders = await prisma.order.findMany({
      where: { externalReference: batch.batchCode },
    });
  }

  // Filter to orders that are not already SUCCESS
  const eligibleOrders = targetOrders.filter((o) => o.status !== "SUCCESS");
  if (eligibleOrders.length === 0) {
    return {
      success: true,
      batchCode: batch.batchCode,
      dispatchedCount: 0,
      totalGb: 0,
      message: `All orders in batch #${batch.batchCode} are already successfully fulfilled.`,
    };
  }

  const config = await getProviderRoutingConfig();
  if (!config.enabled) {
    throw new Error("Automated API order processing is currently turned OFF in system settings.");
  }
  if (!config.clickyfied.enabled) {
    throw new Error("Clickyfied provider is currently disabled in provider settings.");
  }
  const client = new ClickyfiedClient(config.clickyfied);

  // Check if Clickyfied actually already received this under a canonical order ID
  try {
    const canonical = await client.resolveCanonicalOrderId(batch.batchCode);
    if (canonical && canonical !== batch.batchCode && canonical.startsWith("order-")) {
      await syncClickyfiedBatchStatus(batch.id, actorLabel);
      return {
        success: true,
        batchCode: batch.batchCode,
        batchOrderId: canonical,
        dispatchedCount: eligibleOrders.length,
        totalGb: eligibleOrders.reduce((s, o) => s + o.gbAmount, 0),
        message: `Batch #${batch.batchCode} was already confirmed on Clickyfied as ${canonical}. Synced status!`,
      };
    }
  } catch {}

  // Re-arm eligible orders to PENDING and clear previous claim tokens so submitSingleBatchChunk can claim them
  const eligibleIds = eligibleOrders.map((o) => o.id);
  await prisma.order.updateMany({
    where: { id: { in: eligibleIds } },
    data: {
      status: "PENDING",
      providerReference: null,
      externalReference: null,
    },
  });

  const settingBaseUrl = await prisma.systemSetting.findUnique({ where: { key: "app_base_url" } });
  const appBaseUrl = settingBaseUrl?.value
    ? settingBaseUrl.value.replace(/\/+$/, "")
    : process.env.NEXTAUTH_URL || process.env.APP_URL || "https://tsk05.net";

  const isPublicUrl = appBaseUrl.startsWith("https://") && !appBaseUrl.includes("localhost");
  const signingSecret = (config.clickyfied.callbackSigningSecret || process.env.CLICKYFIED_CALLBACK_SECRET || "").trim();
  const callbackUrl = isPublicUrl
    ? `${appBaseUrl}/api/webhooks/providers/clickyfied`
    : undefined;

  const groupLabel = (batch.groupLabel as any) || (Math.max(...eligibleOrders.map((o) => o.gbAmount)) <= 5 ? "Group 1 (1–5 GB)" : "Group 2 (6+ GB)");

  const res = await submitSingleBatchChunk(
    eligibleOrders,
    groupLabel,
    actorLabel,
    client,
    callbackUrl,
    signingSecret
  );

  return res;
}

/**
 * Detects and recovers stranded Clickyfied batches and orders:
 * 1. Batches marked as PROCESSING that have no canonical provider order ID (e.g. clickyfiedOrderId is null or same as batchCode)
 *    and were never acknowledged by Clickyfied.
 * 2. Orders stuck in PROCESSING with CLICKYFIED_CLAIMED tokens without a confirmed provider order.
 * 
 * Verifies against Clickyfied:
 * - If found on Clickyfied, links canonical ID and syncs status.
 * - If NOT on Clickyfied, marks the batch as FAILED and returns the orders to PENDING queue so they can be dispatched.
 */
export async function reconcileStrandedClickyfiedBatches(
  actorLabel = "Staff Reconcile Stranded"
): Promise<{
  success: boolean;
  strandedBatchesCount: number;
  unstrandedOrdersCount: number;
  confirmedOrdersCount: number;
  message: string;
}> {
  const config = await getProviderRoutingConfig();
  const client = new ClickyfiedClient(config.clickyfied);

  // 1. All active batches that are in PROCESSING or have unconfirmed/pending orders
  const activeBatches = await prisma.clickyfiedBatch.findMany({
    where: {
      OR: [
        { status: "PROCESSING" },
        { pendingCount: { gt: 0 } },
      ],
    },
    include: {
      orders: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  let unstrandedOrdersCount = 0;
  let confirmedOrdersCount = 0;

  for (const b of activeBatches) {
    let confirmedOrderId = b.clickyfiedOrderId;
    if (!confirmedOrderId || confirmedOrderId.startsWith("CF-BATCH-")) {
      try {
        const canonical = await client.resolveCanonicalOrderId(b.batchCode);
        if (canonical && canonical !== b.batchCode && canonical.startsWith("order-")) {
          confirmedOrderId = canonical;
        }
      } catch {}
    }

    if (confirmedOrderId && confirmedOrderId.startsWith("order-")) {
      try {
        const initialPending = b.orders.filter((o) => o.status === "PROCESSING" || o.status === "PENDING").length;
        await syncClickyfiedBatchStatus(b.id, actorLabel);
        
        // Count how many orders in this batch were restored back to PENDING (unlinked from this batch)
        const currentOrdersAfterSync = await prisma.order.findMany({
          where: { id: { in: b.orders.map((o) => o.id) } },
          select: { id: true, status: true },
        });
        const newlyPending = currentOrdersAfterSync.filter((o) => o.status === "PENDING").length;
        const newlySuccess = currentOrdersAfterSync.filter((o) => o.status === "SUCCESS").length;

        unstrandedOrdersCount += newlyPending;
        confirmedOrdersCount += newlySuccess;
      } catch (syncErr: any) {
        // If Clickyfied returns 404 or cannot find this order:
        const msg = (syncErr?.message || "").toLowerCase();
        if (msg.includes("404") || msg.includes("not found")) {
          const orderIds = b.orders.filter((o) => o.status !== "SUCCESS").map((o) => o.id);
          if (orderIds.length > 0) {
            await prisma.order.updateMany({
              where: { id: { in: orderIds } },
              data: {
                status: "PENDING",
                providerReference: `CLICKYFIED_MANUAL_HOLD:${b.batchCode}`,
                externalReference: b.batchCode,
                clickyfiedBatchId: null,
                failureReason: `Batch #${b.batchCode} not found on Clickyfied: restored to PENDING for manual fulfillment only.`,
              },
            });
            await prisma.orderStatusHistory.createMany({
              data: orderIds.map((id) => ({
                orderId: id,
                status: "PENDING",
                previousStatus: "PROCESSING",
                note: `Batch #${b.batchCode} not found on provider. Restored to PENDING for manual fulfillment only (auto-retries held).`,
                changedBy: actorLabel,
              })),
            });
            unstrandedOrdersCount += orderIds.length;
          }
          await prisma.clickyfiedBatch.update({
            where: { id: b.id },
            data: {
              status: "FAILED",
              errorMessage: `Order not found on Clickyfied (${syncErr.message})`,
              pendingCount: 0,
              lastSyncedAt: new Date(),
            },
          });
        }
      }
    } else {
      // No confirmed order ID exists on Clickyfied
      const orderIds = b.orders.filter((o) => o.status !== "SUCCESS").map((o) => o.id);
      if (orderIds.length > 0) {
        await prisma.order.updateMany({
          where: { id: { in: orderIds } },
          data: {
            status: "PENDING",
            providerReference: null,
            externalReference: null,
            clickyfiedBatchId: null,
            failureReason: `Reconciled from unconfirmed batch #${b.batchCode}: restored to pending queue.`,
          },
        });

        await prisma.orderStatusHistory.createMany({
          data: orderIds.map((id) => ({
            orderId: id,
            status: "PENDING",
            previousStatus: "PROCESSING",
            note: `Restored to pending queue by ${actorLabel}. Batch #${b.batchCode} was not received by provider.`,
            changedBy: actorLabel,
          })),
        });

        unstrandedOrdersCount += orderIds.length;
      }

      await prisma.clickyfiedBatch.update({
        where: { id: b.id },
        data: {
          status: "FAILED",
          errorMessage: "Batch was never received or confirmed by Clickyfied. Orders restored to pending queue.",
          failedCount: b.totalOrders,
          pendingCount: 0,
          lastSyncedAt: new Date(),
        },
      });
    }
  }

  // 2. Standalone orders stuck in PROCESSING with claim tokens or orphaned references
  const strandedOrders = await prisma.order.findMany({
    where: {
      status: "PROCESSING",
      network: { equals: "MTN", mode: "insensitive" },
      exportBatchId: null,
      OR: [
        { providerReference: null },
        { providerReference: { startsWith: "CLICKYFIED_CLAIMED:" } },
        { providerReference: { startsWith: "CLICKYFIED:CF-BATCH-" } },
        { providerReference: "CLICKYFIED:BLOCKED" },
        { clickyfiedBatch: { status: { in: ["FAILED", "COMPLETED", "PARTIALLY_COMPLETED"] } } },
      ],
    },
  });

  const standAloneIdsToReset: number[] = [];
  for (const ord of strandedOrders) {
    if (ord.externalReference && ord.externalReference.startsWith("CF-BATCH-")) {
      const alreadyHandled = activeBatches.some((b) => b.batchCode === ord.externalReference);
      if (alreadyHandled) continue;
    }
    standAloneIdsToReset.push(ord.id);
  }

  if (standAloneIdsToReset.length > 0) {
    await prisma.order.updateMany({
      where: { id: { in: standAloneIdsToReset } },
      data: {
        status: "PENDING",
        providerReference: null,
        externalReference: null,
        clickyfiedBatchId: null,
        failureReason: "Restored to pending queue: unconfirmed provider claim",
      },
    });

    await prisma.orderStatusHistory.createMany({
      data: standAloneIdsToReset.map((id) => ({
        orderId: id,
        status: "PENDING",
        previousStatus: "PROCESSING",
        note: `Restored from stranded processing state by ${actorLabel}.`,
        changedBy: actorLabel,
      })),
    });

    unstrandedOrdersCount += standAloneIdsToReset.length;
  }

  await recordAudit({
    actorLabel,
    action: "provider.clickyfied_stranded_batches_reconciled",
    target: "clickyfied:batches:stranded",
    newValue: JSON.stringify({
      scannedBatchesCount: activeBatches.length,
      unstrandedOrdersCount,
      confirmedOrdersCount,
    }),
  });

  return {
    success: true,
    strandedBatchesCount: activeBatches.length,
    unstrandedOrdersCount,
    confirmedOrdersCount,
    message: `Reconciliation complete: checked ${activeBatches.length} active batch(es). Restored ${unstrandedOrdersCount} stranded order(s) back to pending queue; confirmed ${confirmedOrdersCount} delivered order(s).`,
  };
}




