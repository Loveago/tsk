import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { NETWORKS } from "@/lib/types";
import { handleRouteError } from "@/lib/api-helpers";

/**
 * Per-network ops stats for the admin dashboard (§3/§26):
 * pending queue size/value, in-flight, failures, today's completions,
 * active batches and the latest export per network.
 */
export async function GET() {
  try {
    await requireStaff();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [orderGroups, activeBatches, successToday, lastExports] =
      await Promise.all([
        prisma.order.groupBy({
          by: ["network", "status"],
          _count: { _all: true },
          _sum: { amount: true, gbAmount: true },
        }),
        prisma.orderBatch.groupBy({
          by: ["network"],
          where: { status: { in: ["PENDING", "PROCESSING"] } },
          _count: { _all: true },
        }),
        prisma.order.groupBy({
          by: ["network"],
          where: { status: "SUCCESS", updatedAt: { gte: todayStart } },
          _count: { _all: true },
        }),
        prisma.exportBatch.findMany({
          orderBy: { createdAt: "desc" },
          distinct: ["network"],
          select: { network: true, exportCode: true, createdAt: true, adminLabel: true },
        }),
      ]);

    const stats = NETWORKS.map((network) => {
      const pick = (status: string) =>
        orderGroups.find((g) => g.network === network && g.status === status);

      const pending = pick("PENDING");
      const processing = pick("PROCESSING");
      const failed = pick("FAILED");
      const lastExport = lastExports.find((e) => e.network === network) ?? null;

      return {
        network,
        pending: pending?._count._all ?? 0,
        pendingGb: pending?._sum.gbAmount ?? 0,
        pendingAmount: pending?._sum.amount ?? 0,
        processing: processing?._count._all ?? 0,
        failed: failed?._count._all ?? 0,
        successToday: successToday.find((g) => g.network === network)?._count._all ?? 0,
        activeBatches: activeBatches.find((g) => g.network === network)?._count._all ?? 0,
        lastExport: lastExport
          ? { exportCode: lastExport.exportCode, createdAt: lastExport.createdAt, adminLabel: lastExport.adminLabel }
          : null,
      };
    });

    return NextResponse.json({ stats });
  } catch (err) {
    return handleRouteError(err);
  }
}