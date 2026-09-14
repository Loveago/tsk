import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { getSetting } from "@/lib/orders";

function parseDateParam(str: string | null, endOfDay = false): Date | null {
  if (!str) return null;
  const d = new Date(str.length === 10 && endOfDay ? `${str}T23:59:59.999Z` : str);
  return isNaN(d.getTime()) ? null : d;
}

export async function GET(request: NextRequest) {
  try {
    await requireStaff();
    const { searchParams } = new URL(request.url);
    const fromDateParam = parseDateParam(searchParams.get("from"), false);
    const toDateParam = parseDateParam(searchParams.get("to"), true);
    
    let fromDate = fromDateParam;
    let toDate = toDateParam || new Date();

    const maxDays = parseInt(await getSetting("reports_max_date_range_days", "90"), 10);
    const maxMs = maxDays * 24 * 60 * 60 * 1000;
    
    if (!fromDate) {
      fromDate = new Date(toDate.getTime() - maxMs);
    } else if (toDate.getTime() - fromDate.getTime() > maxMs + 172800000) {
      return apiError(400, `Date range cannot exceed ${maxDays} days`);
    }

    const where: Record<string, unknown> = {};
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) (where.createdAt as Record<string, Date>).gte = fromDate;
      if (toDate) (where.createdAt as Record<string, Date>).lte = toDate;
    }

    const [statusCounts, revenueAgg, dailyOrders, byPackage, topUsers] = await Promise.all([
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
      prisma.user.findMany({
        where: { orders: { some: where.createdAt ? { createdAt: where.createdAt } : {} } },
        select: {
          id: true,
          name: true,
          email: true,
          _count: { select: { orders: true } },
          orders: {
            where: { ...where, status: "SUCCESS" },
            select: { amount: true },
          },
        },
        take: 10,
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

    const top = topUsers
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        orders: u._count.orders,
        spend: u.orders.reduce((sum, o) => sum + o.amount, 0),
      }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 10);

    return NextResponse.json({
      statusCounts: counts,
      totalOrders: revenueAgg._count._all,
      totalRevenue: revenueAgg._sum.amount ?? 0,
      daily,
      byPackage: byPackage.map((b) => ({
        network: b.network,
        gbAmount: b.gbAmount,
        count: b._count._all,
        amount: b._sum.amount ?? 0,
      })),
      topUsers: top,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
