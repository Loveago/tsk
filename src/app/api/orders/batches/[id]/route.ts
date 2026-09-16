import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getBatchAggregates, statsFromCounts, batchProgress } from "@/lib/batches";
import { handleRouteError, apiError } from "@/lib/api-helpers";

/** Batch detail for the owner: recipients + progress + export linkage. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const batch = await prisma.orderBatch.findUnique({ where: { id } });
    if (!batch) return apiError(404, "Batch not found");
    if (batch.userId !== user.id && user.role !== "ADMIN" && user.role !== "MANAGER") {
      return apiError(403, "Not allowed");
    }

    const [orders, aggregates, exports] = await Promise.all([
      prisma.order.findMany({
        where: { batchId: id },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          phoneNumber: true,
          network: true,
          gbAmount: true,
          amount: true,
          status: true,
          failureReason: true,
          completedAt: true,
          exportCount: true,
          lastExportedAt: true,
          createdAt: true,
          providerReference: true,
          updatedAt: true,
          deliveryReports: {
            orderBy: { createdAt: "desc" },
            select: { id: true, seq: true, status: true, proofImageMime: true, createdAt: true },
          },
        },
      }),
      getBatchAggregates([id]),
      prisma.exportBatch.findMany({
        where: { batches: { some: { id } } },
        orderBy: { createdAt: "desc" },
        select: { id: true, exportCode: true, network: true, isReexport: true, createdAt: true },
      }),
    ]);

    // On-demand sync for in-flight Clickyfied orders in this batch
    const inFlight = orders.filter(
      (o) =>
        (o.status === "PENDING" || o.status === "PROCESSING") &&
        o.providerReference?.startsWith("CLICKYFIED:") &&
        Date.now() - new Date(o.updatedAt).getTime() > 30000
    );

    if (inFlight.length > 0) {
      try {
        const { syncClickyfiedOrder } = await import("@/lib/provider-apis/router");
        let anyChanged = false;
        await Promise.allSettled(
          inFlight.map(async (o) => {
            const res = await syncClickyfiedOrder(o, "Batch Detail View Sync");
            if (res.changed && res.newStatus) {
              o.status = res.newStatus;
              anyChanged = true;
            }
          })
        );
        if (anyChanged) {
          const freshAggs = await getBatchAggregates([id]);
          const freshBatch = await prisma.orderBatch.findUnique({ where: { id } });
          if (freshBatch) Object.assign(batch, freshBatch);
          aggregates.set(id, freshAggs.get(id)!);
        }
      } catch (syncErr) {
        console.error("Batch detail sync error:", syncErr);
      }
    }

    const stats = statsFromCounts(aggregates.get(id)?.counts);
    return NextResponse.json({
      batch,
      orders,
      stats,
      progress: batchProgress(stats),
      exports,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}