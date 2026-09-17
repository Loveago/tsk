import { prisma } from "../prisma";
import { syncClickyfiedOrder, syncClickyfiedDeliveryReport } from "./router";

let isPolling = false;

/**
 * Self-scheduling background poller for in-flight Clickyfied orders and open delivery reports.
 * Automatically synchronizes pending/processing orders and reports with Clickify every 25 seconds.
 */
export function startProviderSyncPoller() {
  if (typeof window !== "undefined") return;

  const g = globalThis as any;
  if (g.__providerSyncPollerStarted) {
    return;
  }
  g.__providerSyncPollerStarted = true;

  console.log("[ProviderSyncPoller] Automated background status poller initialized.");

  const poll = async () => {
    if (isPolling) return;
    isPolling = true;
    try {
      // Check if automated poller is enabled in system settings (default: true)
      const setting = await prisma.systemSetting.findUnique({
        where: { key: "provider_sync_poller_enabled" },
      });
      if (setting && setting.value === "false") {
        return;
      }

      // Auto-remedy: Any Clickyfied orders that were previously marked as PENDING
      // must be corrected to PROCESSING so they are not treated as un-dispatched ghost orders.
      const stuckPending = await prisma.order.findMany({
        where: {
          status: "PENDING",
          providerReference: { startsWith: "CLICKYFIED:" },
        },
        select: { id: true, batchId: true },
        take: 100,
      });

      if (stuckPending.length > 0) {
        await prisma.order.updateMany({
          where: { id: { in: stuckPending.map((o) => o.id) } },
          data: { status: "PROCESSING" },
        });

        const affectedBatchIds = Array.from(
          new Set(stuckPending.map((o) => o.batchId).filter(Boolean) as string[])
        );
        for (const bId of affectedBatchIds) {
          try {
            const { recomputeBatchStatus } = await import("../orders");
            await recomputeBatchStatus(bId);
          } catch {
            // ignore
          }
        }
      }

      // Respect Clickify 30s rate limit (check orders last updated >= 32 seconds ago)
      const thirtyTwoSecsAgo = new Date(Date.now() - 32 * 1000);
      const inFlightOrders = await prisma.order.findMany({
        where: {
          status: { in: ["PENDING", "PROCESSING"] },
          providerReference: { startsWith: "CLICKYFIED:" },
          updatedAt: { lte: thirtyTwoSecsAgo },
        },
        take: 20,
        orderBy: { updatedAt: "asc" },
      });

      for (const order of inFlightOrders) {
        try {
          await syncClickyfiedOrder(order, "Automatic Background Poller");
        } catch {
          // continue
        }
      }

      // Also sync open or unproven delivery reports on Clickify orders
      const fifteenSecsAgo = new Date(Date.now() - 15 * 1000);
      const openReports = await prisma.deliveryReport.findMany({
        where: {
          OR: [
            { status: { in: ["OPEN", "INVESTIGATING", "UNDER_REVIEW"] } },
            { proofImageMime: null, status: { in: ["RESOLVED", "DELIVERED"] } },
          ],
          order: {
            OR: [
              { providerReference: { startsWith: "CLICKYFIED:" } },
              { externalReference: { not: null } },
            ],
          },
          updatedAt: { lte: fifteenSecsAgo },
        },
        take: 15,
        orderBy: { updatedAt: "asc" },
      });

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
    } catch {
      // Ignore background transient errors
    } finally {
      isPolling = false;
    }
  };

  // Run initial poll after 3 seconds, then recurring every 15 seconds
  setTimeout(poll, 3000);
  setInterval(poll, 15000);
}
