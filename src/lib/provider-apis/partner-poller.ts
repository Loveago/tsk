import { prisma } from "../prisma";
import { syncBigwindataOrder, syncGhconnectOrder } from "./router";

let isPolling = false;

export async function getPartnerPollerIntervalSeconds(): Promise<number> {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: "partner_poller_interval_seconds" },
    });
    if (setting && setting.value) {
      const val = parseInt(setting.value, 10);
      if (!isNaN(val) && val >= 10) return val;
    }
  } catch {}

  const envVal = process.env.PARTNER_POLLER_INTERVAL_SECONDS;
  if (envVal) {
    const val = parseInt(envVal, 10);
    if (!isNaN(val) && val >= 10) return val;
  }

  return 60; // Default: 60 seconds
}

/**
 * Dedicated background status poller for Bigwindata and GHConnect partner orders
 * (specifically handles Telecel and AT orders).
 * 
 * Runs independently from the Clickyfied poller so Telecel & AT orders are continuously
 * polled and updated even when the Clickyfied poller is turned off.
 */
export function startPartnerOrderPoller() {
  if (typeof window !== "undefined") return;

  // In PM2 cluster mode, only instance 0 should run background polling loops
  const instanceId = process.env.pm_id ?? process.env.NODE_APP_INSTANCE;
  if (instanceId !== undefined && instanceId !== "" && instanceId !== "0") {
    console.log(`[PartnerOrderPoller] Skipping poller initialization on PM2 cluster worker #${instanceId}`);
    return;
  }

  const g = globalThis as any;
  if (g.__partnerOrderPollerStarted) {
    return;
  }
  g.__partnerOrderPollerStarted = true;

  console.log("[PartnerOrderPoller] Automated background status poller for Bigwin & GHConnect initialized (60s default interval).");

  const poll = async () => {
    if (isPolling) return;
    isPolling = true;
    try {
      // 1. Check if partner poller is enabled (defaults to true if unset)
      const setting = await prisma.systemSetting.findUnique({
        where: { key: "partner_poller_enabled" },
      });
      if (setting && setting.value === "false") {
        return;
      }

      const { getProviderRoutingConfig } = await import("./router");
      const config = await getProviderRoutingConfig();
      if (!config.enabled || (!config.bigwindata.enabled && !config.ghconnect?.enabled)) {
        return;
      }

      // Distributed DB lock to guarantee only 1 PM2 worker executes this poll cycle across cluster
      const intervalSeconds = await getPartnerPollerIntervalSeconds();
      const lockKey = "partner_order_poller_distributed_lock";
      const now = Date.now();
      const lockExpiry = Math.max(20, intervalSeconds - 5) * 1000;

      try {
        const existingLock = await prisma.systemSetting.findUnique({ where: { key: lockKey } });
        if (existingLock && existingLock.value) {
          const lockExpiresAt = parseInt(existingLock.value, 10);
          if (!isNaN(lockExpiresAt) && now < lockExpiresAt) {
            // Another cluster worker or instance is actively handling this cycle
            return;
          }
        }
        await prisma.systemSetting.upsert({
          where: { key: lockKey },
          create: { key: lockKey, value: String(now + lockExpiry) },
          update: { value: String(now + lockExpiry) },
        });
      } catch {
        // If DB lock fails transiently, continue cautiously
      }

      // Cutoff time: only check orders that have existed or updated longer than interval
      const cutoffTime = new Date(Date.now() - intervalSeconds * 1000);

      // 2. Poll in-flight Bigwindata orders (Telecel, AT Big Time, etc.)
      if (config.bigwindata.enabled) {
        try {
          const inFlightBigwinOrders = await prisma.order.findMany({
            where: {
              status: { in: ["PENDING", "PROCESSING"] },
              providerReference: { startsWith: "BIGWIN:" },
              updatedAt: { lte: cutoffTime },
            },
            take: 100,
            orderBy: { updatedAt: "asc" },
          });

          if (inFlightBigwinOrders.length > 0) {
            console.log(`[PartnerOrderPoller] Polling ${inFlightBigwinOrders.length} in-flight Bigwindata order(s)...`);
          }

          for (const order of inFlightBigwinOrders) {
            try {
              await syncBigwindataOrder(order, "Automatic Partner Poller");
            } catch (err: any) {
              console.error(`[PartnerOrderPoller] Error syncing Bigwindata order #${order.id}:`, err?.message || err);
            }
          }
        } catch (err: any) {
          console.error("[PartnerOrderPoller] Error fetching in-flight Bigwindata orders:", err?.message || err);
        }
      }

      // 3. Poll in-flight GHConnect orders (AT iShare, etc.)
      if (config.ghconnect?.enabled && config.ghconnect?.apiKey) {
        try {
          const inFlightGhcOrders = await prisma.order.findMany({
            where: {
              status: { in: ["PENDING", "PROCESSING"] },
              providerReference: { startsWith: "GHC:" },
              updatedAt: { lte: cutoffTime },
            },
            take: 100,
            orderBy: { updatedAt: "asc" },
          });

          if (inFlightGhcOrders.length > 0) {
            console.log(`[PartnerOrderPoller] Polling ${inFlightGhcOrders.length} in-flight GHConnect order(s)...`);
          }

          for (const ghcOrder of inFlightGhcOrders) {
            try {
              await syncGhconnectOrder(ghcOrder, "Automatic Partner Poller");
            } catch (err: any) {
              console.error(`[PartnerOrderPoller] Error syncing GHConnect order #${ghcOrder.id}:`, err?.message || err);
            }
          }
        } catch (err: any) {
          console.error("[PartnerOrderPoller] Error fetching in-flight GHConnect orders:", err?.message || err);
        }
      }

      // 4. Auto-reconcile pending Paystack wallet top-ups (ensures wallet top-ups auto-complete even if Clickyfied poller is OFF)
      try {
        const { reconcilePendingPaystackTopups } = await import("@/lib/paystack");
        await reconcilePendingPaystackTopups(10);
      } catch {
        // Ignore background transient errors
      }

      // 5. Auto-reconcile unsettled / undispatched Paystack storefront orders (fallback if webhook/callback dropped)
      try {
        const { reconcileUnsettledStorefrontOrders } = await import("@/lib/storefront");
        await reconcileUnsettledStorefrontOrders(24);
      } catch (err: any) {
        console.error("[PartnerOrderPoller] Error reconciling storefront orders:", err?.message || err);
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
      const intervalSec = await getPartnerPollerIntervalSeconds();
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
