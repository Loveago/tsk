import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import {
  buildBatchWhere,
  getBatchAggregates,
  statsFromCounts,
  batchProgress,
} from "@/lib/batches";
import { handleRouteError } from "@/lib/api-helpers";

/** The signed-in user's order batches (§2), newest first. */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 10)));

    const where = buildBatchWhere({
      network: searchParams.get("network"),
      status: searchParams.get("status"),
      userId: user.id,
      q: searchParams.get("q"),
      from: searchParams.get("from"),
      to: searchParams.get("to"),
    });

    // Consolidate & split any batches where orders were dispatched across Clickyfied batches
    try {
      const { splitMultiDispatchBatches } = await import("@/lib/provider-apis/router");
      await splitMultiDispatchBatches();
    } catch {}

    const [data, total] = await Promise.all([
      prisma.orderBatch.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.orderBatch.count({ where }),
    ]);

    // On-demand sync for in-flight Clickyfied orders belonging to these batches
    const inFlightBatchIds = data
      .filter((b) => b.status === "PROCESSING" || b.status === "PENDING")
      .map((b) => b.id);

    if (inFlightBatchIds.length > 0) {
      try {
        const thirtyTwoSecsAgo = new Date(Date.now() - 32 * 1000);
        const inFlightOrders = await prisma.order.findMany({
          where: {
            batchId: { in: inFlightBatchIds },
            status: { in: ["PENDING", "PROCESSING"] },
            providerReference: { startsWith: "CLICKYFIED:" },
            updatedAt: { lte: thirtyTwoSecsAgo },
          },
          take: 15,
          select: { id: true, status: true, providerReference: true, updatedAt: true },
        });

        if (inFlightOrders.length > 0) {
          const { syncClickyfiedOrder } = await import("@/lib/provider-apis/router");
          await Promise.allSettled(
            inFlightOrders.map((o) => syncClickyfiedOrder(o, "User Batches View Sync"))
          );
          // Refresh batch status if any orders transitioned
          const refreshedBatches = await prisma.orderBatch.findMany({
            where: { id: { in: inFlightBatchIds } },
          });
          const freshMap = new Map(refreshedBatches.map((b) => [b.id, b]));
          for (let i = 0; i < data.length; i++) {
            const fresh = freshMap.get(data[i].id);
            if (fresh) data[i] = fresh;
          }
        }
      } catch (syncErr) {
        console.error("Batches view sync error:", syncErr);
      }
    }

    const aggregates = await getBatchAggregates(data.map((b) => b.id));
    const rows = data.map((b) => {
      const stats = statsFromCounts(aggregates.get(b.id)?.counts);
      const isCompleted = b.status === "COMPLETED" || (stats.total > 0 && stats.completed === stats.total);
      return {
        ...b,
        stats,
        progress: batchProgress(stats),
        completedAt: isCompleted ? b.updatedAt.toISOString() : null,
      };
    });

    return NextResponse.json({
      data: rows,
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}