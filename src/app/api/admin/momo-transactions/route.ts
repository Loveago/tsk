import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    await requireStaff();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));

    const network = searchParams.get("network");
    const status = searchParams.get("status");
    const q = searchParams.get("q")?.trim();
    const sender = searchParams.get("sender")?.trim();
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const minAmount = searchParams.get("minAmount");
    const maxAmount = searchParams.get("maxAmount");

    const where: Record<string, unknown> = {};

    if (network) where.network = network;
    if (status) where.status = status;
    if (q) {
      where.OR = [
        { transactionReference: { contains: q, mode: "insensitive" } },
        { rawSms: { contains: q, mode: "insensitive" } },
      ];
    }
    if (sender) {
      where.senderPhone = { contains: sender };
    }
    if (from || to) {
      const dateFilter: Record<string, Date> = {};
      if (from) dateFilter.gte = new Date(from);
      if (to) dateFilter.lte = new Date(to);
      where.createdAt = dateFilter;
    }
    if (minAmount || maxAmount) {
      const amountFilter: Record<string, number> = {};
      if (minAmount) amountFilter.gte = Number(minAmount);
      if (maxAmount) amountFilter.lte = Number(maxAmount);
      where.amount = amountFilter;
    }

    const [data, total] = await Promise.all([
      prisma.incomingMomoTransaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          claims: {
            include: {
              user: {
                select: { id: true, name: true, email: true },
              },
            },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      }),
      prisma.incomingMomoTransaction.count({ where }),
    ]);

    return NextResponse.json({
      data,
      total,
      page,
      pageSize,
      pages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

