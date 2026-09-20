import { prisma } from "../prisma";
import { syncClickyfiedOrder, syncClickyfiedDeliveryReport } from "./router";

let isPolling = false;

/**
 * Self-scheduling background poller for in-flight Clickyfied orders and open delivery reports.
 * Automatically synchronizes pending/processing orders and reports with Clickify every 120 seconds (2 minutes).
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

  console.log("[ProviderSyncPoller] Automated background status poller initialized (120s interval).");

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
      if (!config.enabled || !config.clickyfied.enabled) {
        return;
      }

      // 2. Strict 120s rate limit: only check orders last updated >= 120 seconds ago
      const twoMinutesAgo = new Date(Date.now() - 120 * 1000);

      // Find in-flight Clickyfied orders (PENDING or PROCESSING)
      const inFlightOrders = await prisma.order.findMany({
        where: {
          status: { in: ["PENDING", "PROCESSING"] },
          providerReference: { startsWith: "CLICKYFIED:" },
          updatedAt: { lte: twoMinutesAgo },
        },
        take: 20,
        orderBy: { updatedAt: "asc" },
      });

      // Find active open delivery reports on Clickify orders (only truly unresolved Clickyfied reports)
      const openReports = await prisma.deliveryReport.findMany({
        where: {
          status: { in: ["OPEN", "INVESTIGATING", "UNDER_REVIEW"] },
          order: {
            OR: [
              { providerReference: { startsWith: "CLICKYFIED:" } },
              { externalReference: { startsWith: "CF-BATCH-" } },
            ],
          },
          updatedAt: { lte: twoMinutesAgo },
        },
        take: 10,
        orderBy: { updatedAt: "asc" },
      });

      // CRITICAL: If there is nothing in-flight and no open reports, do NOT poll anything!
      if (inFlightOrders.length === 0 && openReports.length === 0) {
        return;
      }

      // Deduplicate by provider reference so we don't query the same Clickyfied batch multiple times
      const seenProviderIds = new Set<string>();
      for (const order of inFlightOrders) {
        try {
          const rawRef = order.providerReference?.replace("CLICKYFIED:", "").trim();
          const [providerId] = (rawRef || "").split(":");
          if (providerId) {
            if (seenProviderIds.has(providerId)) {
              continue;
            }
            seenProviderIds.add(providerId);
          }
          await syncClickyfiedOrder(order, "Automatic Background Poller");
        } catch {
          // continue
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

  // Run initial poll after 30 seconds, then recurring every 120 seconds (2 minutes)
  setTimeout(poll, 30000);
  setInterval(poll, 120000);
}
