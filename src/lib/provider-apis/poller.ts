import { prisma } from "../prisma";
import { syncClickyfiedOrder, syncClickyfiedDeliveryReport, syncGhconnectOrder } from "./router";

let isPolling = false;

export async function getPollerIntervalSeconds(): Promise<number> {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: "provider_sync_poller_interval_seconds" },
    });
    if (setting && setting.value) {
      const val = parseInt(setting.value, 10);
      if (!isNaN(val) && val >= 10) return val;
    }
  } catch {}

  const envVal = process.env.PROVIDER_SYNC_POLLER_INTERVAL_SECONDS;
  if (envVal) {
    const val = parseInt(envVal, 10);
    if (!isNaN(val) && val >= 10) return val;
  }

  return 30; // Default: 30 seconds
}

/**
 * Self-scheduling background poller for in-flight Clickyfied and GHConnect orders and open delivery reports.
 * Automatically synchronizes pending/processing orders and reports (default every 30 seconds, configurable).
 * If there is nothing to poll, it completely skips any provider communication.
 */
export function startProviderSyncPoller() {
  if (typeof window !== "undefined") return;

  // In PM2 cluster mode, only instance 0 should run background polling loops
  const instanceId = process.env.pm_id ?? process.env.NODE_APP_INSTANCE;
  if (instanceId !== undefined && instanceId !== "" && instanceId !== "0") {
    console.log(`[ProviderSyncPoller] Skipping poller initialization on PM2 cluster worker #${instanceId}`);
    return;
  }

  const g = globalThis as any;
  if (g.__providerSyncPollerStarted) {
    return;
  }
  g.__providerSyncPollerStarted = true;

  console.log("[ProviderSyncPoller] Automated background status poller initialized (30s default interval).");

  const poll = async () => {
    if (isPolling) return;
    isPolling = true;
    try {
      // 1. Check if automated poller and API routing are enabled
      const setting = await prisma.systemSetting.findUnique({
        where: { key: "provider_sync_poller_enabled" },
      });
      if (setting && setting.value === "false") {
        return;
      }

      const { getProviderRoutingConfig } = await import("./router");
      const config = await getProviderRoutingConfig();
      if (!config.enabled || (!config.clickyfied.enabled && !config.ghconnect?.enabled)) {
        return;
      }

      // 2. Configurable rate limit window (default 30 seconds)
      const intervalSeconds = await getPollerIntervalSeconds();
      const cutoffTime = new Date(Date.now() - intervalSeconds * 1000);

      // Find in-flight Clickyfied orders (PENDING or PROCESSING)
      if (config.clickyfied.enabled) {
        const inFlightOrders = await prisma.order.findMany({
          where: {
            status: { in: ["PENDING", "PROCESSING"] },
            OR: [
              { providerReference: { startsWith: "CLICKYFIED" } },
              { externalReference: { startsWith: "CF-BATCH-" } },
            ],
            updatedAt: { lte: cutoffTime },
          },
          take: 200,
          orderBy: { updatedAt: "asc" },
        });

        // Find active open delivery reports on Clickify orders (only truly unresolved Clickyfied reports)
        const openReports = await prisma.deliveryReport.findMany({
          where: {
            status: { in: ["OPEN", "INVESTIGATING", "UNDER_REVIEW"] },
            order: {
              OR: [
                { providerReference: { startsWith: "CLICKYFIED" } },
                { externalReference: { startsWith: "CF-BATCH-" } },
              ],
            },
            updatedAt: { lte: cutoffTime },
          },
          take: 20,
          orderBy: { updatedAt: "asc" },
        });

        // Deduplicate by provider reference or batch code so we don't query the same batch multiple times
        const seenProviderIds = new Set<string>();
        if (inFlightOrders.length > 0) {
          console.log(`[ProviderSyncPoller] Syncing ${inFlightOrders.length} in-flight Clickyfied order(s)...`);
        }
        for (const order of inFlightOrders) {
          try {
            const rawRef = order.providerReference?.replace(/^CLICKYFIED(_CLAIMED)?:/, "").trim();
            const [providerId] = (rawRef || "").split(":");
            const queryKey = providerId || order.externalReference;
            if (queryKey) {
              if (seenProviderIds.has(queryKey)) {
                continue;
              }
              seenProviderIds.add(queryKey);
            }
            await syncClickyfiedOrder(order, "Automatic Background Poller");
          } catch (err: any) {
            console.error(`[ProviderSyncPoller] Error syncing order #${order.id} (ref=${order.providerReference}):`, err?.message || err);
          }
        }

        for (const rep of openReports) {
          try {
            await syncClickyfiedDeliveryReport(rep.id, "Automatic Background Poller");
          } catch {
            // continue
          }
        }

        // Check Clickyfied MTN Batch timer window trigger
        try {
          const { checkAndTriggerMtnBatch } = await import("./clickyfied-batch");
          await checkAndTriggerMtnBatch("TIMER");
        } catch (batchErr) {
          // Ignore background transient errors
        }
      }

      // Find in-flight GHConnect orders (PENDING or PROCESSING)
      if (config.ghconnect?.enabled && config.ghconnect?.apiKey) {
        try {
          const inFlightGhcOrders = await prisma.order.findMany({
            where: {
              status: { in: ["PENDING", "PROCESSING"] },
              providerReference: { startsWith: "GHC:" },
              updatedAt: { lte: cutoffTime },
            },
            take: 50,
            orderBy: { updatedAt: "asc" },
          });

          for (const ghcOrder of inFlightGhcOrders) {
            try {
              await syncGhconnectOrder(ghcOrder, "Automatic Background Poller");
            } catch {
              // ignore per-order error and continue
            }
          }
        } catch {
          // ignore transient GHConnect errors
        }
      }

      // Auto-reconcile any pending Paystack wallet top-ups
      try {
        const { reconcilePendingPaystackTopups } = await import("@/lib/paystack");
        await reconcilePendingPaystackTopups(10);
      } catch {
        // Ignore background transient errors
      }
    } catch {
      // Ignore background transient errors
    } finally {
      isPolling = false;
    }
  };

  // Self-scheduling loop respecting the dynamic interval
  const scheduleNext = async (delayMs?: number) => {
    try {
      const intervalSec = await getPollerIntervalSeconds();
      const delay = delayMs ?? intervalSec * 1000;
      setTimeout(async () => {
        try {
          await poll();
        } finally {
          scheduleNext();
        }
      }, delay);
    } catch {
      setTimeout(() => scheduleNext(), 30000);
    }
  };

  // Initial poll runs after 5s, then dynamically repeats every intervalSeconds
  scheduleNext(5000);
}
