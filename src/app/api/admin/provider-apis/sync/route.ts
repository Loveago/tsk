import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { changeOrderStatus } from "@/lib/orders";
import { ClickyfiedClient } from "@/lib/provider-apis/clickyfied";
import { getProviderRoutingConfig } from "@/lib/provider-apis/router";
import { handleRouteError } from "@/lib/api-helpers";

export async function POST(request: NextRequest) {
  try {
    const actor = await requireStaff();
    const config = await getProviderRoutingConfig();
    const client = new ClickyfiedClient(config.clickyfied);

    const inFlightOrders = await prisma.order.findMany({
      where: {
        status: "PROCESSING",
        providerReference: { startsWith: "CLICKYFIED:" },
      },
      take: 50,
      orderBy: { updatedAt: "asc" },
    });

    let updated = 0;
    let checked = 0;
    const results: Array<{ orderId: number; status: string; changed: boolean }> = [];

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

        let changed = false;
        if (targetStatus && targetStatus !== order.status) {
          await changeOrderStatus(
            order.id,
            targetStatus,
            `Manual sync triggered by ${actor.email}: ${st}`,
            { id: actor.id, label: actor.email },
            { force: true }
          );
          updated++;
          changed = true;
        }

        results.push({ orderId: order.id, status: targetStatus || st, changed });
      } catch (err: any) {
        results.push({ orderId: order.id, status: `Error: ${err?.message}`, changed: false });
      }
    }

    return NextResponse.json({
      success: true,
      checked,
      updated,
      results,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
