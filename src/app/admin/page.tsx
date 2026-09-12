import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrderStats, isOrderProcessingHalted } from "@/lib/orders";
import { formatGHS, formatDateTime } from "@/lib/types";
import { orderCode } from "@/lib/utils";
import { PageHeader, StatCard } from "@/components/shared";
import { StatusBadge } from "@/components/status-badge";
import { NetworkStatsCards } from "@/components/admin/network-stats-cards";
import {
  Users,
  ClipboardList,
  CheckCircle2,
  Wallet,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";

export default async function AdminDashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [stats, userCount, resellerAgg, activeUsers, recent, halted] = await Promise.all([
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
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Admin Dashboard" description="Platform-wide overview" />

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
