"use client";

import * as React from "react";
import { PageHeader, Spinner, StatCard } from "@/components/shared";
import { Input, Label } from "@/components/ui/input";
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
} from "recharts";
import { formatGHS } from "@/lib/types";
import { ClipboardList, CheckCircle2, XCircle, Banknote } from "lucide-react";

interface ReportData {
  statusCounts: Record<string, number>;
  totalOrders: number;
  totalSpend: number;
  daily: { day: string; count: number; amount: number }[];
  byPackage: { network: string; gbAmount: number; count: number; amount: number }[];
}

export default function ReportsPage() {
  const [data, setData] = React.useState<ReportData | null>(null);
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [loading, setLoading] = React.useState(true);

  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/reports?${params}`);
      const json = await res.json();
      if (res.ok) {
        setData({
          statusCounts: json.statusCounts ?? {},
          totalOrders: json.totalOrders ?? 0,
          totalSpend: json.totalSpend ?? 0,
          daily: json.daily ?? [],
          byPackage: json.byPackage ?? [],
        });
      } else {
        setError(json.error ?? "Failed to load report data");
        setData({
          statusCounts: {},
          totalOrders: 0,
          totalSpend: 0,
          daily: [],
          byPackage: [],
        });
      }
    } catch {
      setError("Failed to load report data");
      setData({
        statusCounts: {},
        totalOrders: 0,
        totalSpend: 0,
        daily: [],
        byPackage: [],
      });
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  React.useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const success = data?.statusCounts?.SUCCESS ?? 0;
  const failed = data?.statusCounts?.FAILED ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader title="My Order Reports" description="Spending and delivery over time" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label>From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      {loading || !data ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6 text-brand-600" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Total Orders" value={String(data.totalOrders)} icon={ClipboardList} />
            <StatCard title="Successful" value={String(success)} icon={CheckCircle2} />
            <StatCard title="Failed" value={String(failed)} icon={XCircle} />
            <StatCard title="Total Spend" value={formatGHS(data.totalSpend)} icon={Banknote} />
          </div>

          <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-[#0d1526]">
            <h2 className="text-sm font-semibold">Orders per day</h2>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#8884" />
                  <XAxis dataKey="day" fontSize={11} tickLine={false} />
                  <YAxis fontSize={11} tickLine={false} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="#2563EB" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-[#0d1526]">
              <h2 className="text-sm font-semibold">Spend per package</h2>
              <div className="mt-4 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.byPackage.map((b) => ({
                      name: `${b.network} ${b.gbAmount}GB`,
                      amount: b.amount,
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#8884" />
                    <XAxis dataKey="name" fontSize={10} tickLine={false} />
                    <YAxis fontSize={11} tickLine={false} />
                    <Tooltip />
                    <Bar dataKey="amount" fill="#2563EB" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-[#0d1526]">
              <h2 className="text-sm font-semibold">Status breakdown</h2>
              <ul className="mt-4 space-y-2 text-sm">
                {Object.entries(data.statusCounts).map(([s, c]) => (
                  <li key={s} className="flex items-center justify-between border-b border-slate-50 pb-2 last:border-0 dark:border-slate-800">
                    <span className="text-slate-600 dark:text-slate-300">{s}</span>
                    <span className="font-semibold">{c}</span>
                  </li>
                ))}
                {Object.keys(data.statusCounts).length === 0 && (
                  <li className="text-sm text-slate-500">No orders in this range.</li>
                )}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
