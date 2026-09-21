import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";
import { recomputeBatchStatus } from "@/lib/orders";
import { dispatchClickyfiedMtnBatch } from "@/lib/provider-apis/clickyfied-batch";

export const dynamic = "force-dynamic";

function isStrandedClickyfiedOrder(order: {
  providerReference: string | null;
  externalReference?: string | null;
}): boolean {
  if (!order.providerReference) return true;
  const ref = order.providerReference.trim();
  if (ref === "") return true;
  if (ref.startsWith("CLICKYFIED_CLAIMED")) return true;
  if (ref.includes("CF-BATCH-")) return true;
  // A confirmed Clickyfied submission always returns an order ID starting with "order-"
  if (!ref.includes("order-")) return true;
  return false;
}

/**
 * GET /api/admin/batches/reconcile-stranded
 * Detects MTN orders that are marked as PROCESSING but have no confirmed provider reference
 * (e.g. providerReference is null, empty, batch code, or missing Clickyfied's order ID),
 * indicating they were never received or accepted by Clickyfied.
 */
export async function GET(request: NextRequest) {
  try {
    await requireStaff();
    const { searchParams } = new URL(request.url);
    const batchCode = searchParams.get("batchCode");

    const processingOrders = await prisma.order.findMany({
      where: {
        status: "PROCESSING",
        network: { equals: "MTN", mode: "insensitive" },
        ...(batchCode
          ? {
              OR: [
                { externalReference: { contains: batchCode } },
                { batch: { batchCode: { contains: batchCode } } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        phoneNumber: true,
        network: true,
        gbAmount: true,
        amount: true,
        status: true,
        providerReference: true,
        externalReference: true,
        batchId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const strandedOrders = processingOrders.filter(isStrandedClickyfiedOrder);
    const totalGb = strandedOrders.reduce((sum, o) => sum + o.gbAmount, 0);

    return NextResponse.json({
      count: strandedOrders.length,
      totalGb,
      orders: strandedOrders,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * POST /api/admin/batches/reconcile-stranded
 * Safely resets stranded MTN orders back to PENDING and optionally dispatches them to Clickyfied.
 * 
 * Body options:
 * - action: "revert" | "revert_and_dispatch" (default: "revert_and_dispatch")
 * - batchCode?: string (optional: target only orders belonging to a specific batch code like "CF-BATCH-000104")
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireStaff();
    const body = await request.json().catch(() => ({}));
    const action = body.action || "revert_and_dispatch";
    const targetBatchCode = body.batchCode ? String(body.batchCode).trim() : null;

    const processingOrders = await prisma.order.findMany({
      where: {
        status: "PROCESSING",
        network: { equals: "MTN", mode: "insensitive" },
        ...(targetBatchCode
          ? {
              OR: [
                { externalReference: { contains: targetBatchCode } },
                { batch: { batchCode: { contains: targetBatchCode } } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        phoneNumber: true,
        network: true,
        gbAmount: true,
        amount: true,
        status: true,
        providerReference: true,
        externalReference: true,
        batchId: true,
      },
    });

    const strandedOrders = processingOrders.filter(isStrandedClickyfiedOrder);

    if (strandedOrders.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No stranded orders found. All processing MTN orders have valid provider references.",
        reconciledCount: 0,
        reconciledGb: 0,
      });
    }

    const strandedIds = strandedOrders.map((o) => o.id);
    const totalGb = strandedOrders.reduce((sum, o) => sum + o.gbAmount, 0);

    // 1. Atomically reset stranded orders to PENDING and wipe invalid references
    await prisma.order.updateMany({
      where: { id: { in: strandedIds } },
      data: {
        status: "PENDING",
        providerReference: null,
        externalReference: null,
      },
    });

    // 2. Audit and history log
    const actor = user.name || user.email || "Staff";
    await prisma.orderStatusHistory.createMany({
      data: strandedOrders.map((o) => ({
        orderId: o.id,
        status: "PENDING",
        previousStatus: "PROCESSING",
        note: `Reconciled stranded order (was PROCESSING without valid Clickyfied order ID). Safely reverted to PENDING by ${actor}.`,
        changedBy: `Admin (${actor})`,
      })),
    });

    // 3. Recompute user parent batch statuses
    const parentBatchIds = Array.from(
      new Set(strandedOrders.map((o) => o.batchId).filter(Boolean) as string[])
    );
    for (const bId of parentBatchIds) {
      try {
        await recomputeBatchStatus(bId);
      } catch (err) {
        console.error(`[ReconcileStranded] Failed to recompute batch ${bId}:`, err);
      }
    }

    // 4. Optionally dispatch immediately
    let dispatchResult = null;
    if (action === "revert_and_dispatch") {
      dispatchResult = await dispatchClickyfiedMtnBatch(
        `Admin (${actor}) Reconciled Batch`
      );
    }

    return NextResponse.json({
      success: true,
      reconciledCount: strandedOrders.length,
      reconciledGb: totalGb,
      actionTaken: action,
      dispatchResult,
      message: action === "revert_and_dispatch"
        ? `Reconciled ${strandedOrders.length} order(s) (${totalGb} GB) and initiated immediate dispatch.`
        : `Reconciled ${strandedOrders.length} order(s) (${totalGb} GB) back to pending queue.`,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
