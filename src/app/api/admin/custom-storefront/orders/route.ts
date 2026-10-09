import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";
import { ensureAdminCustomStorefront } from "@/lib/storefront";

/**
 * Admin: List storefront orders specifically belonging to the data-deals.com storefront
 */
export async function GET(request: NextRequest) {
  try {
    await requireStaff();
    const storefront = await ensureAdminCustomStorefront();
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));
    const status = searchParams.get("status");
    const q = searchParams.get("q");

    const where: Record<string, unknown> = {
      storefrontId: storefront.id,
    };

    if (status === "AWAITING_PAYMENT") {
      where.underlyingOrderId = null;
    } else if (status === "PENDING") {
      where.underlyingOrderId = { not: null };
      where.status = "PENDING";
    } else if (status && status !== "ALL") {
      where.status = status;
    }

    if (q) {
      where.OR = [
        { customerPhone: { contains: q } },
        { customerEmail: { contains: q, mode: "insensitive" } },
        { paymentReference: { contains: q.toUpperCase() } },
      ];
    }

    // Eliminate any trace of past data-deals orders for customers allocated/associated with Lofaq Data Hub
    const { getLofaqCustomerIdentifiers } = await import("@/lib/order-allocation");
    const { phones: lofaqPhones, emails: lofaqEmails } = await getLofaqCustomerIdentifiers();

    if (lofaqPhones.length > 0 || lofaqEmails.length > 0) {
      const excludeConditions: Record<string, unknown>[] = [];
      if (lofaqPhones.length > 0) {
        excludeConditions.push({ customerPhone: { in: lofaqPhones } });
      }
      if (lofaqEmails.length > 0) {
        excludeConditions.push({ customerEmail: { in: lofaqEmails, mode: "insensitive" } });
      }
      where.NOT = {
        OR: excludeConditions,
      };
    }

    const [data, total] = await Promise.all([
      prisma.storefrontOrder.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          product: {
            include: {
              dataPackage: { select: { network: true, gbAmount: true, name: true } },
            },
          },
        },
      }),
      prisma.storefrontOrder.count({ where }),
    ]);

    const formattedOrders = data.map((o) => ({
      id: o.id,
      seq: o.seq,
      code: `DD-${String(o.seq).padStart(5, "0")}`,
      paymentReference: o.paymentReference,
      storeName: storefront.name,
      storeSlug: storefront.slug,
      customerPhone: o.customerPhone,
      customerEmail: o.customerEmail,
      network: o.product.dataPackage.network,
      gbAmount: o.product.dataPackage.gbAmount,
      packageName: o.product.dataPackage.name,
      sellingPrice: o.sellingPrice,
      productCost: o.productCost,
      commission: o.commission,
      status: o.status,
      commissionState: o.commissionState,
      underlyingOrderId: o.underlyingOrderId,
      paidAt: o.paidAt?.toISOString() ?? null,
      createdAt: o.createdAt.toISOString(),
    }));

    return NextResponse.json({
      orders: formattedOrders,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
