import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";
import { getGeminiProSettings, updateGeminiProSettings } from "@/lib/gemini-pro";
import { z } from "zod";

const updateSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  price: z.number().positive().optional(),
});

/**
 * GET: Fetch Gemini Pro orders for admin review with search & pagination
 */
export async function GET(request: NextRequest) {
  try {
    await requireStaff();
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));
    const paymentStatus = searchParams.get("paymentStatus");
    const fulfillmentStatus = searchParams.get("fulfillmentStatus");
    const q = searchParams.get("q");

    const where: Record<string, unknown> = {};

    if (paymentStatus && paymentStatus !== "ALL") {
      where.paystackStatus = paymentStatus;
    }

    if (fulfillmentStatus && fulfillmentStatus !== "ALL") {
      where.fulfillmentStatus = fulfillmentStatus;
    }

    if (q) {
      where.OR = [
        { customerEmail: { contains: q, mode: "insensitive" } },
        { customerWhatsapp: { contains: q } },
        { paymentReference: { contains: q.toUpperCase() } },
      ];
    }

    const [orders, total, totalPaidCount, pendingFulfillmentCount, revenueAgg, settings] =
      await Promise.all([
        prisma.geminiProOrder.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.geminiProOrder.count({ where }),
        prisma.geminiProOrder.count({ where: { paystackStatus: "PAID" } }),
        prisma.geminiProOrder.count({
          where: { paystackStatus: "PAID", fulfillmentStatus: "PENDING" },
        }),
        prisma.geminiProOrder.aggregate({
          where: { paystackStatus: "PAID" },
          _sum: { amount: true },
        }),
        getGeminiProSettings(),
      ]);

    const formatted = orders.map((o) => ({
      id: o.id,
      seq: o.seq,
      code: `GMP-${String(o.seq).padStart(5, "0")}`,
      customerEmail: o.customerEmail,
      customerWhatsapp: o.customerWhatsapp,
      amount: o.amount,
      paymentReference: o.paymentReference,
      paystackStatus: o.paystackStatus,
      fulfillmentStatus: o.fulfillmentStatus,
      activationLink: o.activationLink,
      adminNotes: o.adminNotes,
      paidAt: o.paidAt?.toISOString() ?? null,
      sentAt: o.sentAt?.toISOString() ?? null,
      createdAt: o.createdAt.toISOString(),
    }));

    return NextResponse.json({
      orders: formatted,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      stats: {
        totalOrders: total,
        totalPaid: totalPaidCount,
        pendingFulfillment: pendingFulfillmentCount,
        totalRevenue: revenueAgg._sum.amount ?? 0,
      },
      settings,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * PATCH: Update Gemini Pro settings (enabled toggle, price)
 */
export async function PATCH(request: NextRequest) {
  try {
    await requireStaff();
    const body = await request.json();
    const input = updateSettingsSchema.parse(body);

    const updated = await updateGeminiProSettings(input);
    return NextResponse.json({ success: true, settings: updated });
  } catch (err) {
    return handleRouteError(err);
  }
}
