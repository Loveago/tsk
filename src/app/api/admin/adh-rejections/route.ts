import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { changeOrderStatus } from "@/lib/orders";
import { getProviderRoutingConfig, dispatchOrdersBatch } from "@/lib/provider-apis/router";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    await requireStaff();

    const { searchParams } = new URL(request.url);
    const status = (searchParams.get("status") || "PENDING").toUpperCase();
    const search = searchParams.get("search")?.trim() || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));
    const skip = (page - 1) * pageSize;

    const config = await getProviderRoutingConfig();
    const isAdhMtnActive =
      config.enabled &&
      config.adhgroup.enabled &&
      (config.networkRoutes["MTN"] === "ADHGROUP" || config.networkRoutes["MTN_XPRESS"] === "ADHGROUP");

    const baseWhere: any = {
      providerReference: { startsWith: "ADH_REJECTED" },
    };

    const where: any = { ...baseWhere };
    if (status && status !== "ALL") {
      where.status = status;
    }

    if (search) {
      const searchAsNum = parseInt(search.replace(/\D/g, ""), 10);
      where.OR = [
        { phoneNumber: { contains: search, mode: "insensitive" } },
        { failureReason: { contains: search, mode: "insensitive" } },
        { externalReference: { contains: search, mode: "insensitive" } },
        { user: { name: { contains: search, mode: "insensitive" } } },
        { user: { email: { contains: search, mode: "insensitive" } } },
        ...(Number.isInteger(searchAsNum) && searchAsNum > 0 ? [{ id: searchAsNum }] : []),
      ];
    }

    const [orders, total, pendingStats, processingCount, totalCount] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
          dataPackage: { select: { id: true, name: true } },
          batch: { select: { id: true, batchCode: true } },
          storefrontOrder: {
            select: {
              seq: true,
              paymentReference: true,
              storefront: { select: { name: true, slug: true } },
            },
          },
        },
      }),
      prisma.order.count({ where }),
      prisma.order.aggregate({
        where: { ...baseWhere, status: "PENDING" },
        _count: { id: true },
        _sum: { gbAmount: true, amount: true },
      }),
      prisma.order.count({
        where: { ...baseWhere, status: "PROCESSING" },
      }),
      prisma.order.count({
        where: baseWhere,
      }),
    ]);

    return NextResponse.json({
      isAdhMtnActive,
      mtnProvider: config.enabled ? config.networkRoutes["MTN"] || "MANUAL" : "MANUAL",
      stats: {
        pendingCount: pendingStats._count.id || 0,
        pendingGb: Number((pendingStats._sum.gbAmount || 0).toFixed(2)),
        pendingAmountGhs: Number((pendingStats._sum.amount || 0).toFixed(2)),
        processingCount,
        totalCount,
      },
      orders: orders.map((o) => ({
        id: o.id,
        phoneNumber: o.phoneNumber,
        network: o.network,
        gbAmount: o.gbAmount,
        amount: o.amount,
        status: o.status,
        source: o.source,
        providerReference: o.providerReference,
        failureReason: o.failureReason,
        exportCount: o.exportCount,
        lastExportedAt: o.lastExportedAt?.toISOString() || null,
        lastExportedBy: o.lastExportedBy || null,
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
        packageName: o.dataPackage?.name || null,
        batchCode: o.batch?.batchCode || null,
        user: o.user,
        storefrontOrder: o.storefrontOrder,
      })),
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireStaff();
    const body = await request.json().catch(() => ({}));

    const orderIds: number[] = Array.isArray(body.orderIds)
      ? body.orderIds.map((id: any) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0)
      : body.id
      ? [Number(body.id)].filter((id: number) => Number.isInteger(id) && id > 0)
      : [];

    const nextStatus = typeof body.status === "string" ? body.status.trim() : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : null;

    if (orderIds.length === 0) {
      return apiError(400, "Please select at least one order.");
    }
    if (!nextStatus) {
      return apiError(400, "Target status is required.");
    }

    // Option to clear ADH_REJECTED hold and re-dispatch to ADH Group
    if (nextStatus.toUpperCase() === "RETRY_ADH") {
      await prisma.order.updateMany({
        where: { id: { in: orderIds }, providerReference: { startsWith: "ADH_REJECTED" } },
        data: {
          status: "PENDING",
          providerReference: null,
          failureReason: null,
        },
      });
      const dispatchRes = await dispatchOrdersBatch(orderIds);
      await recordAudit({
        userId: actor.id,
        actorLabel: actor.email,
        action: "adh_rejections.retry",
        target: `orders:${orderIds.join(",")}`,
        newValue: JSON.stringify(dispatchRes),
      });
      return NextResponse.json({
        ok: true,
        retried: true,
        ...dispatchRes,
      });
    }

    let updatedCount = 0;
    const errors: Array<{ orderId: number; error: string }> = [];

    for (const id of orderIds) {
      try {
        const res = await changeOrderStatus(
          id,
          nextStatus,
          reason || `Updated from ADH Rejections queue by ${actor.email}`,
          { id: actor.id, label: actor.email },
          { force: true }
        );
        if (res.changed) updatedCount++;
      } catch (err) {
        errors.push({
          orderId: id,
          error: err instanceof Error ? err.message : "Failed to update status",
        });
      }
    }

    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: "adh_rejections.status_update",
      target: `orders:${orderIds.join(",")}`,
      newValue: JSON.stringify({ status: nextStatus, updatedCount, reason }),
    });

    return NextResponse.json({
      ok: true,
      updatedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
