import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { exportOrdersToExcel } from "@/lib/order-export";

/**
 * POST /api/admin/exports/txt
 *
 * Generates a plain-text TXT file for the selected orders AND creates a tracked ExportBatch
 * so the export appears on the Export Center (/admin/exports) page for status updates & tracking.
 *
 * Format: one line per order — `<phoneNumber> <gbAmount>` (no "GB" suffix).
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await requireStaff();

    const body = (await request.json()) as {
      orderIds?: number[];
      batchIds?: string[];
      network?: string;
      userId?: string;
      packageId?: string;
      from?: string;
      to?: string;
      status?: string[];
      targetStatus?: string;
      isReexport?: boolean;
      reason?: string;
      volumeExactMb?: number;
      volumeMinMb?: number;
      volumeMaxMb?: number;
    };

    // If network was not specified, but specific orderIds or batchIds were provided,
    // determine the network(s) of the matching orders and export each network.
    if (!body.network && (body.orderIds?.length || body.batchIds?.length)) {
      const orderWhere: Record<string, unknown> = { isSandbox: false };
      if (body.orderIds?.length) orderWhere.id = { in: body.orderIds };
      if (body.batchIds?.length) orderWhere.batchId = { in: body.batchIds };

      const matchingOrders = await prisma.order.findMany({
        where: orderWhere,
        select: { id: true, network: true },
      });

      if (matchingOrders.length === 0) {
        return apiError(400, "No eligible orders found for the selected items.");
      }

      const networkGroups = new Map<string, number[]>();
      for (const o of matchingOrders) {
        if (!networkGroups.has(o.network)) networkGroups.set(o.network, []);
        networkGroups.get(o.network)!.push(o.id);
      }

      const results = [];
      for (const [net, ids] of networkGroups.entries()) {
        const res = await exportOrdersToExcel({
          network: net,
          actor: { id: actor.id, label: actor.email },
          orderIds: ids,
          isReexport: body.isReexport,
          reason: body.reason || undefined,
          targetStatus: body.targetStatus || "PROCESSING",
          format: "txt",
        });
        results.push({
          exportBatchId: res.exportBatchId,
          exportCode: res.exportCode,
          network: net,
          count: res.count,
          totalGb: res.totalGb,
          totalAmount: res.totalAmount,
          fileName: res.fileName,
          fileBase64: res.buffer.toString("base64"),
        });
      }

      if (results.length === 1) {
        return NextResponse.json({
          ...results[0],
          exports: results,
        });
      }

      return NextResponse.json({
        exportBatchId: results[0].exportBatchId,
        exportCode: results.map((r) => r.exportCode).join(", "),
        count: results.reduce((sum, r) => sum + r.count, 0),
        totalGb: results.reduce((sum, r) => sum + r.totalGb, 0),
        totalAmount: results.reduce((sum, r) => sum + r.totalAmount, 0),
        fileName: results.map((r) => r.fileName).join(", "),
        fileBase64: results[0].fileBase64,
        exports: results,
      });
    }

    if (!body.network) {
      return apiError(400, "Provide network or specific orderIds/batchIds.");
    }

    const result = await exportOrdersToExcel({
      network: body.network,
      actor: { id: actor.id, label: actor.email },
      orderIds: body.orderIds,
      batchIds: body.batchIds,
      userId: body.userId || undefined,
      packageId: body.packageId || undefined,
      from: body.from || undefined,
      to: body.to || undefined,
      isReexport: body.isReexport,
      reason: body.reason || undefined,
      targetStatus: body.targetStatus || "PROCESSING",
      volumeExactMb: body.volumeExactMb,
      volumeMinMb: body.volumeMinMb,
      volumeMaxMb: body.volumeMaxMb,
      format: "txt",
    });

    return NextResponse.json({
      exportBatchId: result.exportBatchId,
      exportCode: result.exportCode,
      count: result.count,
      totalGb: result.totalGb,
      totalAmount: result.totalAmount,
      fileName: result.fileName,
      fileBase64: result.buffer.toString("base64"),
      exports: [
        {
          exportBatchId: result.exportBatchId,
          exportCode: result.exportCode,
          network: body.network,
          count: result.count,
          totalGb: result.totalGb,
          totalAmount: result.totalAmount,
          fileName: result.fileName,
          fileBase64: result.buffer.toString("base64"),
        },
      ],
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
