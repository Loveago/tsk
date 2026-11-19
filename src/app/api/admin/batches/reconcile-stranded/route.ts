import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";
import { recomputeBatchStatus } from "@/lib/orders";
import { dispatchClickyfiedMtnBatch } from "@/lib/provider-apis/clickyfied-batch";
import { getProviderRoutingConfig } from "@/lib/provider-apis/router";

export const dynamic = "force-dynamic";

const NON_CLICKYFIED_PREFIXES = [
  "ADH:",
  "ADH_REJECTED",
  "BIGWIN:",
  "GHC:",
  "BWTEL:",
  "UNVERIFIED_HOLD",
  "CLICKYFIED_MANUAL_HOLD",
];

function isStrandedClickyfiedOrder(
  order: {
    providerReference: string | null;
    externalReference?: string | null;
    exportBatchId?: string | null;
    exportCount?: number;
    updatedAt?: Date;
  },
  isClickyfiedMtnActive: boolean
): boolean {
  // If order was exported via Excel/TXT file, it is handled manually/by vendor and is NOT stranded
  if (order.exportBatchId || (order.exportCount ?? 0) > 0) return false;

  // Orders updated within the last 15 minutes are actively in-flight and must NEVER be treated as stranded
  if (order.updatedAt && Date.now() - order.updatedAt.getTime() < 15 * 60 * 1000) {
    return false;
  }

  const ref = (order.providerReference || "").trim();
  const extRef = (order.externalReference || "").trim();

  // Never treat orders belonging to other providers (ADH Group, Bigwindata, GHConnect, etc.) or manual holds as stranded Clickyfied orders
  if (NON_CLICKYFIED_PREFIXES.some((prefix) => ref.startsWith(prefix))) {
    return false;
  }

  // Confirmed Clickyfied submission always has "order-"
  if (ref.includes("order-")) return false;

  // Explicit Clickyfied incomplete/stranded markers
  if (ref.startsWith("CLICKYFIED_CLAIMED")) return true;
  if (ref.includes("CF-BATCH-")) return true;
  if (ref.startsWith("CLICKYFIED:")) return true;

  // Empty/null providerReference is ONLY considered stranded if it was part of a Clickyfied batch
  // OR if Clickyfied is actively enabled for MTN (otherwise it's a manual PROCESSING order)
  if (extRef.startsWith("CF-BATCH-")) return true;
  if (isClickyfiedMtnActive && ref === "") return true;

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
        exportBatchId: null,
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
        exportBatchId: true,
        exportCount: true,
        batchId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const routingConfig = await getProviderRoutingConfig();
    const isClickyfiedMtnActive =
      routingConfig.enabled &&
      routingConfig.clickyfied.enabled &&
      routingConfig.networkRoutes["MTN"] === "CLICKYFIED";

    const strandedOrders = processingOrders.filter((o) =>
      isStrandedClickyfiedOrder(o, isClickyfiedMtnActive)
    );
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
        exportBatchId: null,
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
        exportBatchId: true,
        exportCount: true,
        batchId: true,
        updatedAt: true,
      },
    });

    const routingConfig = await getProviderRoutingConfig();
    const isClickyfiedMtnActive =
      routingConfig.enabled &&
      routingConfig.clickyfied.enabled &&
      routingConfig.networkRoutes["MTN"] === "CLICKYFIED";

    const strandedOrders = processingOrders.filter((o) =>
      isStrandedClickyfiedOrder(o, isClickyfiedMtnActive)
    );

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

    // 1. Atomically reset stranded orders to PENDING and mark as manual hold
    await prisma.order.updateMany({
      where: { id: { in: strandedIds } },
      data: {
        status: "PENDING",
        providerReference: targetBatchCode ? `CLICKYFIED_MANUAL_HOLD:${targetBatchCode}` : "CLICKYFIED_MANUAL_HOLD:STRANDED",
        externalReference: targetBatchCode || null,
        failureReason: "Stranded order reverted to PENDING (no confirmed Clickyfied ID). Held for manual fulfillment.",
      },
    });

    // 2. Audit and history log
    const actor = user.name || user.email || "Staff";
    await prisma.orderStatusHistory.createMany({
      data: strandedOrders.map((o) => ({
        orderId: o.id,
        status: "PENDING",
        previousStatus: "PROCESSING",
        note: `Reconciled stranded order (was PROCESSING without valid Clickyfied order ID). Safely reverted to PENDING by ${actor} for manual fulfillment.`,
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

    // 4. Optionally dispatch immediately ONLY if automated processing is actively enabled
    let dispatchResult = null;
    if (action === "revert_and_dispatch") {
      const { getProviderRoutingConfig } = await import("@/lib/provider-apis/router");
      const config = await getProviderRoutingConfig();
      if (config.enabled && config.clickyfied.enabled) {
        dispatchResult = await dispatchClickyfiedMtnBatch(
          `Admin (${actor}) Reconciled Batch`
        );
      } else {
        dispatchResult = {
          success: false,
          error: "Automated API order processing is currently turned OFF. Orders were held in PENDING for manual fulfillment.",
        };
      }
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
