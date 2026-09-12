import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "25", 10) || 25));
    const source = url.searchParams.get("source")?.trim().toUpperCase();
    const status = url.searchParams.get("status")?.trim().toUpperCase();
    const network = url.searchParams.get("network")?.trim().toUpperCase();
    const search = url.searchParams.get("search")?.trim();

    const where: any = {};
    if (source && source !== "ALL") where.source = source;
    if (status && status !== "ALL") {
      where.status = status === "COMPLETED" ? "SUCCESS" : status;
    }
    if (network && network !== "ALL") where.network = network;
    if (search) {
      where.OR = [
        { externalReference: { contains: search } },
        { phoneNumber: { contains: search } },
        { user: { email: { contains: search } } },
      ];
    }

    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true } },
          dataPackage: { select: { name: true } },
          apiCredential: { select: { id: true, name: true, keyPrefix: true, environment: true } },
          history: { orderBy: { createdAt: "asc" }, select: { status: true, note: true, changedBy: true, createdAt: true } },
        },
      }),
    ]);

    const formatted = orders.map((o) => ({
      id: o.id,
      orderCode: `CLK-${o.id}`,
      source: o.source,
      user: o.user,
      apiCredential: o.apiCredential,
      externalReference: o.externalReference,
      network: o.network,
      package: o.dataPackage?.name || `${o.gbAmount}GB`,
      gbAmount: o.gbAmount,
      recipient: o.phoneNumber,
      amount: o.amount,
      status: o.status === "SUCCESS" ? "COMPLETED" : o.status,
      failureReason: o.failureReason,
      isSandbox: o.isSandbox,
      createdAt: o.createdAt,
      completedAt: o.completedAt,
      history: o.history,
    }));

    return NextResponse.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      orders: formatted,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
