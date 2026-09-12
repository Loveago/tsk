import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import {
  buildBatchWhere,
  getBatchAggregates,
  statsFromCounts,
  batchProgress,
} from "@/lib/batches";
import { handleRouteError } from "@/lib/api-helpers";

/** The signed-in user's order batches (§2), newest first. */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 10)));

    const where = buildBatchWhere({
      network: searchParams.get("network"),
      status: searchParams.get("status"),
      userId: user.id,
      q: searchParams.get("q"),
      from: searchParams.get("from"),
      to: searchParams.get("to"),
    });

    const [data, total] = await Promise.all([
      prisma.orderBatch.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
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