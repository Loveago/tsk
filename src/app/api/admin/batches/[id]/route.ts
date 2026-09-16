import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { batchActionSchema } from "@/lib/validation";
import {
  changeOrderStatus,
  recomputeBatchStatus,
  recomputeExportBatchStatus,
} from "@/lib/orders";
import { getBatchAggregates, statsFromCounts, batchProgress } from "@/lib/batches";
import { BATCH_ACTION_ELIGIBLE, normalizeOrderStatus } from "@/lib/types";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";

const ACTION_TARGET: Record<string, string> = {
  PENDING: "PENDING",
  MARK_PENDING: "PENDING",
  Pending: "PENDING",
  PROCESSING: "PROCESSING",
  MARK_PROCESSING: "PROCESSING",
  Processing: "PROCESSING",
  PROCESSED: "SUCCESS",
  MARK_PROCESSED: "SUCCESS",
  MARK_COMPLETED: "SUCCESS",
  COMPLETED: "SUCCESS",
  Processed: "SUCCESS",
  MARK_FAILED: "FAILED",
  CANCEL: "REFUNDED",
  REFUND: "REFUNDED",
  MARK_REFUND: "REFUNDED",
  REFUNDED: "REFUNDED",
  Refund: "REFUNDED",
};

/** Batch detail: batch + user + recipients + aggregates + linked exports (§6). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaff();
    const { id } = await params;
    const batch = await prisma.orderBatch.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    if (!batch) return apiError(404, "Batch not found");

    const [orders, aggregates, exportBatches] = await Promise.all([
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
          providerReference: true,
          exportCount: true,
          lastExportedAt: true,
          lastExportedBy: true,
          createdAt: true,
          updatedAt: true,
          packageId: true,
          dataPackage: { select: { name: true } },
        },
      }),
      getBatchAggregates([id]),
      prisma.exportBatch.findMany({
        where: { batches: { some: { id } } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          exportCode: true,
          network: true,
          status: true,
          isReexport: true,
          fileName: true,
          createdAt: true,
          adminLabel: true,
        },
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
            const res = await syncClickyfiedOrder(o, "Admin Batch Detail View Sync");
            if (res.changed && res.newStatus) {
              o.status = res.newStatus;
              anyChanged = true;
            }
          })
        );
        if (anyChanged) {
          const freshAggs = await getBatchAggregates([id]);
          const freshBatch = await prisma.orderBatch.findUnique({
            where: { id },
            include: { user: { select: { id: true, name: true, email: true } } },
          });
          if (freshBatch) Object.assign(batch, freshBatch);
          aggregates.set(id, freshAggs.get(id)!);
        }
      } catch (syncErr) {
        console.error("Admin batch detail sync error:", syncErr);
      }
    }

    const stats = statsFromCounts(aggregates.get(id)?.counts);
    return NextResponse.json({
      batch,
      orders,
      stats,
      progress: batchProgress(stats),
      exportBatches,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * Batch-level action (§5/§13): applies the action to eligible recipients only,
 * via the per-order transition engine. If some orders require an override and
 * `force` was not sent, responds with `overrideRequired` so the UI can confirm.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireStaff();
    const { id } = await params;
    const input = batchActionSchema.parse(await request.json());

    const batch = await prisma.orderBatch.findUnique({ where: { id } });
    if (!batch) return apiError(404, "Batch not found");

    const target = ACTION_TARGET[input.action] || normalizeOrderStatus(input.action);
    const eligible = BATCH_ACTION_ELIGIBLE[input.action] ?? (BATCH_ACTION_ELIGIBLE[target] ?? []);

    let candidates = await prisma.order.findMany({
      where: input.orderIds?.length
        ? { id: { in: input.orderIds }, batchId: id }
        : { batchId: id },
    });
    if (eligible.length > 0) {
      candidates = candidates.filter((o) => eligible.includes(o.status as never));
    }

    let applied = 0;
    let skipped = 0;
    let overrideRequired = false;
    const label = { id: actor.id, label: actor.email };

    for (const order of candidates) {
      try {
        // Transition to SUCCESS from PENDING must pass through PROCESSING (§16 rules)
        if ((input.action === "MARK_COMPLETED" || target === "SUCCESS") && order.status === "PENDING") {
          await changeOrderStatus(
            order.id,
            "PROCESSING",
            input.reason || `Batch ${batch.batchCode} action: marked processing`,
            label,
            { skipBatchRecompute: true }
          );
        }
        const result = await changeOrderStatus(
          order.id,
          target,
          input.reason || null,
          label,
          { force: input.force, skipBatchRecompute: true }
        );
        if (result.changed) applied += 1;
        else skipped += 1;
        if (result.override) overrideRequired = true;
      } catch {
        skipped += 1;
      }
    }

    await recomputeBatchStatus(id);

    // Keep the Export Center in sync — orders in this batch may belong to exports
    const exportBatchIds = [
      ...new Set(candidates.map((o) => o.exportBatchId).filter(Boolean) as string[]),
    ];
    for (const exportBatchId of exportBatchIds) {
      await recomputeExportBatchStatus(exportBatchId);
    }

    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: `batch.${input.action.toLowerCase()}`,
      target: `batch:${batch.batchCode}`,
      newValue: JSON.stringify({
        applied,
        skipped,
        overrideRequired,
        candidates: candidates.length,
      }),
    });

    return NextResponse.json({
      applied,
      skipped,
      overrideRequired,
      total: candidates.length,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}