import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncClickyfiedOrder } from "@/lib/provider-apis/router";

export async function GET(request: NextRequest) {
  try {
    // Check if automated poller is enabled in system settings
    const pollerSetting = await prisma.systemSetting.findUnique({
      where: { key: "provider_sync_poller_enabled" },
    });
    if (pollerSetting && pollerSetting.value === "false") {
      return NextResponse.json({
        success: true,
        message: "Background status poller is currently paused in settings",
        checked: 0,
        updated: 0,
      });
    }

    // Strict 120-second threshold for orders ready to poll
    const twoMinutesAgo = new Date(Date.now() - 120 * 1000);
    const inFlightOrders = await prisma.order.findMany({
      where: {
        status: { in: ["PENDING", "PROCESSING"] },
        providerReference: { startsWith: "CLICKYFIED:" },
        updatedAt: { lte: twoMinutesAgo },
      },
      take: 20,
      orderBy: { updatedAt: "asc" },
    });

    // If there is nothing to poll, do not make any provider calls
    if (inFlightOrders.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Nothing to poll (no in-flight orders ready for sync)",
        checked: 0,
        updated: 0,
      });
    }

    let updated = 0;
    let checked = 0;
    const errors: string[] = [];
    const seenProviderIds = new Set<string>();

    for (const order of inFlightOrders) {
      const rawRef = order.providerReference?.replace("CLICKYFIED:", "").trim();
      const [providerId] = (rawRef || "").split(":");
      if (providerId) {
        if (seenProviderIds.has(providerId)) continue;
        seenProviderIds.add(providerId);
      }
      checked++;
      const res = await syncClickyfiedOrder(order, "Provider Sync Cron");
      if (res.changed) {
        updated++;
      } else if (res.error) {
        errors.push(`Order #${order.id}: ${res.error}`);
      }
    }

    return NextResponse.json({
      success: true,
      checked,
      updated,
      errors: errors.slice(0, 5),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Sync execution error" }, { status: 500 });
  }
}
