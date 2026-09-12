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

    const status = searchParams.get("status");
    const network = searchParams.get("network");
    const q = searchParams.get("q")?.trim();

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (network) where.network = network;
    if (q) {
      where.OR = [
        { transactionReference: { contains: q, mode: "insensitive" } },
        { user: { name: { contains: q, mode: "insensitive" } } },
        { user: { email: { contains: q, mode: "insensitive" } } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.sendClaim.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: {
            select: { id: true, name: true, email: true, balance: true },
          },
          incomingTransaction: {
            select: { id: true, status: true, amount: true, transactionAt: true },
          },
          walletTransaction: {
            select: { id: true, status: true, reference: true },
          },
        },
      }),
      prisma.sendClaim.count({ where }),
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

