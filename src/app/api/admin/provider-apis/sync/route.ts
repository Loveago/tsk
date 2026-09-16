import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { syncClickyfiedOrder } from "@/lib/provider-apis/router";
import { handleRouteError } from "@/lib/api-helpers";

export async function POST(request: NextRequest) {
  try {
    const actor = await requireStaff();

    const inFlightOrders = await prisma.order.findMany({
      where: {
        status: { in: ["PENDING", "PROCESSING"] },
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
      const res = await syncClickyfiedOrder(order, `Manual sync by ${actor.email}`, { forceCheck: true });
      if (res.changed) updated++;
      results.push({
        orderId: order.id,
        status: res.newStatus || (res.error ? `Error: ${res.error}` : order.status),
        changed: res.changed,
      });
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
