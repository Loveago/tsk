import { prisma } from "../prisma";
import { getProviderRoutingConfig, getProviderForNetwork } from "./router";
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
 * Dispatches all eligible pending MTN orders in batches of up to 100 entries to Clickyfied.
 */
export async function dispatchClickyfiedMtnBatch(
  actorLabel = "Clickyfied Batch Trigger"
): Promise<{
  success: boolean;
  dispatchedCount: number;
  totalGb: number;
  batchIds: string[];
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

    const client = new ClickyfiedClient(config.clickyfied);

    // Clickyfied supports up to 100 entries per order submission
    const CHUNK_SIZE = 100;
    const chunks: Array<typeof orders> = [];
    for (let i = 0; i < orders.length; i += CHUNK_SIZE) {
      chunks.push(orders.slice(i, i + CHUNK_SIZE));
    }

    const settingBaseUrl = await prisma.systemSetting.findUnique({ where: { key: "app_base_url" } });
    const appBaseUrl = settingBaseUrl?.value
      ? settingBaseUrl.value.replace(/\/+$/, "")
      : process.env.NEXTAUTH_URL || process.env.APP_URL || "https://tsk05.net";

    const isPublicUrl = appBaseUrl.startsWith("https://") && !appBaseUrl.includes("localhost");
    const signingSecret = config.clickyfied.callbackSigningSecret?.trim();
    const callbackUrl = isPublicUrl && signingSecret
      ? `${appBaseUrl}/api/webhooks/providers/clickyfied`
      : undefined;

    let totalDispatched = 0;
    let totalDispatchedGb = 0;
    const batchIds: string[] = [];

    for (let idx = 0; idx < chunks.length; idx++) {
      const chunk = chunks[idx];
      const chunkGb = chunk.reduce((s, o) => s + o.gbAmount, 0);
      const batchRef = generateClickyfiedReference(`batch-${Date.now()}-${idx}`);

      const entries = chunk.map((o) => {
        let num = o.phoneNumber.trim();
        if (num.startsWith("+233")) num = "0" + num.slice(4);
        else if (num.startsWith("233")) num = "0" + num.slice(3);
        return { number: num, allocationGB: o.gbAmount };
      });

      try {
        const submitRes = await client.submitOrder({
          externalReference: batchRef,
          entries,
          callbackUrl,
          callbackSigningSecret: signingSecret || undefined,
          idempotencyKey: batchRef,
        });

        const batchOrderId = String(submitRes.orderId || batchRef);
        batchIds.push(batchOrderId);
        const providerRef = `CLICKYFIED:${batchOrderId}`;

        // Atomically transition all orders in this chunk to PROCESSING
        const orderIds = chunk.map((o) => o.id);
        await prisma.order.updateMany({
          where: { id: { in: orderIds } },
          data: {
            status: "PROCESSING",
            providerReference: providerRef,
            externalReference: batchRef,
            failureReason: null,
          },
        });

        // Add history timeline entry for each order
        await prisma.orderStatusHistory.createMany({
          data: chunk.map((o) => ({
            orderId: o.id,
            status: "PROCESSING",
            previousStatus: "PENDING",
            note: `Dispatched in Clickyfied MTN Batch #${batchOrderId} (${chunk.length} entries, ${chunkGb} GB total)`,
            changedBy: actorLabel,
          })),
        });

        totalDispatched += chunk.length;
        totalDispatchedGb += chunkGb;
      } catch (chunkErr: any) {
        console.error(`[ClickyfiedBatch] Chunk ${idx + 1} dispatch failed:`, chunkErr);
        // Log failure in order history but leave remaining in PENDING for retry
        await prisma.orderStatusHistory.createMany({
          data: chunk.map((o) => ({
            orderId: o.id,
            status: "PENDING",
            note: `Clickyfied Batch attempt failed: ${chunkErr?.message || "Network error"}`,
            changedBy: actorLabel,
          })),
        });
      }
    }

    // Update the last dispatched timestamp in system settings
    await prisma.systemSetting.upsert({
      where: { key: "clickyfied_batch_last_dispatched_at" },
      create: { key: "clickyfied_batch_last_dispatched_at", value: new Date().toISOString() },
      update: { value: new Date().toISOString() },
    });

    await recordAudit({
      actorLabel,
      action: "provider.clickyfied_mtn_batch_dispatched",
      target: `clickyfied:batch:mtn`,
      newValue: JSON.stringify({
        dispatchedCount: totalDispatched,
        totalGb: totalDispatchedGb,
        batchIds,
      }),
    });

    return {
      success: totalDispatched > 0,
      dispatchedCount: totalDispatched,
      totalGb: totalDispatchedGb,
      batchIds,
      message: `Successfully dispatched ${totalDispatched} MTN order(s) (${totalDispatchedGb} GB) to Clickyfied across ${batchIds.length} batch(es).`,
    };
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
      await dispatchClickyfiedMtnBatch(
        `Volume Threshold Reached (${status.totalGb} GB >= ${batchConfig.gbThreshold} GB)`
      );
      return {
        triggered: true,
        reason: `Volume threshold reached (${status.totalGb} GB >= ${batchConfig.gbThreshold} GB)`,
      };
    }

    // 2. Check timer expiration trigger (e.g. >= 15 minutes)
    if (trigger === "TIMER" && status.minutesElapsed >= batchConfig.timerMinutes) {
      await dispatchClickyfiedMtnBatch(
        `Timer Window Expired (${status.minutesElapsed} mins >= ${batchConfig.timerMinutes} mins)`
      );
      return {
        triggered: true,
        reason: `Timer window expired (${status.minutesElapsed} mins >= ${batchConfig.timerMinutes} mins)`,
      };
    }

    return { triggered: false };
  } catch (err: any) {
    console.error("[ClickyfiedBatch] Trigger check error:", err);
    return { triggered: false, reason: err?.message };
  }
}
