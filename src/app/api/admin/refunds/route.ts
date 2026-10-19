import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";
import { storefrontOrderCode } from "@/lib/storefront";

export async function GET(request: NextRequest) {
  try {
    await requireStaff();

    const { searchParams } = new URL(request.url);
    const source = (searchParams.get("source") || "ALL").toUpperCase();
    const network = (searchParams.get("network") || "ALL").toUpperCase();
    const search = searchParams.get("search")?.trim() || "";
    const startDate = searchParams.get("startDate")?.trim() || "";
    const endDate = searchParams.get("endDate")?.trim() || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const skip = (page - 1) * limit;

    // Base condition: Order must be REFUNDED
    const where: any = {
      status: "REFUNDED",
    };

    // Source filtering
    if (source === "STOREFRONT") {
      where.OR = [
        { source: "STOREFRONT" },
        { storefrontOrder: { isNot: null } },
      ];
    } else if (source === "WEB" || source === "DIRECT") {
      where.source = "WEB";
      where.storefrontOrder = null;
    } else if (source === "API") {
      where.source = "API";
      where.storefrontOrder = null;
    }

    // Network filtering
    if (network && network !== "ALL") {
      where.network = network;
    }

    // Date range filtering
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        const [y, m, d] = startDate.split("-").map(Number);
        where.createdAt.gte = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
      }
      if (endDate) {
        const [y, m, d] = endDate.split("-").map(Number);
        where.createdAt.lte = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
      }
    }

    // Search query
    if (search) {
      const searchConditions: any[] = [
        { phoneNumber: { contains: search, mode: "insensitive" } },
        { externalReference: { contains: search, mode: "insensitive" } },
        { providerReference: { contains: search, mode: "insensitive" } },
        { failureReason: { contains: search, mode: "insensitive" } },
        {
          storefrontOrder: {
            OR: [
              { paymentReference: { contains: search, mode: "insensitive" } },
              { customerPhone: { contains: search, mode: "insensitive" } },
              { customerEmail: { contains: search, mode: "insensitive" } },
              { storefront: { name: { contains: search, mode: "insensitive" } } },
              { storefront: { slug: { contains: search, mode: "insensitive" } } },
            ],
          },
        },
        {
          user: {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { phone: { contains: search, mode: "insensitive" } },
            ],
          },
        },
      ];

      const searchAsNum = parseInt(search.replace(/\D/g, ""), 10);
      if (Number.isInteger(searchAsNum) && searchAsNum > 0) {
        searchConditions.push({ id: searchAsNum });
        searchConditions.push({ storefrontOrder: { seq: searchAsNum } });
      }

      if (where.OR) {
        where.AND = [
          { OR: where.OR },
          { OR: searchConditions },
        ];
        delete where.OR;
      } else {
        where.OR = searchConditions;
      }
    }

    // Fetch total matching count & paginated records
    const [totalCount, orders, allRefundedOrders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
          storefrontOrder: {
            select: {
              id: true,
              seq: true,
              paymentReference: true,
              customerPhone: true,
              customerEmail: true,
              sellingPrice: true,
              productCost: true,
              commission: true,
              status: true,
              commissionState: true,
              paidAt: true,
              storefront: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
          },
          history: {
            select: {
              status: true,
              note: true,
              changedBy: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
            take: 3,
          },
        },
      }),
      // Query global refunded stats
      prisma.order.findMany({
        where: { status: "REFUNDED" },
        select: {
          id: true,
          amount: true,
          source: true,
          storefrontOrder: {
            select: {
              paymentReference: true,
              sellingPrice: true,
            },
          },
        },
      }),
    ]);

    // Compute stats
    let totalRefundedCount = allRefundedOrders.length;
    let storefrontRefundedCount = 0;
    let directRefundedCount = 0;
    let totalAmountGhs = 0;
    let storefrontAmountGhs = 0;

    for (const ord of allRefundedOrders) {
      totalAmountGhs += ord.amount || 0;
      if (ord.source === "STOREFRONT" || Boolean(ord.storefrontOrder)) {
        storefrontRefundedCount++;
        storefrontAmountGhs += ord.storefrontOrder?.sellingPrice
          ? ord.storefrontOrder.sellingPrice / 100
          : ord.amount || 0;
      } else {
        directRefundedCount++;
      }
    }

    // Format orders for the frontend
    const formattedOrders = orders.map((o) => {
      const isStorefront = o.source === "STOREFRONT" || Boolean(o.storefrontOrder);
      const paystackRef = o.storefrontOrder?.paymentReference || (isStorefront ? o.externalReference : null);
      const sfCode = o.storefrontOrder?.seq ? storefrontOrderCode(o.storefrontOrder.seq, null) : null;
      const latestHistory = o.history && o.history.length > 0 ? o.history[0] : null;

      return {
        id: o.id,
        orderCode: `#${o.id}`,
        phoneNumber: o.phoneNumber,
        network: o.network,
        gbAmount: o.gbAmount,
        amount: o.amount,
        status: o.status,
        source: isStorefront ? "STOREFRONT" : o.source,
        isStorefront,
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
        failureReason: o.failureReason,
        providerReference: o.providerReference,
        externalReference: o.externalReference,
        paystackReference: paystackRef,
        storefrontCode: sfCode,
        storefront: o.storefrontOrder?.storefront
          ? {
              id: o.storefrontOrder.storefront.id,
              name: o.storefrontOrder.storefront.name,
              slug: o.storefrontOrder.storefront.slug,
            }
          : null,
        storefrontOrder: o.storefrontOrder
          ? {
              seq: o.storefrontOrder.seq,
              sellingPriceGhs: o.storefrontOrder.sellingPrice / 100,
              commissionGhs: o.storefrontOrder.commission / 100,
              customerPhone: o.storefrontOrder.customerPhone,
              customerEmail: o.storefrontOrder.customerEmail,
              commissionState: o.storefrontOrder.commissionState,
              paidAt: o.storefrontOrder.paidAt?.toISOString() || null,
            }
          : null,
        user: o.user
          ? {
              id: o.user.id,
              name: o.user.name,
              email: o.user.email,
              phone: o.user.phone,
            }
          : null,
        latestHistoryNote: latestHistory?.note || null,
        refundedBy: latestHistory?.changedBy || null,
        refundedAt: latestHistory?.createdAt?.toISOString() || o.updatedAt.toISOString(),
      };
    });

    // Also collect all Paystack references from the currently filtered orders for quick bulk copying
    const filteredStorefrontRefs = formattedOrders
      .filter((o) => o.isStorefront && o.paystackReference)
      .map((o) => o.paystackReference as string);

    return NextResponse.json({
      success: true,
      orders: formattedOrders,
      filteredStorefrontRefs: Array.from(new Set(filteredStorefrontRefs)),
      stats: {
        totalRefunded: totalRefundedCount,
        storefrontRefunded: storefrontRefundedCount,
        directRefunded: directRefundedCount,
        totalAmountGhs: Number(totalAmountGhs.toFixed(2)),
        storefrontAmountGhs: Number(storefrontAmountGhs.toFixed(2)),
      },
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
