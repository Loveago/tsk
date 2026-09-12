import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { exportOrdersSchema } from "@/lib/validation";
import { exportOrdersToExcel } from "@/lib/order-export";
import { computeExportStatusFromCounts } from "@/lib/orders";
import { handleRouteError } from "@/lib/api-helpers";

/** Export history list (§29). */
export async function GET(request: NextRequest) {
  try {
    await requireStaff();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 15)));
    const network = searchParams.get("network");
    const status = searchParams.get("status");
    const q = searchParams.get("q");

    const where: Record<string, unknown> = {};
    if (network) where.network = network;
    if (status) where.status = status;
    if (q) {
      where.OR = [
        { exportCode: { contains: q } },
        { adminLabel: { contains: q } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.exportBatch.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          admin: { select: { name: true, email: true } },
          _count: { select: { orders: true } },
        },
      }),
      prisma.exportBatch.count({ where }),
    ]);

    // Self-heal: recompute export statuses from their orders so rows completed
    // outside the export flow (batch actions, delivery reports) never go stale.
    const exportIds = data.map((row) => row.id);
    if (exportIds.length > 0) {
      const grouped = await prisma.order.groupBy({
        by: ["exportBatchId", "status"],
        where: { exportBatchId: { in: exportIds } },
        _count: { _all: true },
      });
      const countsByExport = new Map<string, Record<string, number>>();
      for (const row of grouped) {
        if (!row.exportBatchId) continue;
        const entry = countsByExport.get(row.exportBatchId) ?? {};
        entry[row.status] = row._count._all;
        countsByExport.set(row.exportBatchId, entry);
      }
      const updates: Promise<unknown>[] = [];
      for (const row of data) {
        const counts = countsByExport.get(row.id);
        if (!counts) continue;
        const next = computeExportStatusFromCounts(counts);
        if (next && next !== row.status) {
          updates.push(
            prisma.exportBatch.update({ where: { id: row.id }, data: { status: next } })
          );
          row.status = next;
        }
      }
      await Promise.all(updates);
    }

    return NextResponse.json({
      data,
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * Create a network export (§27/§28/§31): generates the Excel file, then moves
 * the included PENDING orders to PROCESSING inside one transaction. The file
 * is returned base64-encoded so the UI can trigger the download immediately.
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await requireStaff();
    const input = exportOrdersSchema.parse(await request.json());

    const result = await exportOrdersToExcel({
      network: input.network,
      actor: { id: actor.id, label: actor.email },
      orderIds: input.orderIds,
      batchIds: input.batchIds,
      userId: input.userId || undefined,
      packageId: input.packageId || undefined,
      from: input.from || undefined,
      to: input.to || undefined,
      isReexport: input.isReexport,
      reason: input.reason || undefined,
    });

    return NextResponse.json({
      exportBatchId: result.exportBatchId,
      exportCode: result.exportCode,
      count: result.count,
      totalGb: result.totalGb,
      totalAmount: result.totalAmount,
      fileName: result.fileName,
      fileBase64: result.buffer.toString("base64"),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}