import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { changeOrderStatus } from "@/lib/orders";
import { ClickyfiedClient } from "@/lib/provider-apis/clickyfied";
import { getProviderRoutingConfig } from "@/lib/provider-apis/router";

export async function GET(request: NextRequest) {
  try {
    const config = await getProviderRoutingConfig();
    const client = new ClickyfiedClient(config.clickyfied);

    // Look for in-progress Clickyfied orders updated more than 30s ago (respect 30s rate limit)
    const thirtySecsAgo = new Date(Date.now() - 30 * 1000);
    const inFlightOrders = await prisma.order.findMany({
      where: {
        status: "PROCESSING",
        providerReference: { startsWith: "CLICKYFIED:" },
        updatedAt: { lte: thirtySecsAgo },
      },
      take: 25,
      orderBy: { updatedAt: "asc" },
    });

    let updated = 0;
    let checked = 0;
    const errors: string[] = [];

    for (const order of inFlightOrders) {
      checked++;
      const providerId = order.providerReference?.replace("CLICKYFIED:", "");
      if (!providerId) continue;

      try {
        const res = await client.getOrderStatus(providerId);
        const st = (res.status || "").toUpperCase();

        let targetStatus: string | null = null;
        if (["COMPLETED", "DELIVERED", "SUCCESS"].includes(st)) {
          targetStatus = "SUCCESS";
        } else if (["FAILED", "REJECTED"].includes(st)) {
          targetStatus = "FAILED";
        } else if (["CANCELLED", "CANCELED"].includes(st)) {
          targetStatus = "CANCELLED";
        }

        if (targetStatus && targetStatus !== order.status) {
          await changeOrderStatus(
            order.id,
            targetStatus,
            `Automated sync from Clickyfied: ${st}`,
            { id: "system", label: "Provider Sync Cron" },
            { force: true }
          );
          updated++;
        }
      } catch (err: any) {
        // If 429 rate limit or network error, log and continue
        errors.push(`Order #${order.id}: ${err?.message || "Sync failed"}`);
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
