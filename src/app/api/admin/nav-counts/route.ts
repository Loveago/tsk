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

    const [
      pendingOrders,
      underReviewReports,
      pendingWithdrawals,
      pendingStorefrontApplications,
    ] = await Promise.all([
      prisma.order.count({
        where: { status: "PENDING" },
      }),
      prisma.deliveryReport.count({
        where: { status: "UNDER_REVIEW" },
      }),
      prisma.storefrontWithdrawal.count({
        where: { status: "PENDING" },
      }),
      prisma.storefront.count({
        where: { status: "PENDING", isCustomDomain: false },
      }),
    ]);

    return NextResponse.json({
      pendingOrders,
      underReviewReports,
      pendingWithdrawals,
      pendingStorefrontApplications,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
