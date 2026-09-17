import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { handleRouteError } from "@/lib/api-helpers";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    await requireStaff();

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(5, parseInt(searchParams.get("pageSize") || "25", 10)));
    const provider = searchParams.get("provider") || "ALL";
    const status = searchParams.get("status") || "ALL";
    const action = searchParams.get("action") || "ALL";
    const search = (searchParams.get("search") || "").trim();
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where: Prisma.OrderApiLogWhereInput = {};

    if (provider !== "ALL") {
      where.provider = provider.toUpperCase();
    }

    if (status === "FAILED") {
      where.success = false;
    } else if (status === "SUCCESS") {
      where.success = true;
    }

    if (action !== "ALL") {
      where.action = action.toUpperCase();
    }

    if (from || to) {
      where.createdAt = {};
      if (from) {
        const fromDate = new Date(from);
        if (!isNaN(fromDate.getTime())) where.createdAt.gte = fromDate;
      }
      if (to) {
        const toDate = new Date(to);
        if (!isNaN(toDate.getTime())) where.createdAt.lte = toDate;
      }
    }

    if (search) {
      const searchNum = parseInt(search.replace(/^TSK-ORD-/i, "").replace(/^ORD-/i, ""), 10);
      const orConditions: Prisma.OrderApiLogWhereInput[] = [
        { errorMessage: { contains: search, mode: "insensitive" } },
        { providerReference: { contains: search, mode: "insensitive" } },
        { endpoint: { contains: search, mode: "insensitive" } },
        {
          order: {
            phoneNumber: { contains: search },
          },
        },
      ];

      if (!isNaN(searchNum)) {
        orConditions.push({ orderId: searchNum });
      }

      where.OR = orConditions;
    }

    // Run parallel query for logs and quick aggregate counts
    const [logs, total, totalFailed, totalSuccess, clickyfiedErrors, bigwindataErrors] =
      await Promise.all([
        prisma.orderApiLog.findMany({
          where,
          include: {
            order: {
              select: {
                id: true,
                phoneNumber: true,
                network: true,
                gbAmount: true,
                amount: true,
                status: true,
                failureReason: true,
                createdAt: true,
                providerReference: true,
                externalReference: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.orderApiLog.count({ where }),
        prisma.orderApiLog.count({ where: { ...where, success: false } }),
        prisma.orderApiLog.count({ where: { ...where, success: true } }),
        prisma.orderApiLog.count({ where: { provider: "CLICKYFIED", success: false } }),
        prisma.orderApiLog.count({ where: { provider: "BIGWINDATA", success: false } }),
      ]);

    const totalPages = Math.ceil(total / pageSize) || 1;

    return NextResponse.json({
      logs,
      pagination: {
        total,
        page,
        pageSize,
        totalPages,
      },
      stats: {
        total,
        failed: totalFailed,
        success: totalSuccess,
        clickyfiedErrors,
        bigwindataErrors,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
