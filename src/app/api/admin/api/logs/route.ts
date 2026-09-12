import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "30", 10) || 30));
    const search = url.searchParams.get("search")?.trim();
    const statusParam = url.searchParams.get("status")?.trim();
    const methodParam = url.searchParams.get("method")?.trim().toUpperCase();

    const where: any = {};
    if (statusParam && statusParam !== "ALL") {
      const num = parseInt(statusParam, 10);
      if (!isNaN(num)) where.status = num;
    }
    if (methodParam && methodParam !== "ALL") {
      where.method = methodParam;
    }
    if (search) {
      where.OR = [
        { requestId: { contains: search } },
        { endpoint: { contains: search } },
        { ip: { contains: search } },
        { errorCode: { contains: search } },
        { credential: { name: { contains: search } } },
        { credential: { user: { email: { contains: search } } } },
      ];
    }

    const [total, logs] = await Promise.all([
      prisma.apiRequestLog.count({ where }),
      prisma.apiRequestLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          credential: {
            select: {
              id: true,
              name: true,
              keyPrefix: true,
              environment: true,
              user: { select: { id: true, name: true, email: true } },
            },
          },
          apiKey: {
            select: {
              name: true,
              prefix: true,
              user: { select: { email: true } },
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      logs,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
