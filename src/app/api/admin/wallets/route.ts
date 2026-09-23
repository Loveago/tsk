import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    await requireStaff();
    const { searchParams } = new URL(request.url);

    // 1. Live search suggestions (e.g., combobox or fast lookup)
    const search = searchParams.get("search")?.trim();
    if (search) {
      const suggestions = await prisma.user.findMany({
        where: {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { phone: { contains: search, mode: "insensitive" } },
          ],
        },
        take: 8,
        orderBy: { balance: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          balance: true,
        },
      });
      return NextResponse.json({ suggestions });
    }

    // 2. Single User Detail Mode: tracking a specific user's wallet & activities
    const userId = searchParams.get("userId")?.trim();
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          balance: true,
          createdAt: true,
          lastLoginAt: true,
          pricingProfile: { select: { id: true, name: true, type: true } },
        },
      });

      if (!user) {
        return apiError(404, "User not found");
      }

      // Financial stats aggregation
      const [topupsAgg, debitsAgg, refundsAgg, ordersAgg, successOrdersCount, failedOrdersCount] =
        await Promise.all([
          prisma.walletTransaction.aggregate({
            where: {
              userId,
              type: { in: ["TOPUP", "ADJUSTMENT", "SIGNUP_FEE"] },
              status: "APPROVED",
              amount: { gt: 0 },
            },
            _sum: { amount: true },
            _count: { _all: true },
          }),
          prisma.walletTransaction.aggregate({
            where: {
              userId,
              type: "DEBIT",
              status: "APPROVED",
            },
            _sum: { amount: true },
            _count: { _all: true },
          }),
          prisma.walletTransaction.aggregate({
            where: {
              userId,
              type: "REFUND",
              status: "APPROVED",
            },
            _sum: { amount: true },
            _count: { _all: true },
          }),
          prisma.order.aggregate({
            where: { userId },
            _sum: { amount: true },
            _count: { _all: true },
          }),
          prisma.order.count({
            where: { userId, status: "SUCCESS" },
          }),
          prisma.order.count({
            where: { userId, status: "FAILED" },
          }),
        ]);

      // Pagination & filters for transactions
      const txPage = Math.max(1, Number(searchParams.get("txPage") ?? 1));
      const txPageSize = Math.min(100, Math.max(1, Number(searchParams.get("txPageSize") ?? 15)));
      const txType = searchParams.get("txType") || undefined;
      const txStatus = searchParams.get("txStatus") || undefined;

      const txWhere: Prisma.WalletTransactionWhereInput = { userId };
      if (txType) txWhere.type = txType;
      if (txStatus) txWhere.status = txStatus;

      const [transactions, txTotal] = await Promise.all([
        prisma.walletTransaction.findMany({
          where: txWhere,
          orderBy: { createdAt: "desc" },
          skip: (txPage - 1) * txPageSize,
          take: txPageSize,
          include: {
            sendClaim: {
              select: {
                id: true,
                transactionReference: true,
                senderPhone: true,
                status: true,
              },
            },
          },
        }),
        prisma.walletTransaction.count({ where: txWhere }),
      ]);

      // Pagination for orders activity
      const orderPage = Math.max(1, Number(searchParams.get("orderPage") ?? 1));
      const orderPageSize = Math.min(50, Math.max(1, Number(searchParams.get("orderPageSize") ?? 10)));

      const [orders, orderTotal] = await Promise.all([
        prisma.order.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          skip: (orderPage - 1) * orderPageSize,
          take: orderPageSize,
          select: {
            id: true,
            network: true,
            gbAmount: true,
            amount: true,
            status: true,
            phoneNumber: true,
            createdAt: true,
            batch: { select: { batchCode: true } },
          },
        }),
        prisma.order.count({ where: { userId } }),
      ]);

      return NextResponse.json({
        user,
        stats: {
          totalTopups: topupsAgg._sum.amount ?? 0,
          totalTopupsCount: topupsAgg._count._all,
          totalDebits: debitsAgg._sum.amount ?? 0,
          totalDebitsCount: debitsAgg._count._all,
          totalRefunds: refundsAgg._sum.amount ?? 0,
          totalRefundsCount: refundsAgg._count._all,
          totalOrdersCount: ordersAgg._count._all,
          totalOrderSpend: ordersAgg._sum.amount ?? 0,
          successOrdersCount,
          failedOrdersCount,
        },
        transactions: {
          items: transactions,
          total: txTotal,
          page: txPage,
          pageSize: txPageSize,
          pages: Math.ceil(txTotal / txPageSize),
        },
        orders: {
          items: orders,
          total: orderTotal,
          page: orderPage,
          pageSize: orderPageSize,
          pages: Math.ceil(orderTotal / orderPageSize),
        },
      });
    }

    // 3. Directory Mode: platform-wide overview & searchable users table
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));
    const q = searchParams.get("q")?.trim();
    const balanceFilter = searchParams.get("balance");
    const role = searchParams.get("role");

    const where: Prisma.UserWhereInput = {};
    if (role) where.role = role;
    if (balanceFilter === "positive") where.balance = { gt: 0 };
    else if (balanceFilter === "zero") where.balance = 0;
    else if (balanceFilter === "negative") where.balance = { lt: 0 };

    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
      ];
    }

    const [systemBalanceAgg, activeWalletsCount, zeroBalanceCount, negativeBalanceCount, users, total] =
      await Promise.all([
        prisma.user.aggregate({
          _sum: { balance: true },
        }),
        prisma.user.count({ where: { balance: { gt: 0 } } }),
        prisma.user.count({ where: { balance: 0 } }),
        prisma.user.count({ where: { balance: { lt: 0 } } }),
        prisma.user.findMany({
          where,
          orderBy: { balance: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
            status: true,
            balance: true,
            createdAt: true,
            lastLoginAt: true,
            _count: {
              select: {
                orders: true,
                walletTransactions: true,
              },
            },
          },
        }),
        prisma.user.count({ where }),
      ]);

    return NextResponse.json({
      overview: {
        totalPlatformBalance: systemBalanceAgg._sum.balance ?? 0,
        activeWalletsCount,
        zeroBalanceCount,
        negativeBalanceCount,
      },
      users,
      total,
      page,
      pageSize,
      pages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
