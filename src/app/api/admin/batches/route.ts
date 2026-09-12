import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import {
  buildBatchWhere,
  getBatchAggregates,
  statsFromCounts,
  batchProgress,
  quickDateRange,
} from "@/lib/batches";
import { handleRouteError } from "@/lib/api-helpers";

/** Admin batch ops-center list (§4 filters + aggregates). */
export async function GET(request: NextRequest) {
  try {
    await requireStaff();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 15)));
    const quick = searchParams.get("quick");
    const range = quick ? quickDateRange(quick) : {};
    const from = searchParams.get("from") ?? range.from ?? null;
    const to = searchParams.get("to") ?? range.to ?? null;

    const where = buildBatchWhere({
      network: searchParams.get("network"),
      status: searchParams.get("status"),
      userId: searchParams.get("userId"),
      packageId: searchParams.get("packageId"),
      q: searchParams.get("q"),
      from,
      to,
    });

    const [data, total] = await Promise.all([
      prisma.orderBatch.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      prisma.orderBatch.count({ where }),
    ]);

    const aggregates = await getBatchAggregates(data.map((b) => b.id));
    const rows = data.map((b) => {
      const stats = statsFromCounts(aggregates.get(b.id)?.counts);
      return { ...b, stats, progress: batchProgress(stats) };
    });

    return NextResponse.json({
      data: rows,
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}