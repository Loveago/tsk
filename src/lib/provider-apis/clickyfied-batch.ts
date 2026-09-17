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

// In-memory mutex to ensure two simultaneous dispatches do not race
let isDispatchingBatch = false;

/**
 * Partitions orders sequentially into batches respecting both the GB threshold limit and
 * Clickyfied's maximum 100 entries per order.
 * 
 * If adding an order would push the batch above limitGb (or above 100 entries), that order
 * and subsequent orders roll over into the next batch.
 */
export function partitionIntoBatches<T extends { gbAmount: number }>(
  orders: T[],
  limitGb: number,
  maxEntries = 100
): Array<{ orders: T[]; totalGb: number }> {
  const batches: Array<{ orders: T[]; totalGb: number }> = [];
  let currentBatch: T[] = [];
  let currentGb = 0;

  for (const order of orders) {
    // If adding this order would exceed the limit (and currentBatch isn't empty)
    // or if batch reached maxEntries (100)
    if (
      currentBatch.length > 0 &&
      (currentBatch.length >= maxEntries || currentGb + order.gbAmount > limitGb)
    ) {
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
  const batches = partitionIntoBatches(orders, batchConfig.gbThreshold, 100);
  const currentBatch = batches[0] ?? { orders: [], totalGb: 0 };
  const currentBatchGb = currentBatch.totalGb;
  const currentBatchCount = currentBatch.orders.length;
  const nextBatchCount = count - currentBatchCount;
  const nextBatchGb = Math.max(0, totalGb - currentBatchGb);

  const thresholdMet = currentBatchGb >= batchConfig.gbThreshold || totalGb >= batchConfig.gbThreshold;
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
 * Crucially: Each dispatch cycle dispatches ONLY ONE batch (up to the configured GB limit).
 * Any remaining orders stay in PENDING to accumulate until they reach the limit, the timer expires,
 * or admin triggers dispatch again. That subsequent dispatch is sent as the next sequential batch!
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
      error: "A batch dispatch operation is already in progress.",
    };
  }

  isDispatchingBatch = true;
  try {
    const config = await getProviderRoutingConfig();
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

    // Partition orders strictly by the configured GB limit and 100 entries max
    const partitioned = partitionIntoBatches(orders, batchConfig.gbThreshold, 100);
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
    // if the current batch has accumulated to the threshold limit!
    if (options.onlyFullBatches && targetBatch.totalGb < batchConfig.gbThreshold) {
      return {
        success: true,
        dispatchedCount: 0,
        totalGb: 0,
        batchIds: [],
        message: `Current batch (${targetBatch.totalGb} GB) has not reached the ${batchConfig.gbThreshold} GB limit yet. Orders remain queued to accumulate.`,
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

    // Generate unique sequential batch reference (e.g. CF-BATCH-000001, CF-BATCH-000002)
    const batchCode = await getNextClickyfiedBatchCode();

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

      const batchOrderId = String(submitRes.orderId || batchCode);
      const providerRef = `CLICKYFIED:${batchOrderId}`;

      // Extract Clickyfied's reported status (so our order status strictly matches Clickyfied)
      const rawAny = submitRes.raw as any;
      const summary = rawAny?.order?.entrySummary || rawAny?.entrySummary;
      const rawStatus = rawAny?.order?.status || submitRes.status || rawAny?.status || "pending";
      const processedAt = rawAny?.order?.processedAt || rawAny?.processedAt;
      const overallStatus = mapClickyfiedStatus(rawStatus, summary, processedAt);

      // Check if Clickyfied provided individual entry statuses
      const returnedEntries: Array<{ number?: string; status?: string }> =
        rawAny?.order?.entries || rawAny?.entries || [];

      const entryStatusMap = new Map<string, string>();
      for (const re of returnedEntries) {
        if (re.number && re.status) {
          entryStatusMap.set(normalizePhoneLast9(re.number), re.status);
        }
      }

      for (const order of targetBatch.orders) {
        const entryRawStatus = entryStatusMap.get(normalizePhoneLast9(order.phoneNumber));
        const targetStatus = entryRawStatus
          ? mapClickyfiedStatus(entryRawStatus)
          : overallStatus;

        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: targetStatus,
            providerReference: providerRef,
            externalReference: batchCode,
            failureReason: targetStatus === "FAILED" ? `Failed on Clickyfied: ${rawStatus}` : null,
          },
        });

        await prisma.orderStatusHistory.create({
          data: {
            orderId: order.id,
            status: targetStatus,
            previousStatus: "PENDING",
            note: `Submitted in Clickyfied MTN Batch #${batchCode} (${targetBatch.orders.length} entries, ${targetBatch.totalGb} GB). Provider Order #${batchOrderId}. Status: ${entryRawStatus || rawStatus || targetStatus}`,
            changedBy: actorLabel,
          },
        });
      }

      // Recompute parent batch status for any user batches containing these orders
      const parentBatchIds = Array.from(
        new Set(targetBatch.orders.map((o) => o.batchId).filter(Boolean) as string[])
      );
      for (const bId of parentBatchIds) {
        try {
          const { recomputeBatchStatus } = await import("../orders");
          await recomputeBatchStatus(bId);
        } catch {
          // ignore
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
  }
}

/**
 * Checks triggers (volume threshold or timer expiration) and executes batch dispatch if warranted.
 */
export async function checkAndTriggerMtnBatch(
  trigger: "THRESHOLD" | "TIMER"
): Promise<{ triggered: boolean; reason?: string }> {
  try {
    const config = await getProviderRoutingConfig();
    if (!config.clickyfied.enabled) return { triggered: false };

    const batchConfig = await getClickyfiedBatchConfig();
    if (!batchConfig.enabled) return { triggered: false };

    const status = await getClickyfiedBatchStatus();
    if (status.pendingCount === 0) return { triggered: false };

    // 1. Check volume threshold trigger (e.g. >= 100 GB)
    if (status.totalGb >= batchConfig.gbThreshold) {
      // Dispatches batches that have accumulated up to the set limit.
      // Any remaining orders (< limit) stay in PENDING for the next batch!
      const res = await dispatchClickyfiedMtnBatch(
        `Volume Threshold Reached (${status.totalGb} GB >= ${batchConfig.gbThreshold} GB)`,
        { onlyFullBatches: true }
      );
      if (res.dispatchedCount > 0) {
        return {
          triggered: true,
          reason: `Volume threshold reached (${res.totalGb} GB dispatched in batch of limit ${batchConfig.gbThreshold} GB)`,
        };
      }
    }

    // 2. Check timer expiration trigger (e.g. >= 15 minutes)
    if (trigger === "TIMER" && status.minutesElapsed >= batchConfig.timerMinutes) {
      // Timer expired: dispatch all accumulated orders respecting the GB limit per batch
      const res = await dispatchClickyfiedMtnBatch(
        `Timer Window Expired (${status.minutesElapsed} mins >= ${batchConfig.timerMinutes} mins)`,
        { onlyFullBatches: false }
      );
      if (res.dispatchedCount > 0) {
        return {
          triggered: true,
          reason: `Timer window expired (${status.minutesElapsed} mins >= ${batchConfig.timerMinutes} mins)`,
        };
      }
    }

    return { triggered: false };
  } catch (err: any) {
    console.error("[ClickyfiedBatch] Trigger check error:", err);
    return { triggered: false, reason: err?.message };
  }
}
