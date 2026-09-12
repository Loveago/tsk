import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    await requireStaff();
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where: Record<string, unknown> = {};
    if (from || to) {
      where.createdAt = {};
      if (from) (where.createdAt as Record<string, Date>).gte = new Date(from);
      if (to) (where.createdAt as Record<string, Date>).lte = new Date(to);
    }

    const [statusCounts, revenueAgg, daily, byPackage, topUsers] = await Promise.all([
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
      prisma.$queryRaw<{ day: string; count: bigint; amount: number | null }[]>`
        SELECT date(createdAt / 1000, 'unixepoch') as day, COUNT(*) as count, COALESCE(SUM(amount), 0) as amount
        FROM "Order"
        WHERE 1=1
          ${from ? Prisma.sql`AND createdAt >= ${new Date(from)}` : Prisma.empty}
          ${to ? Prisma.sql`AND createdAt <= ${new Date(to)}` : Prisma.empty}
        GROUP BY day
        ORDER BY day ASC
        LIMIT 90
      `,
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
      daily: daily.map((d) => ({ day: d.day, count: Number(d.count), amount: Number(d.amount) })),
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
