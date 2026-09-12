import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";

export async function GET() {
  try {
    await requireAdmin();
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalApiUsers,
      activeApiUsers,
      pendingApplications,
      ordersToday,
      ordersMonth,
      apiRevenue,
      successfulOrders,
      failedOrders,
      totalRequests,
      failedRequests,
      webhookFailures,
      recentLogs,
      recentApplications,
    ] = await Promise.all([
      prisma.apiApplication.count(),
      prisma.apiApplication.count({ where: { status: "APPROVED" } }),
      prisma.apiApplication.count({ where: { status: "PENDING" } }),
      prisma.order.count({
        where: { source: "API", createdAt: { gte: startOfToday } },
      }),
      prisma.order.count({
        where: { source: "API", createdAt: { gte: startOfMonth } },
      }),
      prisma.order.aggregate({
        where: { source: "API", status: "SUCCESS" },
        _sum: { amount: true },
      }),
      prisma.order.count({
        where: { source: "API", status: "SUCCESS" },
      }),
      prisma.order.count({
        where: { source: "API", status: "FAILED" },
      }),
      prisma.apiRequestLog.count(),
      prisma.apiRequestLog.count({ where: { success: false } }),
      prisma.apiWebhookDelivery.count({ where: { status: "FAILED" } }),
      prisma.apiRequestLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          credential: { select: { name: true, user: { select: { email: true } } } },
        },
      }),
      prisma.apiApplication.findMany({
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { user: { select: { name: true, email: true } } },
      }),
    ]);

    return NextResponse.json({
      metrics: {
        totalApiUsers,
        activeApiUsers,
        pendingApplications,
        ordersToday,
        ordersMonth,
        apiRevenue: apiRevenue._sum.amount ?? 0,
        successfulOrders,
        failedOrders,
        totalRequests,
        failedRequests,
        webhookFailures,
      },
      recentLogs: recentLogs.map((l) => ({
        id: l.id,
        endpoint: l.endpoint,
        method: l.method,
        status: l.status,
        success: l.success,
        ip: l.ip,
        responseTimeMs: l.responseTimeMs,
        userEmail: l.credential?.user?.email || null,
        credentialName: l.credential?.name || null,
        createdAt: l.createdAt,
      })),
      recentApplications,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
