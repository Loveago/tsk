import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { changeOrderStatus, recomputeBatchStatus, recomputeExportBatchStatus } from "@/lib/orders";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { storefrontOrderCode } from "@/lib/storefront";

export async function POST(request: NextRequest) {
  try {
    const actor = await requireStaff();

    const body = await request.json().catch(() => ({}));
    const orderIds = Array.isArray(body.orderIds)
      ? body.orderIds.map((id: any) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0)
      : [];
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "Bulk refund scanner";

    if (orderIds.length === 0) {
      return apiError(400, "Please select at least one order to refund.");
    }

    // Fetch the target orders with their relationships
    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds } },
      include: {
        storefrontOrder: {
          select: {
            seq: true,
            paymentReference: true,
          },
        },
      },
    });

    let refundedCount = 0;
    let skippedCount = 0;
    let storefrontRefundCount = 0;
    let directRefundCount = 0;
    const refundedOrderIds: number[] = [];
    const refundedStorefrontIds: string[] = [];
    const errors: Array<{ orderId: number; error: string }> = [];

    // Track batch IDs that need recomputation
    const batchIdsToRecompute = new Set<string>();
    const exportBatchIdsToRecompute = new Set<string>();

    for (const order of orders) {
      if (order.status === "REFUNDED") {
        skippedCount++;
        continue;
      }

      try {
        const result = await changeOrderStatus(
          order.id,
          "REFUNDED",
          reason,
          { id: actor.id, label: actor.email },
          { force: true, skipBatchRecompute: true }
        );

        if (result.changed) {
          refundedCount++;
          refundedOrderIds.push(order.id);

          const isStorefront = order.source === "STOREFRONT" || Boolean(order.storefrontOrder);
          if (isStorefront) {
            storefrontRefundCount++;
            const ref =
              order.storefrontOrder?.paymentReference ||
              (order.storefrontOrder?.seq ? storefrontOrderCode(order.storefrontOrder.seq, null) : null);
            if (ref) refundedStorefrontIds.push(ref);
          } else {
            directRefundCount++;
          }

          if (order.batchId) batchIdsToRecompute.add(order.batchId);
          if (order.exportBatchId) exportBatchIdsToRecompute.add(order.exportBatchId);
        } else {
          skippedCount++;
        }
      } catch (err) {
        skippedCount++;
        errors.push({
          orderId: order.id,
          error: err instanceof Error ? err.message : "Failed to refund",
        });
      }
    }

    // Recompute batches asynchronously
    for (const bId of batchIdsToRecompute) {
      await recomputeBatchStatus(bId).catch(() => {});
    }
    for (const ebId of exportBatchIdsToRecompute) {
      await recomputeExportBatchStatus(ebId).catch(() => {});
    }

    // Audit log
    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: "order.bulk_refund",
      target: `orders:${refundedOrderIds.join(",")}`,
      newValue: JSON.stringify({
        refundedCount,
        skippedCount,
        storefrontRefundCount,
        directRefundCount,
        reason,
      }),
    });

    return NextResponse.json({
      success: true,
      message: `Successfully refunded ${refundedCount} order${refundedCount === 1 ? "" : "s"}.`,
      refundedCount,
      skippedCount,
      storefrontRefundCount,
      directRefundCount,
      refundedOrderIds,
      refundedStorefrontIds: Array.from(new Set(refundedStorefrontIds)),
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
