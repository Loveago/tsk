import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { buildOrdersWorkbook } from "@/lib/order-export";
import { handleRouteError, apiError } from "@/lib/api-helpers";

/**
 * Download an export's Excel file. The binary is not persisted (SQLite), so
 * the workbook is regenerated from the orders linked to the export batch,
 * keeping the original export code / meta block intact.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaff();
    const { id } = await params;
    const exportBatch = await prisma.exportBatch.findUnique({
      where: { id },
      include: {
        orders: {
          orderBy: { createdAt: "asc" },
          include: {
            dataPackage: { select: { name: true } },
            batch: { select: { batchCode: true } },
          },
        },
      },
    });
    if (!exportBatch) return apiError(404, "Export batch not found");

    const buffer = await buildOrdersWorkbook(
      exportBatch.orders.map((o) => ({
        id: o.id,
        phoneNumber: o.phoneNumber,
        gbAmount: o.gbAmount,
        amount: o.amount,
        packageName: o.dataPackage?.name ?? null,
        batchCode: o.batch?.batchCode ?? null,
      })),
      {
        network: exportBatch.network,
        exportCode: exportBatch.exportCode,
        exportedBy: exportBatch.adminLabel,
        exportedAt: exportBatch.createdAt,
        isReexport: exportBatch.isReexport,
      }
    );

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${exportBatch.fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}