import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { fromPesewas } from "@/lib/storefront";
import { AdminWithdrawalsView } from "@/components/admin/admin-withdrawals-view";
import { Store, Banknote } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminStorefrontWithdrawalsPage() {
  await requireAdmin();

  const [
    withdrawals,
    pendingAgg,
    approvedAgg,
    rejectedCount,
    totalFeeAgg,
  ] = await Promise.all([
    prisma.storefrontWithdrawal.findMany({
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
      take: 50,
    }),
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
      amount: w.amount,
      fee,
      netAmount,
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
      requestedAt: w.requestedAt.toISOString(),
      processedAt: w.processedAt?.toISOString() ?? null,
    };
  });

  const pendingCount = pendingAgg._count.id ?? 0;
  const stats = {
    pendingCount,
    pendingAmountGHS: fromPesewas(pendingAgg._sum.amount ?? 0),
    pendingNetAmountGHS: fromPesewas(
      pendingAgg._sum.netAmount ?? Math.max(0, (pendingAgg._sum.amount ?? 0) - (pendingAgg._sum.fee ?? 0))
    ),
    approvedCount: approvedAgg._count.id ?? 0,
    approvedAmountGHS: fromPesewas(approvedAgg._sum.amount ?? 0),
    approvedNetAmountGHS: fromPesewas(
      approvedAgg._sum.netAmount ?? Math.max(0, (approvedAgg._sum.amount ?? 0) - (approvedAgg._sum.fee ?? 0))
    ),
    rejectedCount,
    totalFeeCollectedGHS: fromPesewas(totalFeeAgg._sum.fee ?? 0),
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header and Sub-Navigation */}
      <header className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Storefront Withdrawals</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Manage reseller commission payouts, verify MoMo numbers, and disburse funds with automatic GHS 1.00 fee deduction.
            </p>
          </div>
        </div>

        {/* Section Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
          <Link
            href="/admin/storefronts"
            className="flex items-center gap-2 border-b-2 border-transparent px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <Store className="h-4 w-4" />
            <span>Storefronts &amp; Resellers</span>
          </Link>
          <Link
            href="/admin/storefronts/withdrawals"
            className="flex items-center gap-2 border-b-2 border-brand-600 px-3 py-2 text-sm font-semibold text-brand-600 dark:border-brand-400 dark:text-brand-400"
          >
            <Banknote className="h-4 w-4" />
            <span>Withdrawals</span>
            {pendingCount > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                {pendingCount}
              </span>
            )}
          </Link>
        </div>
      </header>

      {/* Main Table & Management View */}
      <AdminWithdrawalsView
        initialWithdrawals={formattedWithdrawals}
        initialStats={stats}
      />
    </div>
  );
}
