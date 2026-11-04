"use client";

import * as React from "react";
import { PageHeader, Spinner, StatCard } from "@/components/shared";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { formatGHS } from "@/lib/types";
import { FileBarChart, TrendingUp, ClipboardList, Users } from "lucide-react";
import {
  ReportDatePicker,
  ReportDateFilterValue,
  getDefaultReportRange,
  ReportGranularity,
} from "@/components/admin/report-date-picker";

interface ReportData {
  statusCounts: Record<string, number>;
  totalOrders: number;
  totalRevenue: number;
  daily: { day: string; count: number; amount: number }[];
  byPackage: { network: string; gbAmount: number; count: number; amount: number }[];
  topUsers: { id: string; name: string; email: string; orders: number; spend: number }[];
  granularity?: ReportGranularity;
}

function formatDayAxis(dayStr: string): string {
  if (!dayStr) return "";
  // Hourly format: "14:00"
  if (/^\d{2}:\d{2}$/.test(dayStr)) return dayStr;
  // Monthly format: "2026-10"
  if (/^\d{4}-\d{2}$/.test(dayStr)) {
    const [y, m] = dayStr.split("-").map(Number);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  }
  // Daily format: "2026-10-15"
  if (/^\d{4}-\d{2}-\d{2}$/.test(dayStr)) {
    const [y, m, dNum] = dayStr.split("-").map(Number);
    const d = new Date(y, m - 1, dNum);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return dayStr;
}

export default function AdminReportsPage() {
  const [data, setData] = React.useState<ReportData | null>(null);
  const [filter, setFilter] = React.useState<ReportDateFilterValue>(getDefaultReportRange);
  const [granularity, setGranularity] = React.useState<ReportGranularity>("daily");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchReports = React.useCallback(async (activeFilter: ReportDateFilterValue) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        from: activeFilter.from.toISOString(),
        to: activeFilter.to.toISOString(),
      });
      if (activeFilter.granularity) {
        params.set("granularity", activeFilter.granularity);
      }
      const r = await fetch(`/api/admin/reports?${params.toString()}`);
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "Failed to load reports data");
      setData({
        statusCounts: json.statusCounts ?? {},
        totalOrders: json.totalOrders ?? 0,
        totalRevenue: json.totalRevenue ?? 0,
        daily: json.daily ?? [],
        byPackage: json.byPackage ?? [],
        topUsers: json.topUsers ?? [],
        granularity: json.granularity,
      });
      if (json.granularity) {
        setGranularity(json.granularity);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load reports data");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchReports(filter);
  }, [filter, fetchReports]);

  if (loading && !data) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-6 w-6 text-brand-600" />
      </div>
    );
  }

  const safeData = data ?? {
    statusCounts: {},
    totalOrders: 0,
    totalRevenue: 0,
    daily: [],
    byPackage: [],
    topUsers: [],
  };

  const daily = (safeData.daily ?? []).map((d) => ({ ...d, amount: Number(d.amount) }));
  const successRate =
    safeData.totalOrders > 0
      ? Math.round(((safeData.statusCounts?.SUCCESS ?? 0) / safeData.totalOrders) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Platform-wide order analytics"
        actions={
          <div className="flex items-center gap-2">
            {loading && data && (
              <Spinner className="h-4 w-4 text-brand-600 animate-spin" />
            )}
            <ReportDatePicker value={filter} onChange={setFilter} />
          </div>
        }
      />

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          <p className="font-semibold">{error}</p>
          <button
            onClick={() => fetchReports(filter)}
            className="mt-3 inline-flex items-center rounded-xl bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 cursor-pointer"
          >
            Try Again
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard title="Orders" value={String(safeData.totalOrders)} icon={ClipboardList} />
            <StatCard title="Revenue" value={formatGHS(safeData.totalRevenue)} icon={TrendingUp} />
            <StatCard title="Success rate" value={`${successRate}%`} icon={FileBarChart} />
            <StatCard
              title="Active buyers"
              value={String(safeData.topUsers.length)}
              icon={Users}
              hint="Top spenders in range"
            />
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {granularity === "hourly"
                  ? "Hourly orders & revenue"
                  : granularity === "monthly"
                  ? "Monthly orders & revenue"
                  : "Daily orders & revenue"}
              </h3>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {filter.label} {filter.subLabel ? `• ${filter.subLabel}` : ""}
              </span>
            </div>

            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(148 163 184 / 0.2)" />
                  <XAxis
                    dataKey="day"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={formatDayAxis}
                  />
                  <YAxis yAxisId="left" fontSize={11} tickLine={false} />
                  <YAxis yAxisId="right" orientation="right" fontSize={11} tickLine={false} />
                  <Tooltip
                    labelFormatter={(lbl) => formatDayAxis(String(lbl))}
                    formatter={(val, name) => [
                      name === "Revenue (GHS)" ? formatGHS(Number(val)) : val,
                      name,
                    ]}
                  />
                  <Legend />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="count"
                    name="Orders"
                    stroke="#2563EB"
                    strokeWidth={2}
                    dot={daily.length <= 31}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="amount"
                    name="Revenue (GHS)"
                    stroke="#10B981"
                    strokeWidth={2}
                    dot={daily.length <= 31}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-100 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="mb-4 text-sm font-semibold">Orders by package</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={safeData.byPackage.map((b) => ({
                      name: `${b.network} ${b.gbAmount}GB`,
                      count: b.count,
                    }))}
                    layout="vertical"
                  >
                    <XAxis type="number" fontSize={11} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={90} fontSize={10} tickLine={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#2563EB" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="mb-4 text-sm font-semibold">Top users by spend</h3>
              {safeData.topUsers.length === 0 ? (
                <p className="text-sm text-slate-500">No orders in this range.</p>
              ) : (
                <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
                  {safeData.topUsers.map((u, i) => (
                    <li key={u.id} className="flex items-center gap-3 py-2.5">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{u.name}</p>
                        <p className="truncate text-xs text-slate-500">{u.email}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{formatGHS(u.spend)}</p>
                        <p className="text-xs text-slate-500">{u.orders} orders</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
