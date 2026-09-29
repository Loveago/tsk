import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";
import { toXlsx, toCsv, exportResponse, type ExportColumn } from "@/lib/exports";
import { normalizeOrderStatus, sanitizeCustomerRefundNote } from "@/lib/types";
import { orderCode, parseOrderCode } from "@/lib/utils";

const ALL_ORDER_COLUMNS: ExportColumn[] = [
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

    const isPreview = searchParams.get("preview") === "true";
    const format = (searchParams.get("format") ?? "xlsx") as "csv" | "xlsx";
    const rawStatus = searchParams.get("status");
    const rawNetwork = searchParams.get("network");
    const q = searchParams.get("q");
    const source = searchParams.get("source");
    const batchId = searchParams.get("batchId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const rawMinGb = searchParams.get("minGb");
    const rawMaxGb = searchParams.get("maxGb");
    const rawMinAmount = searchParams.get("minAmount");
    const rawMaxAmount = searchParams.get("maxAmount");
    const rawColumns = searchParams.get("columns");
    const includeSummary = searchParams.get("includeSummary") === "true";

    const where: Record<string, unknown> = { userId: user.id };

    // Batch ID filter
    if (batchId && batchId.trim()) {
      where.batchId = batchId.trim();
    }

    // Status filter (supports single or comma-separated list)
    if (rawStatus && rawStatus.trim() && rawStatus !== "ALL") {
      const parts = rawStatus
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s && s !== "ALL");
      if (parts.length === 1) {
        where.status = normalizeOrderStatus(parts[0]);
      } else if (parts.length > 1) {
        where.status = { in: parts.map((s) => normalizeOrderStatus(s)) };
      }
    }

    // Network filter (supports single or comma-separated list)
    if (rawNetwork && rawNetwork.trim() && rawNetwork !== "ALL") {
      const parts = rawNetwork
        .split(",")
        .map((n) => n.trim())
        .filter((n) => n && n !== "ALL");
      if (parts.length === 1) {
        where.network = parts[0];
      } else if (parts.length > 1) {
        where.network = { in: parts };
      }
    }

    // Source filter
    if (source && source !== "ALL") {
      if (source === "API") {
        where.source = "API";
      } else if (source === "SINGLE" || source === "WEB") {
        where.source = { not: "API" };
      } else if (source === "STOREFRONT") {
        where.storefrontOrder = { isNot: null };
      }
    }

    // Search query filter (Order ID, recipient phone, external reference, or batch code)
    if (q) {
      const trimmed = q.trim();
      const parsedId = parseOrderCode(trimmed);
      const idMatch = trimmed.match(/^(?:ORD-|API-)?0*(\d+)$/i);
      const orConditions: any[] = [
        { phoneNumber: { contains: trimmed } },
        { externalReference: { contains: trimmed } },
        { batch: { is: { batchCode: { contains: trimmed } } } },
      ];
      if (parsedId !== null && parsedId < 2147483647) {
        orConditions.push({ id: parsedId });
      } else if (idMatch && Number(idMatch[1]) < 2147483647) {
        orConditions.push({ id: Number(idMatch[1]) });
      }
      where.OR = orConditions;
    }

    // Date & Time range filter
    if (from || to) {
      const createdAt: Record<string, Date> = {};
      if (from) {
        const d = new Date(from);
        if (!isNaN(d.getTime())) createdAt.gte = d;
      }
      if (to) {
        const d = new Date(to);
        if (!isNaN(d.getTime())) createdAt.lte = d;
      }
      if (Object.keys(createdAt).length > 0) {
        where.createdAt = createdAt;
      }
    }

    // Volume (GB) range filter
    const minGb = rawMinGb ? parseFloat(rawMinGb) : undefined;
    const maxGb = rawMaxGb ? parseFloat(rawMaxGb) : undefined;
    if ((minGb !== undefined && !isNaN(minGb)) || (maxGb !== undefined && !isNaN(maxGb))) {
      const gbFilter: Record<string, number> = {};
      if (minGb !== undefined && !isNaN(minGb)) gbFilter.gte = minGb;
      if (maxGb !== undefined && !isNaN(maxGb)) gbFilter.lte = maxGb;
      where.gbAmount = gbFilter;
    }

    // Amount (GHS) range filter
    const minAmount = rawMinAmount ? parseFloat(rawMinAmount) : undefined;
    const maxAmount = rawMaxAmount ? parseFloat(rawMaxAmount) : undefined;
    if ((minAmount !== undefined && !isNaN(minAmount)) || (maxAmount !== undefined && !isNaN(maxAmount))) {
      const amountFilter: Record<string, number> = {};
      if (minAmount !== undefined && !isNaN(minAmount)) amountFilter.gte = minAmount;
      if (maxAmount !== undefined && !isNaN(maxAmount)) amountFilter.lte = maxAmount;
      where.amount = amountFilter;
    }

    // If live preview is requested, compute quick aggregates and return JSON
    if (isPreview) {
      const [count, aggregates, networkGroups, statusGroups] = await Promise.all([
        prisma.order.count({ where }),
        prisma.order.aggregate({
          where,
          _sum: { gbAmount: true, amount: true },
        }),
        prisma.order.groupBy({
          by: ["network"],
          where,
          _count: { _all: true },
          _sum: { gbAmount: true, amount: true },
        }),
        prisma.order.groupBy({
          by: ["status"],
          where,
          _count: { _all: true },
          _sum: { gbAmount: true, amount: true },
        }),
      ]);

      const networkBreakdown: Record<string, { count: number; gb: number; amount: number }> = {};
      for (const item of networkGroups) {
        networkBreakdown[item.network] = {
          count: item._count._all,
          gb: item._sum.gbAmount ?? 0,
          amount: item._sum.amount ?? 0,
        };
      }

      const statusBreakdown: Record<string, { count: number; gb: number; amount: number }> = {};
      for (const item of statusGroups) {
        statusBreakdown[item.status] = {
          count: item._count._all,
          gb: item._sum.gbAmount ?? 0,
          amount: item._sum.amount ?? 0,
        };
      }

      return NextResponse.json({
        count,
        totalGb: aggregates._sum.gbAmount ?? 0,
        totalAmount: aggregates._sum.amount ?? 0,
        networkBreakdown,
        statusBreakdown,
      });
    }

    // Determine exported columns
    let activeColumns = ALL_ORDER_COLUMNS;
    if (rawColumns && rawColumns.trim()) {
      const requestedKeys = new Set(
        rawColumns
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean)
      );
      if (requestedKeys.size > 0) {
        const filtered = ALL_ORDER_COLUMNS.filter((col) => requestedKeys.has(col.key));
        if (filtered.length > 0) {
          activeColumns = filtered;
        }
      }
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 25000,
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
      return exportResponse(toCsv(rows, activeColumns), "csv", filename);
    }

    // Build summary metadata if requested
    let summaryMeta: any = undefined;
    if (includeSummary) {
      const totalOrders = orders.length;
      const totalGb = orders.reduce((acc, o) => acc + o.gbAmount, 0);
      const totalAmount = orders.reduce((acc, o) => acc + o.amount, 0);

      const netMap: Record<string, { count: number; gb: number; amount: number }> = {};
      const statusMap: Record<string, { count: number; gb: number; amount: number }> = {};

      for (const o of orders) {
        if (!netMap[o.network]) netMap[o.network] = { count: 0, gb: 0, amount: 0 };
        netMap[o.network].count += 1;
        netMap[o.network].gb += o.gbAmount;
        netMap[o.network].amount += o.amount;

        if (!statusMap[o.status]) statusMap[o.status] = { count: 0, gb: 0, amount: 0 };
        statusMap[o.status].count += 1;
        statusMap[o.status].gb += o.gbAmount;
        statusMap[o.status].amount += o.amount;
      }

      const appliedFilters: Array<{ label: string; value: string }> = [];
      if (rawNetwork && rawNetwork !== "ALL") appliedFilters.push({ label: "Network", value: rawNetwork });
      if (rawStatus && rawStatus !== "ALL") appliedFilters.push({ label: "Status", value: rawStatus });
      if (source && source !== "ALL") appliedFilters.push({ label: "Source", value: source });
      if (q) appliedFilters.push({ label: "Search Query", value: q });
      if (minGb || maxGb) appliedFilters.push({ label: "Volume (GB)", value: `${minGb ?? 0} to ${maxGb ?? "Any"} GB` });
      if (minAmount || maxAmount) appliedFilters.push({ label: "Amount (GHS)", value: `GHS ${minAmount ?? 0} to ${maxAmount ?? "Any"}` });

      const dateLabel = from && to
        ? `${from.slice(0, 16).replace("T", " ")} to ${to.slice(0, 16).replace("T", " ")}`
        : from
        ? `From ${from.slice(0, 16).replace("T", " ")}`
        : to
        ? `Up to ${to.slice(0, 16).replace("T", " ")}`
        : "All Time";

      summaryMeta = {
        totalOrders,
        totalGb,
        totalAmount,
        dateRangeLabel: dateLabel,
        filtersApplied: appliedFilters,
        networkBreakdown: netMap,
        statusBreakdown: statusMap,
      };
    }

    const buf = await toXlsx(rows, activeColumns, "Sent Orders", {
      includeSummary,
      summaryMeta,
    });
    return exportResponse(buf, "xlsx", filename);
  } catch (err) {
    return handleRouteError(err);
  }
}
