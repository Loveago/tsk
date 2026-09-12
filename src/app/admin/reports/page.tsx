"use client";

import * as React from "react";
import { PageHeader, Spinner, StatCard } from "@/components/shared";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Legend,
} from "recharts";
import { formatGHS } from "@/lib/types";
import { FileBarChart, TrendingUp, ClipboardList, Users } from "lucide-react";

interface ReportData {
  statusCounts: Record<string, number>;
  totalOrders: number;
  totalRevenue: number;
  daily: { day: string; count: number; amount: number }[];
  byPackage: { network: string; gbAmount: number; count: number; amount: number }[];
  topUsers: { id: string; name: string; email: string; orders: number; spend: number }[];
}

export default function AdminReportsPage() {
  const [data, setData] = React.useState<ReportData | null>(null);
  const [range, setRange] = React.useState("90");

  React.useEffect(() => {
    const from = new Date();
    from.setDate(from.getDate() - Number(range));
    fetch(`/api/admin/reports?from=${from.toISOString()}`)
      .then((r) => r.json())
      .then(setData);
  }, [range]);

  if (!data) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-6 w-6 text-brand-600" />
      </div>
    );
  }

  const daily = data.daily.map((d) => ({ ...d, amount: Number(d.amount) }));
  const successRate =
    data.totalOrders > 0
      ? Math.round(((data.statusCounts.SUCCESS ?? 0) / data.totalOrders) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Platform-wide order analytics"
        actions={
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard title="Orders" value={String(data.totalOrders)} icon={ClipboardList} />
        <StatCard title="Revenue" value={formatGHS(data.totalRevenue)} icon={TrendingUp} />
        <StatCard title="Success rate" value={`${successRate}%`} icon={FileBarChart} />
        <StatCard
          title="Active buyers"
          value={String(data.topUsers.length)}
          icon={Users}
          hint="Top spenders in range"
        />
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-4 text-sm font-semibold">Daily orders & revenue</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(148 163 184 / 0.2)" />
              <XAxis dataKey="day" fontSize={11} tickLine={false} />
              <YAxis yAxisId="left" fontSize={11} tickLine={false} />
              <YAxis yAxisId="right" orientation="right" fontSize={11} tickLine={false} />
              <Tooltip />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="count" name="Orders" stroke="#2563EB" strokeWidth={2} dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="amount" name="Revenue (GHS)" stroke="#10B981" strokeWidth={2} dot={false} />
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
                data={data.byPackage.map((b) => ({
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
          {data.topUsers.length === 0 ? (
            <p className="text-sm text-slate-500">No orders in this range.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
              {data.topUsers.map((u, i) => (
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
    </div>
  );
}
