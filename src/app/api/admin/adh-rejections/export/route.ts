import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { changeOrderStatus } from "@/lib/orders";
import { buildOrdersWorkbook } from "@/lib/order-export";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function POST(request: NextRequest) {
  try {
    const actor = await requireStaff();
    const body = await request.json().catch(() => ({}));

    const format = String(body.format || "excel").toLowerCase() === "txt" ? "txt" : "excel";
    const markProcessing = Boolean(body.markProcessing);
    const orderIds: number[] = Array.isArray(body.orderIds)
      ? body.orderIds.map((id: any) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0)
      : [];

    const where: any = {
      providerReference: { startsWith: "ADH_REJECTED" },
    };
    if (orderIds.length > 0) {
      where.id = { in: orderIds };
    } else {
      where.status = "PENDING";
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: "asc" },
      include: {
        dataPackage: { select: { name: true } },
        batch: { select: { batchCode: true } },
      },
    });

    if (orders.length === 0) {
      return apiError(400, "No ADH Group rejected orders found to export.");
    }

    const now = new Date();
    const dateStamp = now.toISOString().slice(0, 10);
    const exportCode = `ADH-REJ-${Date.now().toString(36).toUpperCase()}`;

    await prisma.order.updateMany({
      where: { id: { in: orders.map((o) => o.id) } },
      data: {
        exportCount: { increment: 1 },
        lastExportedAt: now,
        lastExportedBy: actor.email,
      },
    });

    if (markProcessing) {
      for (const o of orders) {
        if (o.status === "PENDING") {
          await changeOrderStatus(
            o.id,
            "PROCESSING",
            `Exported from ADH Rejections (${exportCode}) for fulfillment elsewhere`,
            { id: actor.id, label: actor.email },
            { force: true }
          ).catch(() => {});
        }
      }
    }

    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: "adh_rejections.export",
      target: `orders:${orders.map((o) => o.id).join(",")}`,
      newValue: JSON.stringify({
        exportCode,
        format,
        count: orders.length,
        markProcessing,
      }),
    });

    if (format === "txt") {
      const lines = orders.map((o) => {
        const gb = Number.isInteger(o.gbAmount)
          ? String(o.gbAmount)
          : o.gbAmount.toFixed(3).replace(/\.?0+$/, "");
        return `${o.phoneNumber} ${gb}`;
      });
      const text = lines.join("\n");
      return new NextResponse(text, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="ADH_MTN_Rejections_${dateStamp}_${exportCode}.txt"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const buffer = await buildOrdersWorkbook(
      orders.map((o) => ({
        id: o.id,
        phoneNumber: o.phoneNumber,
        gbAmount: o.gbAmount,
        amount: o.amount,
        packageName: o.dataPackage?.name ?? null,
        batchCode: o.batch?.batchCode ?? null,
      })),
      {
        network: "MTN (ADH Rejections)",
        exportCode,
        exportedBy: actor.email,
        exportedAt: now,
        isReexport: false,
      }
    );

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="ADH_MTN_Rejections_${dateStamp}_${exportCode}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
