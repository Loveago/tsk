import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { handleRouteError, apiError } from "@/lib/api-helpers";

/**
 * POST /api/admin/exports/txt
 *
 * Generates a plain-text TXT file for the selected orders.
 * Format: one line per order — `<phoneNumber> <gbAmount>` (no "GB" suffix).
 *
 * Body (all optional — at least one filter required):
 *   orderIds      : number[]   — specific order IDs
 *   batchIds      : string[]   — order-batch IDs (all orders inside)
 *   network       : string     — restrict to a single network
 *   userId        : string     — filter by user ID
 *   status        : string[]   — restrict to these statuses
 *   targetStatus  : string     — optionally update exported orders to this status (e.g. "PROCESSING")
 *   volumeExactMb : number     — exact volume in MB
 *   volumeMinMb   : number     — minimum volume in MB
 *   volumeMaxMb   : number     — maximum volume in MB
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await requireStaff();

    const body = (await request.json()) as {
      orderIds?: number[];
      batchIds?: string[];
      network?: string;
      userId?: string;
      status?: string[];
      targetStatus?: string;
      volumeExactMb?: number;
      volumeMinMb?: number;
      volumeMaxMb?: number;
    };

    const where: Record<string, unknown> = { isSandbox: false };

    if (body.orderIds?.length) {
      where.id = { in: body.orderIds };
      where.status = body.status?.length
        ? { in: body.status }
        : { notIn: ["CANCELLED", "REFUNDED"] };
    } else if (body.batchIds?.length) {
      where.batchId = { in: body.batchIds };
      where.status = body.status?.length
        ? { in: body.status }
        : { notIn: ["CANCELLED", "REFUNDED"] };
    } else if (body.network) {
      where.network = body.network;
      where.status = body.status?.length
        ? { in: body.status }
        : "PENDING";
    } else {
      return apiError(400, "Provide at least one of: orderIds, batchIds, or network.");
    }

    if (body.network && (body.orderIds?.length || body.batchIds?.length)) {
      where.network = body.network;
    }

    if (body.userId) {
      where.userId = body.userId;
    }

    // Volume filters: exact overrides min/max (MB to GB)
    if (body.volumeExactMb !== undefined && !Number.isNaN(body.volumeExactMb)) {
      where.gbAmount = body.volumeExactMb / 1024;
    } else if (
      (body.volumeMinMb !== undefined && !Number.isNaN(body.volumeMinMb)) ||
      (body.volumeMaxMb !== undefined && !Number.isNaN(body.volumeMaxMb))
    ) {
      const gbFilter: Record<string, number> = {};
      if (body.volumeMinMb !== undefined && !Number.isNaN(body.volumeMinMb)) {
        gbFilter.gte = body.volumeMinMb / 1024;
      }
      if (body.volumeMaxMb !== undefined && !Number.isNaN(body.volumeMaxMb)) {
        gbFilter.lte = body.volumeMaxMb / 1024;
      }
      where.gbAmount = gbFilter;
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        phoneNumber: true,
        gbAmount: true,
        network: true,
        status: true,
      },
    });

    if (orders.length === 0) {
      return apiError(404, "No matching orders found.");
    }

    // If targetStatus is requested and differs, update orders and create status history
    const targetStatus = body.targetStatus;
    if (targetStatus && targetStatus !== "PENDING") {
      const orderIdsToUpdate = orders
        .filter((o) => o.status !== targetStatus)
        .map((o) => o.id);

      if (orderIdsToUpdate.length > 0) {
        await prisma.$transaction(async (tx) => {
          await tx.order.updateMany({
            where: { id: { in: orderIdsToUpdate } },
            data: {
              status: targetStatus as any,
              lastExportedAt: new Date(),
              lastExportedBy: actor.email,
              exportCount: { increment: 1 },
            },
          });

          await tx.orderStatusHistory.createMany({
            data: orders
              .filter((o) => o.status !== targetStatus)
              .map((o) => ({
                orderId: o.id,
                status: targetStatus as any,
                previousStatus: o.status as any,
                note: `Exported to TXT by ${actor.email}`,
                changedBy: actor.email,
              })),
          });
        });
      }
    }

    // Build TXT file — one line per order: "<phone> <gb>"
    // gbAmount is stored as a number (e.g. 1, 2.5, 10). We strip trailing zeros.
    const lines = orders.map((o) => {
      const gb =
        Number.isInteger(o.gbAmount)
          ? String(o.gbAmount)
          : o.gbAmount.toFixed(3).replace(/\.?0+$/, "");
      return `${o.phoneNumber} ${gb}`;
    });

    const text = lines.join("\n");
    const base64 = Buffer.from(text, "utf8").toString("base64");

    // Derive filename
    const networks = [...new Set(orders.map((o) => o.network))].sort();
    const networkTag = networks.join("_") || "EXPORT";
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const fileName = `${networkTag}_${date}.txt`;

    return NextResponse.json({
      fileName,
      fileBase64: base64,
      count: orders.length,
      networks,
      targetStatus: targetStatus ?? null,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
