import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "25", 10) || 25));
    const endpointFilter = url.searchParams.get("endpoint")?.trim();
    const methodFilter = url.searchParams.get("method")?.trim().toUpperCase();
    const statusFilter = url.searchParams.get("status") ? parseInt(url.searchParams.get("status")!, 10) : undefined;
    const search = url.searchParams.get("search")?.trim();

    const where: any = {
      userId: user.id,
    };

    if (endpointFilter) where.endpoint = { contains: endpointFilter };
    if (methodFilter) where.method = methodFilter;
    if (statusFilter && !isNaN(statusFilter)) where.status = statusFilter;
    if (search) {
      where.OR = [
        { requestId: { contains: search } },
        { endpoint: { contains: search } },
        { errorCode: { contains: search } },
      ];
    }

    const [total, logs] = await Promise.all([
      prisma.apiRequestLog.count({ where }),
      prisma.apiRequestLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          endpoint: true,
          method: true,
          status: true,
          success: true,
          ip: true,
          environment: true,
          errorCode: true,
          responseTimeMs: true,
          requestId: true,
          createdAt: true,
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
