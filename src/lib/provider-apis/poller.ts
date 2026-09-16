import { prisma } from "../prisma";
import { syncClickyfiedOrder } from "./router";

let isPolling = false;

/**
 * Self-scheduling background poller for in-flight Clickyfied orders.
 * Automatically synchronizes pending and processing orders with Clickify every 25 seconds.
 */
export function startProviderSyncPoller() {
  if (typeof window !== "undefined") return;

  const g = globalThis as any;
  if (g.__providerSyncPollerStarted) {
    return;
  }
  g.__providerSyncPollerStarted = true;

  console.log("[ProviderSyncPoller] Automated background order status poller initialized.");

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
    } catch {
      // Ignore background transient errors
    } finally {
      isPolling = false;
    }
  };

  // Run initial poll after 5 seconds, then recurring every 25 seconds
  setTimeout(poll, 5000);
  setInterval(poll, 25000);
}
