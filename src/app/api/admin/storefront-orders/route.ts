import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";
import { storefrontOrderCode } from "@/lib/storefront";

/**
 * Admin: list StorefrontOrder rows (public storefront sales).
 * These include PENDING orders where the buyer hasn't paid yet —
 * which have no underlying Order row and therefore never appear in
 * the regular /api/admin/orders endpoint.
 */
export async function GET(request: NextRequest) {
  try {
    await requireStaff();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));
    const status = searchParams.get("status");
    const q = searchParams.get("q"); // phone number or payment reference search

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (q) {
      where.OR = [
        { customerPhone: { contains: q } },
        { paymentReference: { contains: q.toUpperCase() } },
        { storefront: { is: { name: { contains: q } } } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.storefrontOrder.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          storefront: { select: { name: true, slug: true } },
          product: { include: { dataPackage: { select: { network: true, gbAmount: true } } } },
          underlyingOrder: { select: { status: true } },
        },
      }),
      prisma.storefrontOrder.count({ where }),
    ]);

    return NextResponse.json({
      data: data.map((o) => {
        let displayStatus = o.status;
        if (o.underlyingOrder) {
          displayStatus = o.underlyingOrder.status === "SUCCESS" ? "COMPLETED" : o.underlyingOrder.status;
        }
        return {
          id: o.id,
          seq: o.seq,
          code: storefrontOrderCode(o.seq, o.paymentReference),
          paymentReference: o.paymentReference,
          storeName: o.storefront.name,
          storeSlug: o.storefront.slug,
          customerPhone: o.customerPhone,
          network: o.product.dataPackage.network,
          gbAmount: o.product.dataPackage.gbAmount,
          sellingPrice: o.sellingPrice, // pesewas
          status: displayStatus,
          commissionState: o.commissionState,
          underlyingOrderId: o.underlyingOrderId,
          paidAt: o.paidAt?.toISOString() ?? null,
          createdAt: o.createdAt.toISOString(),
        };
      }),
      total,
      page,
      pageSize,
      pages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
