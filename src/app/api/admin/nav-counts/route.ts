import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";

/**
 * Returns real-time counts for admin navigation badges:
 * - pendingOrders: orders awaiting processing (status = PENDING)
 * - underReviewReports: customer not-received reports requiring admin review (status = UNDER_REVIEW)
 */
export async function GET() {
  try {
    await requireStaff();

    const [pendingOrders, underReviewReports, pendingWithdrawals] = await Promise.all([
      prisma.order.count({
        where: { status: "PENDING" },
      }),
      prisma.deliveryReport.count({
        where: { status: "UNDER_REVIEW" },
      }),
      prisma.storefrontWithdrawal.count({
        where: { status: "PENDING" },
      }),
    ]);

    return NextResponse.json({
      pendingOrders,
      underReviewReports,
      pendingWithdrawals,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
