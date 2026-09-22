import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { storefrontWithdrawalReviewSchema } from "@/lib/validation";
import { approveWithdrawal, rejectWithdrawal, fromPesewas } from "@/lib/storefront";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/** Admin: List storefront withdrawals with search, filters, pagination, and overview statistics. */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "25", 10)));
    const status = searchParams.get("status") || "ALL";
    const network = searchParams.get("network") || "ALL";
    const search = searchParams.get("search")?.trim() || "";

    const where: Prisma.StorefrontWithdrawalWhereInput = {};

    if (status !== "ALL") {
      where.status = status;
    }

    if (network !== "ALL") {
      where.network = network;
    }

    if (search) {
      const searchNum = parseInt(search.replace(/^CF-WD-0*/i, ""), 10);
      where.OR = [
        { momoNumber: { contains: search, mode: "insensitive" } },
        { accountName: { contains: search, mode: "insensitive" } },
        { reference: { contains: search, mode: "insensitive" } },
        { user: { name: { contains: search, mode: "insensitive" } } },
        { user: { email: { contains: search, mode: "insensitive" } } },
        ...(isNaN(searchNum) ? [] : [{ seq: searchNum }]),
      ];
    }

    const [
      total,
      withdrawals,
      pendingAgg,
      approvedAgg,
      rejectedCount,
      totalFeeAgg,
    ] = await Promise.all([
      prisma.storefrontWithdrawal.count({ where }),
      prisma.storefrontWithdrawal.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              storefront: {
                select: {
                  slug: true,
                  name: true,
                  status: true,
                },
              },
            },
          },
        },
        orderBy: [{ status: "asc" }, { requestedAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      // Stats
      prisma.storefrontWithdrawal.aggregate({
        where: { status: "PENDING" },
        _count: { id: true },
        _sum: { amount: true, fee: true, netAmount: true },
      }),
      prisma.storefrontWithdrawal.aggregate({
        where: { status: "APPROVED" },
        _count: { id: true },
        _sum: { amount: true, fee: true, netAmount: true },
      }),
      prisma.storefrontWithdrawal.count({
        where: { status: "REJECTED" },
      }),
      prisma.storefrontWithdrawal.aggregate({
        where: { status: "APPROVED" },
        _sum: { fee: true },
      }),
    ]);

    const formattedWithdrawals = withdrawals.map((w) => {
      const fee = w.fee ?? 100;
      const netAmount = w.netAmount ?? Math.max(0, w.amount - fee);
      return {
        id: w.id,
        seq: w.seq,
        reference: w.reference ?? `CF-WD-${String(w.seq).padStart(5, "0")}`,
        userId: w.userId,
        userName: w.user.name,
        userEmail: w.user.email,
        storefrontSlug: w.user.storefront?.slug ?? null,
        storefrontName: w.user.storefront?.name ?? null,
        storefrontStatus: w.user.storefront?.status ?? null,
        amount: w.amount, // pesewas
        fee, // pesewas
        netAmount, // pesewas
        amountGHS: fromPesewas(w.amount),
        feeGHS: fromPesewas(fee),
        netAmountGHS: fromPesewas(netAmount),
        network: w.network,
        momoNumber: w.momoNumber,
        accountName: w.accountName,
        status: w.status,
        note: w.note,
        adminNote: w.adminNote,
        processedBy: w.processedBy,
        requestedAt: w.requestedAt,
        processedAt: w.processedAt,
      };
    });

    return NextResponse.json({
      withdrawals: formattedWithdrawals,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      stats: {
        pendingCount: pendingAgg._count.id ?? 0,
        pendingAmountGHS: fromPesewas(pendingAgg._sum.amount ?? 0),
        pendingNetAmountGHS: fromPesewas(pendingAgg._sum.netAmount ?? Math.max(0, (pendingAgg._sum.amount ?? 0) - (pendingAgg._sum.fee ?? 0))),
        approvedCount: approvedAgg._count.id ?? 0,
        approvedAmountGHS: fromPesewas(approvedAgg._sum.amount ?? 0),
        approvedNetAmountGHS: fromPesewas(approvedAgg._sum.netAmount ?? Math.max(0, (approvedAgg._sum.amount ?? 0) - (approvedAgg._sum.fee ?? 0))),
        rejectedCount,
        totalFeeCollectedGHS: fromPesewas(totalFeeAgg._sum.fee ?? 0),
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

/** Admin: Approve or Reject a storefront withdrawal */
export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const input = storefrontWithdrawalReviewSchema.parse(body);
    const { id } = body as { id?: string };
    if (!id) return apiError(400, "Withdrawal ID is required");

    const withdrawal =
      input.action === "APPROVE"
        ? await approveWithdrawal(id, input.adminNote || undefined, admin.email || admin.id)
        : await rejectWithdrawal(id, input.adminNote || undefined, admin.email || admin.id);

    return NextResponse.json({
      success: true,
      withdrawal,
      action: input.action,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
