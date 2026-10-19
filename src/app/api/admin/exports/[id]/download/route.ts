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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaff();
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format")?.toLowerCase();

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

    if (format === "txt") {
      const lines = exportBatch.orders.map((o) => {
        const gb = Number.isInteger(o.gbAmount)
          ? String(o.gbAmount)
          : o.gbAmount.toFixed(3).replace(/\.?0+$/, "");
        return `${o.phoneNumber} ${gb}`;
      });
      const text = lines.join("\n");
      const txtFileName = exportBatch.fileName.endsWith(".xlsx")
        ? exportBatch.fileName.replace(/\.xlsx$/i, ".txt")
        : `${exportBatch.network}_${exportBatch.exportCode}.txt`;

      return new NextResponse(text, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="${txtFileName}"`,
          "Cache-Control": "no-store",
        },
      });
    }

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