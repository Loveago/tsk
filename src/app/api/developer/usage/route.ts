import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";

export async function GET() {
  try {
    const user = await requireUser();
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now.getTime() - 7 * 86400000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      requestsToday,
      requestsWeek,
      requestsMonth,
      successfulRequests,
      failedRequests,
      ordersToday,
      ordersTotal,
      ordersCompleted,
      ordersFailed,
      webhookStats,
      recentRequests,
      recentOrders,
      recentWebhooks,
      application,
      credentials,
    ] = await Promise.all([
      prisma.apiRequestLog.count({
        where: { userId: user.id, createdAt: { gte: startOfToday } },
      }),
      prisma.apiRequestLog.count({
        where: { userId: user.id, createdAt: { gte: startOfWeek } },
      }),
      prisma.apiRequestLog.count({
        where: { userId: user.id, createdAt: { gte: startOfMonth } },
      }),
      prisma.apiRequestLog.count({
        where: { userId: user.id, success: true },
      }),
      prisma.apiRequestLog.count({
        where: { userId: user.id, success: false },
      }),
      prisma.order.count({
        where: { userId: user.id, source: "API", createdAt: { gte: startOfToday } },
      }),
      prisma.order.count({
        where: { userId: user.id, source: "API" },
      }),
      prisma.order.count({
        where: { userId: user.id, source: "API", status: "SUCCESS" },
      }),
      prisma.order.count({
        where: { userId: user.id, source: "API", status: "FAILED" },
      }),
      prisma.apiWebhookDelivery.groupBy({
        by: ["status"],
        where: { webhook: { userId: user.id } },
        _count: { _all: true },
      }),
      prisma.apiRequestLog.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          endpoint: true,
          method: true,
          status: true,
          success: true,
          ip: true,
          responseTimeMs: true,
          requestId: true,
          createdAt: true,
        },
      }),
      prisma.order.findMany({
        where: { userId: user.id, source: "API" },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          phoneNumber: true,
          network: true,
          gbAmount: true,
          amount: true,
          status: true,
          externalReference: true,
          isSandbox: true,
          createdAt: true,
        },
      }),
      prisma.apiWebhookDelivery.findMany({
        where: { webhook: { userId: user.id } },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          event: true,
          orderId: true,
          status: true,
          statusCode: true,
          responseTimeMs: true,
          attempt: true,
          error: true,
          createdAt: true,
        },
      }),
      prisma.apiApplication.findUnique({
        where: { userId: user.id },
      }),
      prisma.apiCredential.findMany({
        where: { userId: user.id },
      }),
    ]);

    let webhookSuccessCount = 0;
    let webhookFailedCount = 0;
    for (const row of webhookStats) {
      if (row.status === "SUCCESS") webhookSuccessCount = row._count._all;
      if (row.status === "FAILED") webhookFailedCount = row._count._all;
    }
    const totalWebhooks = webhookSuccessCount + webhookFailedCount;
    const webhookSuccessRate = totalWebhooks > 0 ? (webhookSuccessCount / totalWebhooks) * 100 : 100;

    const rateLimit = application?.rateLimitPerMin || 60;

    return NextResponse.json({
      success: true,
      apiStatus: application ? application.status : "NOT_APPLIED",
      rateLimit,
      metrics: {
        requestsToday,
        requestsWeek,
        requestsMonth,
        successfulRequests,
        failedRequests,
        ordersToday,
        ordersTotal,
        ordersCompleted,
        ordersFailed,
        webhookFailures: webhookFailedCount,
        webhookSuccessRate: Number(webhookSuccessRate.toFixed(1)),
      },
      recentRequests,
      recentOrders: recentOrders.map((o) => ({
        ...o,
        orderId: `CLK-${o.id}`,
        status: o.isSandbox ? (o.status === "SUCCESS" ? "TEST_COMPLETED" : o.status) : (o.status === "SUCCESS" ? "COMPLETED" : o.status),
      })),
      recentWebhooks: recentWebhooks.map((w) => ({
        ...w,
        orderId: w.orderId ? `CLK-${w.orderId}` : null,
      })),
      credentialCount: credentials.length,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
