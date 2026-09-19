import { prisma } from "../prisma";
import {
  getProviderRoutingConfig,
  getProviderForNetwork,
  mapClickyfiedStatus,
  normalizePhoneLast9,
} from "./router";
import { ClickyfiedClient, generateClickyfiedReference } from "./clickyfied";
import { recordAudit } from "../audit";

export interface ClickyfiedBatchConfig {
  enabled: boolean;
  gbThreshold: number;
  timerMinutes: number;
  lastDispatchedAt: Date | null;
}

export interface PendingMtnBatchStats {
  pendingCount: number;
  totalGb: number;
  gbThreshold: number;
  timerMinutes: number;
  lastDispatchedAt: string | null;
  minutesElapsed: number;
  minutesRemaining: number;
  batchEnabled: boolean;
  clickyfiedEnabled: boolean;
  currentBatchCount: number;
  currentBatchGb: number;
  nextBatchCount: number;
  nextBatchGb: number;
  thresholdMet: boolean;
  timerExpired: boolean;
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
 * Ensures across PM2 cluster workers or multi-instance containers that only ONE worker dispatches at a time.
 */
async function acquireBatchDispatchLock(leaseSeconds = 60): Promise<boolean> {
  const lockKey = "clickyfied_batch_dispatch_lock";
  const now = Date.now();

  try {
    const existing = await prisma.systemSetting.findUnique({ where: { key: lockKey } });
    if (existing && existing.value) {
      const lockTime = parseInt(existing.value, 10);
      if (!isNaN(lockTime) && now - lockTime < leaseSeconds * 1000) {
        return false;
      }
    }

    await prisma.systemSetting.upsert({
      where: { key: lockKey },
      create: { key: lockKey, value: String(now) },
      update: { value: String(now) },
    });
    return true;
  } catch {
    return false;
  }
}

async function releaseBatchDispatchLock(): Promise<void> {
  const lockKey = "clickyfied_batch_dispatch_lock";
  try {
    await prisma.systemSetting.delete({ where: { key: lockKey } }).catch(() => {});
  } catch {}
}

/**
 * Partitions orders sequentially into batches respecting both the GB threshold window (100–120 GB)
 * and Clickyfied's maximum 100 entries per order submission.
 * 
 * Orders accumulate until reaching targetGb (e.g. 100 GB). If adding an order brings the total between
 * targetGb and maxChunkGb (e.g. 100–120 GB), it is included in the current batch. If adding it would
 * exceed maxChunkGb (120 GB) or exceed 100 entries, the current batch is sealed and the order rolls over
 * into the next batch.
 */
export function partitionIntoBatches<T extends { gbAmount: number }>(
  orders: T[],
  limitGb = 100,
  maxEntries = 100,
  maxChunkGb = 120
): Array<{ orders: T[]; totalGb: number }> {
  const batches: Array<{ orders: T[]; totalGb: number }> = [];
  let currentBatch: T[] = [];
  let currentGb = 0;

  const targetLimit = Math.max(1, limitGb);
  const upperCap = Math.max(targetLimit, maxChunkGb);

  for (const order of orders) {
    const reachedTarget = currentGb >= targetLimit;
    const reachedMaxEntries = currentBatch.length >= maxEntries;
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

  return {
    enabled,
    gbThreshold,
    timerMinutes,
    lastDispatchedAt,
  };
}

/**
 * Fetches all pending MTN orders that are routed to Clickyfied
 */
export async function getPendingMtnClickyfiedOrders() {
  const pendingOrders = await prisma.order.findMany({
    where: {
      status: "PENDING",
      network: "MTN",
      providerReference: null,
      exportBatchId: null,
    },
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

  // Filter to only orders that resolve to CLICKYFIED provider
  const eligibleOrders: typeof pendingOrders = [];
  for (const order of pendingOrders) {
    const provider = await getProviderForNetwork(order.network);
    if (provider === "CLICKYFIED") {
      eligibleOrders.push(order);
    }
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
  const { orders, count, totalGb } = await getPendingMtnClickyfiedOrders();

  const now = Date.now();
  let baseTime = batchConfig.lastDispatchedAt ? batchConfig.lastDispatchedAt.getTime() : 0;

  // If never dispatched before, base on the oldest pending order
  if (!baseTime && orders.length > 0) {
    baseTime = new Date(orders[0].createdAt).getTime();
  }

  const minutesElapsed = baseTime ? Math.max(0, Math.floor((now - baseTime) / 60000)) : 0;
  const minutesRemaining = Math.max(0, batchConfig.timerMinutes - minutesElapsed);

  // Partition queue to understand current batch vs roll-over next batch
  const upperCap = Math.max(batchConfig.gbThreshold, batchConfig.gbThreshold + 20);
  const batches = partitionIntoBatches(orders, batchConfig.gbThreshold, 100, upperCap);
  const currentBatch = batches[0] ?? { orders: [], totalGb: 0 };
  const currentBatchGb = currentBatch.totalGb;
  const currentBatchCount = currentBatch.orders.length;
  const nextBatchCount = count - currentBatchCount;
  const nextBatchGb = Math.max(0, totalGb - currentBatchGb);

  const thresholdMet = currentBatchGb >= batchConfig.gbThreshold || totalGb >= batchConfig.gbThreshold || currentBatchCount >= 100;
  const timerExpired = minutesRemaining === 0 && count > 0;

  return {
    pendingCount: count,
    totalGb,
    gbThreshold: batchConfig.gbThreshold,
    timerMinutes: batchConfig.timerMinutes,
    lastDispatchedAt: batchConfig.lastDispatchedAt ? batchConfig.lastDispatchedAt.toISOString() : null,
    minutesElapsed,
    minutesRemaining,
    batchEnabled: batchConfig.enabled,
    clickyfiedEnabled: config.clickyfied.enabled,
    currentBatchCount,
    currentBatchGb,
    nextBatchCount,
    nextBatchGb,
    thresholdMet,
    timerExpired,
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

/**
 * Dispatches eligible pending MTN orders in batches strictly respecting the configured GB limit
 * per batch (and max 100 entries per submission) to Clickyfied.
 * 
 * Crucially: Each dispatch cycle dispatches ONE batch (up to the 100–120 GB limit window).
 * Any remaining orders stay in PENDING to accumulate until they reach the limit, the timer expires,
 * or admin triggers dispatch again. That subsequent dispatch is sent as the next sequential batch!
 * 
 * USER EXPERIENCE INTEGRITY:
 * User-created OrderBatches (from Send Order web view) are NEVER split into multiple batches!
 * All orders retain their original batchId so the user sees one single batch with recipient-level
 * statuses reflecting which orders are processing vs pending.
 */
export async function dispatchClickyfiedMtnBatch(
  actorLabel = "Clickyfied Batch Trigger",
  options: { onlyFullBatches?: boolean } = {}
): Promise<{
  success: boolean;
  dispatchedCount: number;
  totalGb: number;
  batchIds: string[];
  batchCode?: string;
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
  const lockAcquired = await acquireBatchDispatchLock(60);
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
  let claimedOrderIds: number[] = [];
  let claimToken: string | null = null;

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
    const { orders, count } = await getPendingMtnClickyfiedOrders();
    if (count === 0) {
      return {
        success: true,
        dispatchedCount: 0,
        totalGb: 0,
        batchIds: [],
        message: "No pending MTN orders to dispatch.",
      };
    }

    // Partition orders strictly by the configured GB limit window (100–120 GB) and 100 entries max
    const upperCap = Math.max(batchConfig.gbThreshold, batchConfig.gbThreshold + 20);
    const partitioned = partitionIntoBatches(orders, batchConfig.gbThreshold, 100, upperCap);
    const targetBatch = partitioned[0];

    if (!targetBatch || targetBatch.orders.length === 0) {
      return {
        success: true,
        dispatchedCount: 0,
        totalGb: 0,
        batchIds: [],
        message: "No pending MTN orders to dispatch.",
      };
    }

    // If options.onlyFullBatches is set (e.g. volume threshold trigger), only dispatch
    // if targetBatch has reached the threshold limit (or max 100 entries)!
    if (options.onlyFullBatches && targetBatch.totalGb < batchConfig.gbThreshold && targetBatch.orders.length < 100) {
      return {
        success: true,
        dispatchedCount: 0,
        totalGb: 0,
        batchIds: [],
        message: `Current batch (${targetBatch.totalGb} GB, ${targetBatch.orders.length} entries) has not reached the ${batchConfig.gbThreshold} GB limit yet. Orders remain queued to accumulate.`,
      };
    }

    const client = new ClickyfiedClient(config.clickyfied);

    const settingBaseUrl = await prisma.systemSetting.findUnique({ where: { key: "app_base_url" } });
    const appBaseUrl = settingBaseUrl?.value
      ? settingBaseUrl.value.replace(/\/+$/, "")
      : process.env.NEXTAUTH_URL || process.env.APP_URL || "https://tsk05.net";

    const isPublicUrl = appBaseUrl.startsWith("https://") && !appBaseUrl.includes("localhost");
    const signingSecret = config.clickyfied.callbackSigningSecret?.trim();
    const callbackUrl = isPublicUrl && signingSecret
      ? `${appBaseUrl}/api/webhooks/providers/clickyfied`
      : undefined;

    // Generate a fresh, sequential batch code for this Clickyfied dispatch
    const batchCode = await getNextClickyfiedBatchCode();

    // -------------------------------------------------------------------------
    // ATOMIC ORDER CLAIMING: Lock these exact orders in DB before calling external API.
    // If another worker or request already claimed any of these, updateMany will
    // claim fewer than targetBatch.orders.length, allowing us to abort immediately!
    // -------------------------------------------------------------------------
    const targetOrderIds = targetBatch.orders.map((o) => o.id);
    claimToken = `CLICKYFIED_CLAIMED:${batchCode}`;
    claimedOrderIds = targetOrderIds;

    const claimResult = await prisma.order.updateMany({
      where: {
        id: { in: targetOrderIds },
        status: "PENDING",
        providerReference: null,
      },
      data: {
        providerReference: claimToken,
        externalReference: batchCode,
      },
    });

    if (claimResult.count !== targetOrderIds.length) {
      console.warn(`[ClickyfiedBatch] Claim mismatch: expected ${targetOrderIds.length}, claimed ${claimResult.count}. Aborting to avoid duplicate dispatch.`);
      if (claimResult.count > 0) {
        await prisma.order.updateMany({
          where: {
            id: { in: targetOrderIds },
            providerReference: claimToken,
          },
          data: {
            providerReference: null,
            externalReference: null,
          },
        }).catch(() => {});
      }
      return {
        success: false,
        dispatchedCount: 0,
        totalGb: 0,
        batchIds: [],
        error: "Target orders were already claimed by another dispatch cycle.",
      };
    }

    const entries = targetBatch.orders.map((o) => {
      let num = o.phoneNumber.trim();
      if (num.startsWith("+233")) num = "0" + num.slice(4);
      else if (num.startsWith("233")) num = "0" + num.slice(3);
      if (num.length === 9 && !num.startsWith("0")) num = "0" + num;
      return { number: num, allocationGB: o.gbAmount };
    });

    try {
      const submitRes = await client.submitOrder({
        externalReference: batchCode,
        entries,
        callbackUrl,
        callbackSigningSecret: signingSecret || undefined,
        idempotencyKey: batchCode,
      });

      let batchOrderId = String(submitRes.orderId || "");
      if (!batchOrderId || !batchOrderId.startsWith("order-")) {
        try {
          batchOrderId = await client.resolveCanonicalOrderId(batchCode);
        } catch {}
      }
      if (!batchOrderId) {
        batchOrderId = batchCode;
      }
      const providerRef = `CLICKYFIED:${batchOrderId}`;

      // Extract Clickyfied's reported status (so our order status strictly matches Clickyfied)
      const rawAny = submitRes.raw as any;
      const summary = rawAny?.order?.entrySummary || rawAny?.entrySummary;
      const rawStatus = rawAny?.order?.status || submitRes.status || rawAny?.status || "pending";
      const processedAt = rawAny?.order?.processedAt || rawAny?.processedAt;
      const overallStatus = mapClickyfiedStatus(rawStatus, summary, processedAt);

      // Check if Clickyfied provided individual entry statuses and entry IDs
      let returnedEntries: Array<{ id?: string | number; orderEntryId?: string | number; entryId?: string | number; number?: string; status?: string }> =
        rawAny?.order?.entries || rawAny?.entries || submitRes.entries || [];

      const entryStatusMap = new Map<string, string>();
      const entryIdMap = new Map<string, string | number>();

      for (const re of returnedEntries) {
        if (re.number) {
          const norm = normalizePhoneLast9(re.number);
          if (re.status) entryStatusMap.set(norm, re.status);
          const eId = re.orderEntryId ?? re.entryId ?? re.id ?? (re as any)._id;
          if (eId !== undefined && eId !== null) entryIdMap.set(norm, eId);
        }
      }

      // If entry IDs were not included in the immediate submit response, query the order details once to get them
      if (entryIdMap.size === 0 && batchOrderId && batchOrderId.startsWith("order-")) {
        try {
          const ordDetails = await client.getOrderStatus(batchOrderId);
          const rawD = ordDetails.raw as any;
          const freshEntries: any[] = rawD?.order?.entries || rawD?.entries || [];
          for (const fe of freshEntries) {
            if (fe.number) {
              const norm = normalizePhoneLast9(fe.number);
              if (fe.status) entryStatusMap.set(norm, fe.status);
              const eId = fe.orderEntryId ?? fe.entryId ?? fe.id ?? fe._id;
              if (eId !== undefined && eId !== null) entryIdMap.set(norm, eId);
            }
          }
        } catch {
          // Continue if immediate fetch is not available; poller and report route will also resolve
        }
      }

      for (const order of targetBatch.orders) {
        const phoneNorm = normalizePhoneLast9(order.phoneNumber);
        const entryRawStatus = entryStatusMap.get(phoneNorm);
        const entryId = entryIdMap.get(phoneNorm);
        const targetStatus = entryRawStatus
          ? mapClickyfiedStatus(entryRawStatus)
          : overallStatus;

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
            failureReason: targetStatus === "FAILED" ? `Failed on Clickyfied: ${rawStatus}` : null,
          },
        });

        await prisma.orderStatusHistory.create({
          data: {
            orderId: order.id,
            status: targetStatus,
            previousStatus: "PENDING",
            note: `Submitted in Clickyfied MTN Batch #${batchCode} (${targetBatch.orders.length} entries, ${targetBatch.totalGb} GB). Provider Order #${batchOrderId}${entryId ? ` (Entry #${entryId})` : ""}. Status: ${entryRawStatus || rawStatus || targetStatus}`,
            changedBy: actorLabel,
          },
        });
      }

      // -----------------------------------------------------------------------
      // USER-VIEW INTEGRITY:
      // Orders retain their original batchId (pointing to the user's OrderBatch).
      // We NEVER split or move user orders out of their batch!
      // We recompute the batch status so it transitions to PROCESSING, while
      // any remaining orders stay in PENDING in the exact same batch.
      // -----------------------------------------------------------------------
      const parentBatchIds = Array.from(
        new Set(targetBatch.orders.map((o) => o.batchId).filter(Boolean) as string[])
      );

      const { recomputeBatchStatus } = await import("../orders");
      for (const bId of parentBatchIds) {
        try {
          await recomputeBatchStatus(bId);
        } catch (err) {
          console.error(`Error recomputing batch status for ${bId}:`, err);
        }
      }

      // Reset the last dispatched timestamp so timer starts fresh for the remaining queue
      await prisma.systemSetting.upsert({
        where: { key: "clickyfied_batch_last_dispatched_at" },
        create: { key: "clickyfied_batch_last_dispatched_at", value: new Date().toISOString() },
        update: { value: new Date().toISOString() },
      });

      const remainingOrdersCount = count - targetBatch.orders.length;
      const remainingOrdersGb = Math.max(0, orders.reduce((sum, o) => sum + o.gbAmount, 0) - targetBatch.totalGb);

      await recordAudit({
        actorLabel,
        action: "provider.clickyfied_mtn_batch_dispatched",
        target: `clickyfied:batch:mtn`,
        newValue: JSON.stringify({
          batchCode,
          batchOrderId,
          dispatchedCount: targetBatch.orders.length,
          totalGb: targetBatch.totalGb,
          remainingOrdersCount,
          remainingOrdersGb,
        }),
      });

      return {
        success: true,
        dispatchedCount: targetBatch.orders.length,
        totalGb: targetBatch.totalGb,
        batchIds: [batchOrderId],
        batchCode,
        message: `Dispatched ${batchCode} with ${targetBatch.orders.length} MTN order(s) (${targetBatch.totalGb} GB) to Clickyfied. ${remainingOrdersCount > 0 ? `${remainingOrdersCount} order(s) (${remainingOrdersGb} GB) remain in PENDING queue to accumulate for next batch.` : "Queue is now empty."}`,
      };
    } catch (batchErr: any) {
      console.error(`[ClickyfiedBatch] Dispatch of ${batchCode} failed:`, batchErr);
      if (claimedOrderIds.length > 0 && claimToken) {
        await prisma.order.updateMany({
          where: {
            id: { in: claimedOrderIds },
            providerReference: claimToken,
          },
          data: {
            providerReference: null,
            externalReference: null,
          },
        }).catch(() => {});
      }
      await prisma.orderStatusHistory.createMany({
        data: targetBatch.orders.map((o) => ({
          orderId: o.id,
          status: "PENDING",
          note: `Clickyfied Batch attempt (${batchCode}) failed: ${batchErr?.message || "Network error"}`,
          changedBy: actorLabel,
        })),
      });

      return {
        success: false,
        dispatchedCount: 0,
        totalGb: 0,
        batchIds: [],
        error: batchErr?.message || "Batch submission failed",
      };
    }
  } finally {
    isDispatchingBatch = false;
    await releaseBatchDispatchLock();
  }
}

/**
 * Checks triggers (volume threshold or timer expiration) and executes batch dispatch if warranted.
 * 
 * - THRESHOLD: Dispatches batches that have accumulated >= 100 GB (or 100 entries).
 *   If a massive order arrives (e.g. 250 GB), it dispatches Chunk 1 (~100 GB), Chunk 2 (~100 GB),
 *   leaving the remainder (< 100 GB) in queue to accumulate or wait for timer.
 * 
 * - TIMER: When timer expires (hits 0), dispatches all remaining queued orders regardless
 *   of whether they reached 100 GB.
 */
export async function checkAndTriggerMtnBatch(
  trigger: "THRESHOLD" | "TIMER"
): Promise<{ triggered: boolean; reason?: string }> {
  try {
    const config = await getProviderRoutingConfig();
    if (!config.enabled || !config.clickyfied.enabled) return { triggered: false };

    const batchConfig = await getClickyfiedBatchConfig();
    if (!batchConfig.enabled) return { triggered: false };

    const status = await getClickyfiedBatchStatus();
    if (status.pendingCount === 0) return { triggered: false };

    // 1. Volume threshold trigger: loop and dispatch all chunks that have reached threshold
    if (trigger === "THRESHOLD" || status.currentBatchGb >= batchConfig.gbThreshold || status.currentBatchCount >= 100) {
      let dispatchTotalGb = 0;
      let dispatchCount = 0;
      let iterations = 0;

      while (iterations < 10) {
        iterations++;
        const currentStatus = await getClickyfiedBatchStatus();
        if (currentStatus.pendingCount === 0) break;

        // If the current batch to dispatch is below threshold (< 100 GB) and < 100 entries, stop and leave to accumulate
        if (currentStatus.currentBatchGb < batchConfig.gbThreshold && currentStatus.currentBatchCount < 100) {
          break;
        }

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

    // 2. Timer expiration trigger: timer hit 0, dispatch all remaining queued orders
    if (trigger === "TIMER" && status.minutesElapsed >= batchConfig.timerMinutes && status.pendingCount > 0) {
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

