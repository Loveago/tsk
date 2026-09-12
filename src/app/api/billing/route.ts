import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));

    const where = { userId: user.id };
    const [data, total, sums] = await Promise.all([
      prisma.walletTransaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.walletTransaction.count({ where }),
      prisma.walletTransaction.groupBy({
        by: ["type", "status"],
        where: { userId: user.id, status: "APPROVED" },
        _sum: { amount: true },
      }),
    ]);

    let topups = 0;
    let spend = 0;
    for (const s of sums) {
      if (s.type === "TOPUP") topups += s._sum.amount ?? 0;
      if (s.type === "DEBIT") spend += s._sum.amount ?? 0;
    }

    return NextResponse.json({
      data,
      total,
      page,
      pageSize,
      pages: Math.ceil(total / pageSize),
      balance: user.balance,
      summary: { topups, spend },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
