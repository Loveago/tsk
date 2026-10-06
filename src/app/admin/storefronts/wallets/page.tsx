import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { fromPesewas } from "@/lib/storefront";
import { Store, Banknote, Wallet, AlertCircle } from "lucide-react";
import {
  AdminStorefrontWalletsTracker,
  type StorefrontWalletRow,
  type StorefrontWalletsOverview,
} from "@/components/admin/admin-storefront-wallets-tracker";

export const dynamic = "force-dynamic";

export default async function AdminStorefrontWalletsPage() {
  await requireAdmin();

  const [users, pendingWithdrawalsCount] = await Promise.all([
    prisma.user.findMany({
      where: {
        OR: [
          { storefronts: { some: {} } },
          { storefrontWallet: { isNot: null } },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
        storefronts: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            isActive: true,
            isCustomDomain: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
        storefrontWallet: {
          select: {
            id: true,
            balance: true,
            pendingBalance: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: { transactions: true },
            },
          },
        },
        storefrontWithdrawals: {
          select: {
            id: true,
            amount: true,
            status: true,
            requestedAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.storefrontWithdrawal.count({ where: { status: "PENDING" } }),
  ]);

  const initialWallets: StorefrontWalletRow[] = users.map((u) => {
    const primaryStorefront =
      u.storefronts.find((s) => !s.isCustomDomain) || u.storefronts[0] || null;
    const balance = u.storefrontWallet?.balance ?? 0;
    const pendingBalance = u.storefrontWallet?.pendingBalance ?? 0;

    const approvedWithdrawals = u.storefrontWithdrawals
      .filter((w) => w.status === "APPROVED")
      .reduce((sum, w) => sum + w.amount, 0);

    const pendingWithdrawalsList = u.storefrontWithdrawals.filter((w) => w.status === "PENDING");
    const pendingWithdrawalsAmount = pendingWithdrawalsList.reduce((sum, w) => sum + w.amount, 0);
    const pendingWithdrawalsCountForUser = pendingWithdrawalsList.length;

    const lifetimeEarned = balance + pendingBalance + approvedWithdrawals;

    return {
      userId: u.id,
      userName: u.name,
      userEmail: u.email,
      userPhone: u.phone,
      userStatus: u.status,
      userCreatedAt: u.createdAt.toISOString(),
      storefront: primaryStorefront
        ? {
            id: primaryStorefront.id,
            name: primaryStorefront.name,
            slug: primaryStorefront.slug,
            status: primaryStorefront.status,
            isActive: primaryStorefront.isActive,
          }
        : null,
      walletId: u.storefrontWallet?.id ?? null,
      balance,
      pendingBalance,
      balanceGHS: fromPesewas(balance),
      pendingBalanceGHS: fromPesewas(pendingBalance),
      totalWithdrawn: approvedWithdrawals,
      totalWithdrawnGHS: fromPesewas(approvedWithdrawals),
      pendingWithdrawalsCount: pendingWithdrawalsCountForUser,
      pendingWithdrawalsAmount,
      pendingWithdrawalsAmountGHS: fromPesewas(pendingWithdrawalsAmount),
      lifetimeEarned,
      lifetimeEarnedGHS: fromPesewas(lifetimeEarned),
      transactionsCount: u.storefrontWallet?._count.transactions ?? 0,
      walletUpdatedAt: u.storefrontWallet?.updatedAt?.toISOString() ?? null,
    };
  });

  const initialOverview: StorefrontWalletsOverview = {
    totalWallets: initialWallets.length,
    totalBalanceGHS: fromPesewas(initialWallets.reduce((s, w) => s + w.balance, 0)),
    totalPendingBalanceGHS: fromPesewas(initialWallets.reduce((s, w) => s + w.pendingBalance, 0)),
    totalWithdrawnGHS: fromPesewas(initialWallets.reduce((s, w) => s + w.totalWithdrawn, 0)),
    totalLifetimeEarnedGHS: fromPesewas(initialWallets.reduce((s, w) => s + w.lifetimeEarned, 0)),
    pendingWithdrawalsCount: initialWallets.reduce((s, w) => s + w.pendingWithdrawalsCount, 0),
    pendingWithdrawalsAmountGHS: fromPesewas(initialWallets.reduce((s, w) => s + w.pendingWithdrawalsAmount, 0)),
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Storefront Wallets</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Track reseller commission balances, monitor in-flight pending earnings, inspect ledger audit trails, and perform manual adjustments.
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 overflow-x-auto whitespace-nowrap">
          <Link
            href="/admin/storefronts"
            className="flex items-center gap-2 border-b-2 border-transparent px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <Store className="h-4 w-4" />
            <span>Storefronts &amp; Resellers</span>
          </Link>
          <Link
            href="/admin/storefronts/wallets"
            className="flex items-center gap-2 border-b-2 border-brand-600 px-3 py-2 text-sm font-semibold text-brand-600 dark:border-brand-400 dark:text-brand-400"
          >
            <Wallet className="h-4 w-4" />
            <span>Storefront Wallets</span>
          </Link>
          <Link
            href="/admin/storefronts/withdrawals"
            className="flex items-center gap-2 border-b-2 border-transparent px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <Banknote className="h-4 w-4" />
            <span>Withdrawals</span>
            {pendingWithdrawalsCount > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                {pendingWithdrawalsCount}
              </span>
            )}
          </Link>
        </div>
      </header>

      {/* Alert Banner for pending withdrawals if any */}
      {pendingWithdrawalsCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-200 text-amber-900 dark:bg-amber-500/20 dark:text-amber-300">
              <AlertCircle className="h-5 w-5 animate-pulse" />
            </span>
            <div>
              <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
                {pendingWithdrawalsCount} Reseller Withdrawal{pendingWithdrawalsCount === 1 ? "" : "s"} Awaiting Payout
              </p>
              <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
                Storefront users have requested MoMo payouts against their available wallet balances.
              </p>
            </div>
          </div>
          <Link
            href="/admin/storefronts/withdrawals"
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-amber-500 transition-colors"
          >
            Review Withdrawals ({pendingWithdrawalsCount}) →
          </Link>
        </div>
      )}

      {/* Main Wallets Tracker View */}
      <AdminStorefrontWalletsTracker
        initialWallets={initialWallets}
        initialOverview={initialOverview}
      />
    </div>
  );
}
