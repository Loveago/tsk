import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where: Record<string, unknown> = { userId: user.id };
    if (from || to) {
      where.createdAt = {};
      if (from) (where.createdAt as Record<string, Date>).gte = new Date(from);
      if (to) (where.createdAt as Record<string, Date>).lte = new Date(to);
    }

    const [statusCounts, spendAgg, daily, byPackage] = await Promise.all([
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
        WHERE userId = ${user.id}
          ${from ? Prisma.sql`AND createdAt >= ${new Date(from)}` : Prisma.empty}
          ${to ? Prisma.sql`AND createdAt <= ${new Date(to)}` : Prisma.empty}
        GROUP BY day
        ORDER BY day ASC
        LIMIT 60
      `,
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

    return NextResponse.json({
      statusCounts: counts,
      totalOrders: spendAgg._count._all,
      totalSpend: spendAgg._sum.amount ?? 0,
      daily: daily.map((d) => ({ day: d.day, count: Number(d.count), amount: Number(d.amount) })),
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
