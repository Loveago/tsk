import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncClickyfiedOrder } from "@/lib/provider-apis/router";

export async function GET(request: NextRequest) {
  try {
    // Look for in-flight Clickyfied orders (both PENDING and PROCESSING) updated more than 15s ago
    const fifteenSecsAgo = new Date(Date.now() - 15 * 1000);
    const inFlightOrders = await prisma.order.findMany({
      where: {
        status: { in: ["PENDING", "PROCESSING"] },
        providerReference: { startsWith: "CLICKYFIED:" },
        updatedAt: { lte: fifteenSecsAgo },
      },
      take: 30,
      orderBy: { updatedAt: "asc" },
    });

    let updated = 0;
    let checked = 0;
    const errors: string[] = [];

    for (const order of inFlightOrders) {
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
