import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { batchActionSchema } from "@/lib/validation";
import {
  changeOrderStatus,
  recomputeBatchStatus,
  recomputeExportBatchStatus,
} from "@/lib/orders";
import { statsFromCounts, batchProgress } from "@/lib/batches";
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

/** Export batch detail (§30): export meta + linked batches + recipients. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaff();
    const { id } = await params;

    // Self-heal: keep the export status in sync with its orders
    await recomputeExportBatchStatus(id);

    const exportBatch = await prisma.exportBatch.findUnique({
      where: { id },
      include: {
        admin: { select: { name: true, email: true } },
        batches: {
          select: {
            id: true,
            batchCode: true,
            network: true,
            status: true,
            user: { select: { name: true, email: true } },
          },
        },
        orders: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            phoneNumber: true,
            network: true,
            gbAmount: true,
            amount: true,
            status: true,
            providerReference: true,
            failureReason: true,
            exportCount: true,
            lastExportedAt: true,
            lastExportedBy: true,
            createdAt: true,
            dataPackage: { select: { name: true } },
            batch: { select: { batchCode: true } },
          },
        },
      },
    });
    if (!exportBatch) return apiError(404, "Export batch not found");

    // Split orders to top level (mirrors the batch detail API shape)
    const { orders, ...exportBatchMeta } = exportBatch;

    const counts: Record<string, number> = {};
    for (const order of orders) {
      counts[order.status] = (counts[order.status] ?? 0) + 1;
    }
    const stats = statsFromCounts(counts);

    return NextResponse.json({
      exportBatch: exportBatchMeta,
      orders,
      stats,
      progress: batchProgress(stats),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * Export-level action (§5/§13): applies the action to eligible recipients of
 * this export only, via the per-order transition engine. The export status is
 * recomputed afterwards so the Export Center always reflects reality.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireStaff();
    const { id } = await params;
    const input = batchActionSchema.parse(await request.json());

    const exportBatch = await prisma.exportBatch.findUnique({ where: { id } });
    if (!exportBatch) return apiError(404, "Export batch not found");

    const target = ACTION_TARGET[input.action] || normalizeOrderStatus(input.action);
    const eligible = BATCH_ACTION_ELIGIBLE[input.action] ?? (BATCH_ACTION_ELIGIBLE[target] ?? []);

    let candidates = await prisma.order.findMany({
      where: input.orderIds?.length
        ? { id: { in: input.orderIds }, exportBatchId: id }
        : { exportBatchId: id },
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
            input.reason || `Export ${exportBatch.exportCode} action: marked processing`,
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

    // Recompute the affected order batches + this export's own status
    const batchIds = [...new Set(candidates.map((o) => o.batchId).filter(Boolean) as string[])];
    for (const batchId of batchIds) {
      await recomputeBatchStatus(batchId);
    }
    await recomputeExportBatchStatus(id);

    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: `export.${input.action.toLowerCase()}`,
      target: `export:${exportBatch.exportCode}`,
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