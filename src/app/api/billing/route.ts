import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";
import { verifyAndSettlePaystackTopup } from "@/lib/paystack";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));

    // Self-healing: automatically check and approve any pending Paystack top-ups for this user
    try {
      const pendingPaystack = await prisma.walletTransaction.findMany({
        where: {
          userId: user.id,
          type: "TOPUP",
          status: "PENDING",
          reference: { startsWith: "PSK-" },
          createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
        },
        take: 5,
        orderBy: { createdAt: "desc" },
      });

      if (pendingPaystack.length > 0) {
        await Promise.allSettled(
          pendingPaystack.map((tx) => verifyAndSettlePaystackTopup(tx.id))
        );
      }
    } catch (reconcileErr) {
      console.error("Auto-reconcile error in billing GET:", reconcileErr);
    }

    const where = { userId: user.id };
    const [data, total, sums, freshUser] = await Promise.all([
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
      prisma.user.findUnique({
        where: { id: user.id },
        select: { balance: true },
      }),
    ]);

    let topups = 0;
    let spend = 0;
    for (const s of sums) {
      if (s.type === "TOPUP") topups += s._sum.amount ?? 0;
      if (s.type === "DEBIT") spend += s._sum.amount ?? 0;
    }

    const sendClaimSetting = await prisma.systemSetting.findUnique({
      where: { key: "send_claim_enabled" },
    });
    const sendClaimEnabled = sendClaimSetting?.value !== "false";

    return NextResponse.json({
      data,
      total,
      page,
      pageSize,
      pages: Math.ceil(total / pageSize),
      balance: freshUser?.balance ?? user.balance,
      summary: { topups, spend },
      sendClaimEnabled,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
