import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";

function parseDateParam(str: string | null, endOfDay = false): Date | null {
  if (!str) return null;
  const d = new Date(str.length === 10 && endOfDay ? `${str}T23:59:59.999Z` : str);
  return isNaN(d.getTime()) ? null : d;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const fromDate = parseDateParam(searchParams.get("from"), false);
    const toDate = parseDateParam(searchParams.get("to"), true);

    const where: Record<string, unknown> = { userId: user.id };
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) (where.createdAt as Record<string, Date>).gte = fromDate;
      if (toDate) (where.createdAt as Record<string, Date>).lte = toDate;
    }

    const [statusCounts, spendAgg, dailyOrders, byPackage] = await Promise.all([
      prisma.order.groupBy({
        by: ["status"],
        where,
        _count: { _all: true },
      }),
      prisma.order.aggregate({
        where: { ...where, status: { in: ["SUCCESS", "PROCESSING", "PENDING"] } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.order.findMany({
        where,
        select: { createdAt: true, amount: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.order.groupBy({
        by: ["network", "gbAmount"],
        where,
        _count: { _all: true },
        _sum: { amount: true },
        orderBy: [{ network: "asc" }, { gbAmount: "asc" }],
      }),
    ]);

    const counts: Record<string, number> = {};
    for (const s of statusCounts) counts[s.status] = s._count._all;

    const dailyMap = new Map<string, { count: number; amount: number }>();
    for (const o of dailyOrders) {
      const day = o.createdAt.toISOString().slice(0, 10);
      const entry = dailyMap.get(day) ?? { count: 0, amount: 0 };
      entry.count += 1;
      entry.amount += o.amount;
      dailyMap.set(day, entry);
    }
    const daily = Array.from(dailyMap.entries()).map(([day, val]) => ({
      day,
      count: val.count,
      amount: val.amount,
    }));

    return NextResponse.json({
      statusCounts: counts,
      totalOrders: spendAgg._count._all,
      totalSpend: spendAgg._sum.amount ?? 0,
      daily,
      byPackage: byPackage.map((b) => ({
        network: b.network,
        gbAmount: b.gbAmount,
        count: b._count._all,
        amount: b._sum.amount ?? 0,
      })),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
