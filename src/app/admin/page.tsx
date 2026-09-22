import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { getOrderStats, isOrderProcessingHalted } from "@/lib/orders";
import { formatGHS, formatDateTime } from "@/lib/types";
import { orderCode } from "@/lib/utils";
import { PageHeader, StatCard } from "@/components/shared";
import { StatusBadge } from "@/components/status-badge";
import { NetworkStatsCards } from "@/components/admin/network-stats-cards";
import { DashboardAutoRefresh } from "@/components/admin/dashboard-auto-refresh";
import {
  Users,
  ClipboardList,
  CheckCircle2,
  Wallet,
  AlertTriangle,
  TrendingUp,
  Smartphone,
  Ticket,
  Clock,
  ArrowDownLeft,
  ShieldCheck,
  Banknote,
} from "lucide-react";

export default async function AdminDashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [
    stats,
    userCount,
    resellerAgg,
    activeUsers,
    recent,
    halted,
    incomingTodayAgg,
    unclaimedAgg,
    claimedTodayAgg,
    claimsTodayCount,
    activeSignupCodesCount,
    codeRegistrationsCount,
    acceptedMtnCount,
    pendingMtnCount,
    processingMtnCount,
    rejectedMtnCount,
    blockedMtnCount,
    pendingWithdrawalsCount,
  ] = await Promise.all([
    getOrderStats({}),
    prisma.user.count(),
    prisma.user.aggregate({ where: { role: { in: ["RESELLER", "USER"] } }, _sum: { balance: true } }),
    prisma.user.count({ where: { lastLoginAt: { gte: since } } }),
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { user: { select: { name: true, email: true } } },
    }),
    isOrderProcessingHalted(),
    // INCOMING MOMO TODAY
    prisma.incomingMomoTransaction.aggregate({
      where: { createdAt: { gte: startOfDay } },
      _sum: { amount: true },
      _count: { id: true },
    }),
    // UNCLAIMED MOMO
    prisma.incomingMomoTransaction.aggregate({
      where: { status: "AVAILABLE" },
      _sum: { amount: true },
      _count: { id: true },
    }),
    // CLAIMED TODAY
    prisma.incomingMomoTransaction.aggregate({
      where: { status: "CLAIMED", updatedAt: { gte: startOfDay } },
      _sum: { amount: true },
      _count: { id: true },
    }),
    // CLAIMS TODAY
    prisma.sendClaim.count({
      where: { createdAt: { gte: startOfDay } },
    }),
    // ACTIVE SIGNUP CODES
    prisma.signupCode.count({
      where: { status: "ACTIVE" },
    }),
    // CODE REGISTRATIONS
    prisma.signupCodeUsage.count(),
    // MTN NUMBER VERIFICATION (§24)
    prisma.acceptedMtnNumber.count(),
    prisma.mtnVerificationRequest.count({ where: { status: "SUBMITTED" } }),
    prisma.mtnVerificationRequest.count({ where: { status: "PROCESSING" } }),
    prisma.mtnVerificationRequest.count({ where: { status: "REJECTED" } }),
    prisma.blockedMtnNumber.count(),
    prisma.storefrontWithdrawal.count({ where: { status: "PENDING" } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Dashboard"
        description="Platform-wide overview"
        actions={<DashboardAutoRefresh />}
      />

      {halted && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>
            <strong>Order processing is halted.</strong> New orders are blocked for all users.{" "}
            <Link href="/admin/settings" className="underline">
              Resume in Settings
            </Link>
            .
          </span>
        </div>
      )}

      {pendingWithdrawalsCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-200 text-amber-900 dark:bg-amber-500/20 dark:text-amber-300">
              <Banknote className="h-4 w-4 animate-pulse" />
            </span>
            <span>
              <strong>{pendingWithdrawalsCount} storefront withdrawal request{pendingWithdrawalsCount === 1 ? "" : "s"}</strong> awaiting MoMo payout review.
            </span>
          </div>
          <Link
            href="/admin/storefronts/withdrawals"
            className="rounded-xl bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-white shadow hover:bg-amber-500 transition-colors"
          >
            Review &amp; Pay Out →
          </Link>
        </div>
      )}

      {/* Main Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Revenue"
          value={formatGHS(stats.revenue)}
          icon={TrendingUp}
          hint={`${stats.total} orders lifetime`}
        />
        <StatCard title="Total Users" value={String(userCount)} icon={Users} hint={`${activeUsers} active this week`} />
        <StatCard
          title="Reseller Balances"
          value={formatGHS(resellerAgg._sum.balance ?? 0)}
          icon={Wallet}
        />
        <StatCard
          title="Successful Orders"
          value={String(stats.success)}
          icon={CheckCircle2}
          hint={`${stats.failed} failed · ${stats.pending + stats.processing} open`}
        />
      </div>

      {/* Send & Claim MoMo + Signup Codes Section (§46) */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
            Mobile Money &amp; Signup Codes Overview
          </h2>
          <div className="flex gap-3 text-xs">
            <Link href="/admin/billing?tab=incoming" className="text-brand-600 hover:underline dark:text-brand-400">
              Incoming MoMo →
            </Link>
            <Link href="/admin/users/signup-codes" className="text-brand-600 hover:underline dark:text-brand-400">
              Signup Codes →
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <StatCard
            title="Incoming MoMo Today"
            value={formatGHS(incomingTodayAgg._sum.amount ?? 0)}
            icon={Smartphone}
            hint={`${incomingTodayAgg._count.id} received`}
          />
          <StatCard
            title="Unclaimed"
            value={formatGHS(unclaimedAgg._sum.amount ?? 0)}
            icon={Clock}
            hint={`${unclaimedAgg._count.id} available`}
          />
          <StatCard
            title="Claimed Today"
            value={formatGHS(claimedTodayAgg._sum.amount ?? 0)}
            icon={CheckCircle2}
            hint={`${claimedTodayAgg._count.id} settled`}
          />
          <StatCard
            title="Claims Today"
            value={String(claimsTodayCount)}
            icon={ArrowDownLeft}
            hint="User submissions"
          />
          <StatCard
            title="Active Signup Codes"
            value={String(activeSignupCodesCount)}
            icon={Ticket}
          />
          <StatCard
            title="Code Registrations"
            value={String(codeRegistrationsCount)}
            icon={Users}
            hint="Total invited users"
          />
        </div>
      </div>

      {/* MTN Number Verification (§24) */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
            MTN Number Verification
          </h2>
          <div className="flex gap-3 text-xs">
            <Link href="/admin/mtn-verification" className="text-brand-600 hover:underline dark:text-brand-400 font-medium">
              Manage Verification →
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          <StatCard
            title="Accepted Numbers"
            value={acceptedMtnCount.toLocaleString()}
            icon={CheckCircle2}
            hint="Active whitelist"
          />
          <StatCard
            title="Pending Verification"
            value={pendingMtnCount.toLocaleString()}
            icon={Clock}
            hint="Awaiting batching"
          />
          <StatCard
            title="Processing"
            value={processingMtnCount.toLocaleString()}
            icon={Smartphone}
            hint="In verification batches"
          />
          <StatCard
            title="Rejected"
            value={rejectedMtnCount.toLocaleString()}
            icon={AlertTriangle}
            hint="Failed verification"
          />
          <StatCard
            title="Unverified / Blocked"
            value={blockedMtnCount.toLocaleString()}
            icon={Users}
            hint="Ordered when OFF"
          />
        </div>
      </div>

      <NetworkStatsCards />

      <div className="rounded-2xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h2 className="text-sm font-semibold">Latest Orders (all users)</h2>
          <Link href="/admin/orders" className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400">
            Manage orders
          </Link>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {recent.map((o) => (
            <div key={o.id} className="flex items-center gap-3 px-5 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {o.phoneNumber} · {o.gbAmount}GB {o.network}
                </p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {orderCode(o.id)} · {o.user.name} ({o.user.email}) · {formatDateTime(o.createdAt)}
                </p>
              </div>
              <span className="font-semibold">{formatGHS(o.amount)}</span>
              <StatusBadge status={o.status} />
            </div>
          ))}
          {recent.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-slate-500">No orders yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
