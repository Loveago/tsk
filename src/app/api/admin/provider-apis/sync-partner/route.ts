import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { syncBigwindataOrder, syncGhconnectOrder, syncBigwinTelecelOrder } from "@/lib/provider-apis/router";
import { handleRouteError } from "@/lib/api-helpers";

export async function POST(request: NextRequest) {
  try {
    const actor = await requireStaff();

    // Query in-flight Bigwindata, GHConnect, and Bigwin Telecel orders (Telecel, AT orders)
    const inFlightOrders = await prisma.order.findMany({
      where: {
        status: { in: ["PENDING", "PROCESSING"] },
        OR: [
          { providerReference: { startsWith: "BIGWIN:" } },
          { providerReference: { startsWith: "GHC:" } },
          { providerReference: { startsWith: "BWTEL:" } },
        ],
      },
      take: 100,
      orderBy: { updatedAt: "asc" },
    });

    let updated = 0;
    let checked = 0;
    const results: Array<{ orderId: number; provider: string; status: string; changed: boolean }> = [];

    for (const order of inFlightOrders) {
      checked++;
      const ref = order.providerReference || "";
      let res: { changed: boolean; previousStatus?: string; newStatus?: string; error?: string };
      let providerName = "UNKNOWN";

      if (ref.startsWith("BIGWIN:")) {
        providerName = "BIGWINDATA";
        res = await syncBigwindataOrder(order, `Manual sync by ${actor.email}`, { forceCheck: true });
      } else if (ref.startsWith("GHC:")) {
        providerName = "GHCONNECT";
        res = await syncGhconnectOrder(order, `Manual sync by ${actor.email}`, { forceCheck: true });
      } else if (ref.startsWith("BWTEL:")) {
        providerName = "BIGWIN_TELECEL";
        res = await syncBigwinTelecelOrder(order, `Manual sync by ${actor.email}`, { forceCheck: true });
      } else {
        continue;
      }

      if (res.changed) updated++;
      results.push({
        orderId: order.id,
        provider: providerName,
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
