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
  const batches = partitionIntoBatches(orders, batchConfig.gbThreshold, 100, upperCap);
  const currentBatch = batches[0] ?? { orders: [], totalGb: 0 };
  const currentBatchGb = currentBatch.totalGb;
  const currentBatchCount = currentBatch.orders.length;
  const nextBatchCount = count - currentBatchCount;
  const nextBatchGb = Math.max(0, totalGb - currentBatchGb);

  const group1Orders = orders.filter((o) => o.gbAmount <= 5);
  const group1Count = group1Orders.length;
  const group1Gb = group1Orders.reduce((sum, o) => sum + o.gbAmount, 0);

  const group2Orders = orders.filter((o) => o.gbAmount >= 6);
  const group2Count = group2Orders.length;
  const group2Gb = group2Orders.reduce((sum, o) => sum + o.gbAmount, 0);

  const thresholdMet =
    currentBatchGb >= batchConfig.gbThreshold ||
    totalGb >= batchConfig.gbThreshold ||
    currentBatchCount >= 100 ||
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
  const batchCode = await getNextClickyfiedBatchCode();
  const targetOrderIds = targetOrders.map((o) => o.id);
  const totalGb = targetOrders.reduce((sum, o) => sum + o.gbAmount, 0);
  const claimToken = `CLICKYFIED_CLAIMED:${batchCode}`;

  // Atomic DB claiming to prevent race conditions across PM2 workers
  const claimResult = await prisma.order.updateMany({
    where: {
      id: { in: targetOrderIds },
      status: "PENDING",
      OR: [
        { providerReference: null },
        { providerReference: { startsWith: "CLICKYFIED_CLAIMED" } },
      ],
    },
    data: {
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
      error: `Orders in ${groupLabel} were already claimed by another dispatch cycle.`,
    };
  }

  const entries = targetOrders.map((o) => {
    let num = o.phoneNumber.replace(/\D/g, "");
    if (num.startsWith("233")) num = "0" + num.slice(3);
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
    if (!batchOrderId) {
      try {
        batchOrderId = await client.resolveCanonicalOrderId(batchCode);
      } catch {}
    }
    if (!batchOrderId) {
      batchOrderId = batchCode;
    }
    const providerRef = `CLICKYFIED:${batchOrderId}`;

    // Extract Clickyfied reported status
    const rawAny = submitRes.raw as any;
    const summary = rawAny?.order?.entrySummary || rawAny?.entrySummary;
    const rawStatus = rawAny?.order?.status || submitRes.status || rawAny?.status || "pending";
    const processedAt = rawAny?.order?.processedAt || rawAny?.processedAt;
    const overallStatus = mapClickyfiedStatus(rawStatus, summary, processedAt);

    let returnedEntries: Array<any> =
      rawAny?.order?.entries || rawAny?.entries || submitRes.entries || [];

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

    for (const order of targetOrders) {
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

      const matchedEntry = matchedIdx !== -1 ? parsedEntries[matchedIdx] : null;
      if (matchedIdx !== -1) {
        claimedEntryIndices.add(matchedIdx);
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
    console.error(`[ClickyfiedBatch] Dispatch of ${groupLabel} (${batchCode}) failed:`, batchErr);
    await prisma.order.updateMany({
      where: {
        id: { in: targetOrderIds },
        OR: [
          { providerReference: claimToken },
          { providerReference: null },
          { providerReference: { startsWith: "CLICKYFIED_CLAIMED" } },
        ],
      },
      data: {
        status: "PENDING",
        providerReference: null,
        externalReference: null,
        failureReason: batchErr?.message ? `Dispatch failed: ${String(batchErr.message).slice(0, 200)}` : "Batch dispatch failed",
      },
    }).catch(() => {});

    await prisma.orderStatusHistory.createMany({
      data: targetOrders.map((o) => ({
        orderId: o.id,
        status: "PENDING",
        note: `Batch delivery attempt for ${groupLabel} (${batchCode}) failed: ${batchErr?.message || "Network error"}`,
        changedBy: actorLabel,
      })),
    });

    return {
      success: false,
      batchCode,
      batchOrderId: "",
      dispatchedCount: 0,
      totalGb: 0,
      error: batchErr?.message || "Batch submission failed",
    };
  }
}

/**
 * Dispatches eligible pending MTN orders in batches grouped into two distinct groups:
 * 1. Group 1: 1 GB to 5 GB orders (small bundles)
 * 2. Group 2: 6 GB and above orders (large bundles)
 * 
 * Each group is sent as its own separate batch to Clickyfied with its own sequential batch code.
 * If either group exceeds Clickyfied's single-submission limit of 100 entries, it is automatically
 * chunked into 100-entry sub-batches.
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
    const group2Orders = orders.filter((o) => o.gbAmount >= 6);

    const group1Gb = group1Orders.reduce((sum, o) => sum + o.gbAmount, 0);
    const group2Gb = group2Orders.reduce((sum, o) => sum + o.gbAmount, 0);

    // If options.onlyFullBatches is set (volume threshold trigger):
    // Only dispatch if total queue meets threshold OR either group meets threshold/100 entries
    if (options.onlyFullBatches) {
      const thresholdMet =
        totalGb >= batchConfig.gbThreshold ||
        count >= 100 ||
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
    const group1Chunks = partitionIntoBatches(group1Orders, batchConfig.gbThreshold, 100, upperCap);
    const group2Chunks = partitionIntoBatches(group2Orders, batchConfig.gbThreshold, 100, upperCap);

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
    let totalDispatchedCount = 0;
    let totalDispatchedGb = 0;

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    // 1. Dispatch Group 1 (1–5 GB) batches
    for (let i = 0; i < group1Chunks.length; i++) {
      const chunk = group1Chunks[i];
      if (chunk.orders.length === 0) continue;
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
      }
    }

    // 2. Dispatch Group 2 (6+ GB) batches
    for (let i = 0; i < group2Chunks.length; i++) {
      const chunk = group2Chunks[i];
      if (chunk.orders.length === 0) continue;
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
    if (trigger === "THRESHOLD" || status.thresholdMet) {
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

    // 2. Timer expiration trigger: timer hit 0, dispatch all remaining queued orders
    if ((trigger === "TIMER" || status.timerExpired) && status.pendingCount > 0) {
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


