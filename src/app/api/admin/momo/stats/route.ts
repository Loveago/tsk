import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";

export async function GET() {
  try {
    await requireStaff();

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [
      incomingToday,
      unclaimed,
      claimedToday,
      claimsTodayCount,
      activeSignupCodes,
      codeRegistrations,
    ] = await Promise.all([
      // INCOMING MOMO TODAY (sum of amount of incoming MoMo today)
      prisma.incomingMomoTransaction.aggregate({
        where: { createdAt: { gte: startOfDay } },
        _sum: { amount: true },
        _count: { id: true },
      }),
      // UNCLAIMED (sum of amount where status = AVAILABLE)
      prisma.incomingMomoTransaction.aggregate({
        where: { status: "AVAILABLE" },
        _sum: { amount: true },
        _count: { id: true },
      }),
      // CLAIMED TODAY (sum of amount of claimed MoMo today)
      prisma.incomingMomoTransaction.aggregate({
        where: { status: "CLAIMED", updatedAt: { gte: startOfDay } },
        _sum: { amount: true },
        _count: { id: true },
      }),
      // CLAIMS TODAY
      prisma.sendClaim.count({
        where: { createdAt: { gte: startOfDay } },
      }),
      // ACTIVE SIGNUP CODES
      prisma.signupCode.count({
        where: { status: "ACTIVE" },
      }),
      // CODE REGISTRATIONS
      prisma.signupCodeUsage.count(),
    ]);

    return NextResponse.json({
      incomingToday: incomingToday._sum.amount ?? 0,
      incomingTodayCount: incomingToday._count.id ?? 0,
      unclaimed: unclaimed._sum.amount ?? 0,
      unclaimedCount: unclaimed._count.id ?? 0,
      claimedToday: claimedToday._sum.amount ?? 0,
      claimedTodayCount: claimedToday._count.id ?? 0,
      claimsToday: claimsTodayCount,
      activeSignupCodes,
      codeRegistrations,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

