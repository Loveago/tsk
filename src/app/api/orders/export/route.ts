import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";
import { toXlsx, toCsv, exportResponse, type ExportColumn } from "@/lib/exports";
import { normalizeOrderStatus, sanitizeCustomerRefundNote } from "@/lib/types";
import { orderCode } from "@/lib/utils";

const orderColumns: ExportColumn[] = [
  { key: "id", header: "Order ID", width: 14 },
  { key: "date", header: "Date & Time", width: 20 },
  { key: "phone", header: "Phone Number", width: 16 },
  { key: "network", header: "Network", width: 14 },
  { key: "gb", header: "Data Size (GB)", width: 14 },
  { key: "amount", header: "Amount (GHS)", width: 14 },
  { key: "status", header: "Status", width: 14 },
  { key: "batchCode", header: "Batch Code", width: 18 },
  { key: "source", header: "Source", width: 12 },
  { key: "completedAt", header: "Delivered At", width: 20 },
  { key: "failureReason", header: "Failure / Refund Note", width: 32 },
];

const fmt = (d: Date | null | undefined) =>
  d ? d.toISOString().slice(0, 19).replace("T", " ") : "—";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);

    const format = (searchParams.get("format") ?? "xlsx") as "csv" | "xlsx";
    const status = searchParams.get("status");
    const network = searchParams.get("network");
    const q = searchParams.get("q");
    const source = searchParams.get("source");
    const batchId = searchParams.get("batchId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where: Record<string, unknown> = { userId: user.id };

    if (batchId) {
      where.batchId = batchId;
    }
    if (status) {
      where.status = normalizeOrderStatus(status);
    }
    if (network) {
      where.network = network;
    }
    if (source === "API") {
      where.source = "API";
    } else if (source === "SINGLE" || source === "WEB") {
      where.source = { not: "API" };
    }

    if (q) {
      const trimmed = q.trim();
      const idMatch = trimmed.match(/^(?:ORD-|API-)?0*(\d+)$/i);
      const orConditions: any[] = [
        { phoneNumber: { contains: trimmed } },
        { externalReference: { contains: trimmed } },
        { batch: { is: { batchCode: { contains: trimmed } } } },
      ];
      if (idMatch && Number(idMatch[1]) < 2147483647) {
        orConditions.push({ id: Number(idMatch[1]) });
      }
      where.OR = orConditions;
    }

    if (from || to) {
      where.createdAt = {};
      if (from) (where.createdAt as Record<string, Date>).gte = new Date(from);
      if (to) (where.createdAt as Record<string, Date>).lte = new Date(to);
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 10000,
      include: {
        batch: {
          select: { batchCode: true },
        },
      },
    });

    const rows = orders.map((o) => ({
      id: orderCode(o.id),
      date: fmt(o.createdAt),
      phone: o.phoneNumber,
      network: o.network,
      gb: `${o.gbAmount} GB`,
      amount: o.amount.toFixed(2),
      status: o.status,
      batchCode: o.batch?.batchCode || "—",
      source: o.source || "WEB",
      completedAt: fmt(o.completedAt ?? (o.status === "SUCCESS" || o.status === "COMPLETED" ? o.updatedAt : null)),
      failureReason: o.failureReason ? sanitizeCustomerRefundNote(o.failureReason, o.amount) ?? o.failureReason : "—",
    }));

    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = batchId
      ? `orders-batch-${dateStamp}`
      : `my-orders-${dateStamp}`;

    if (format === "csv") {
      return exportResponse(toCsv(rows, orderColumns), "csv", filename);
    }

    const buf = await toXlsx(rows, orderColumns, "Sent Orders");
    return exportResponse(buf, "xlsx", filename);
  } catch (err) {
    return handleRouteError(err);
  }
}
