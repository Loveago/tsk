"use client";

import * as React from "react";
import { PageHeader, EmptyState, Spinner } from "@/components/shared";
import { StatusBadge, DeliveryReportStatusBadge } from "@/components/status-badge";
import { Pagination } from "@/components/ui/pagination";
import { DeliveryReportManageDialog } from "@/components/admin/delivery-report-manage-dialog";
import { Button } from "@/components/ui/button";
import { ScrollableTabs } from "@/components/ui/scrollable-tabs";
import { formatDateTime, formatGHS } from "@/lib/types";
import { orderCode } from "@/lib/utils";
import { FileWarning, Image as ImageIcon, RefreshCw, Pause, Play, Clock } from "lucide-react";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { OrderDateFilter, getTodayRange, getAllTimeRange, type DateFilterValue } from "@/components/orders/order-date-filter";

const TABS = [
  { key: "", label: "All" },
  { key: "UNDER_REVIEW", label: "Under Review" },
  { key: "RESOLVED", label: "Resolved" },
  { key: "REFUNDED", label: "Refunded" },
  { key: "CONFIRM_SENT", label: "Confirm Sent" },
];

interface ReportRow {
  id: string;
  seq: number;
  code: string;
  reason: string | null;
  message: string | null;
  status: string;
  adminNote: string | null;
  adminResponse: string | null;
  respondedAt: string | null;
  proofImageMime: string | null;
  proofImageUploadedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  order: {
    id: number;
    phoneNumber: string;
    network: string;
    gbAmount: number;
    amount: number;
    status: string;
    completedAt: string | null;
    failureReason: string | null;
    batch: { batchCode: string } | null;
  };
  user: { id: string; name: string; email: string };
}

export default function DeliveryReportsPage() {
  const [rows, setRows] = React.useState<ReportRow[]>([]);
  const [stats, setStats] = React.useState<Record<string, number>>({});
  const [total, setTotal] = React.useState(0);
  const [pages, setPages] = React.useState(1);
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState("");
  const [q, setQ] = React.useState("");
  const [dateFilter, setDateFilter] = React.useState<DateFilterValue>(getTodayRange());
  const [loading, setLoading] = React.useState(true);
  const [manageId, setManageId] = React.useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = React.useState<Date | null>(null);
  const [refreshInterval, setRefreshInterval] = React.useState(30);

  // Load refresh interval from admin settings
  React.useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => {
        const val = Number(d.settings?.admin_dashboard_refresh_interval ?? 30);
        setRefreshInterval(Number.isFinite(val) && val >= 0 ? val : 30);
      })
      .catch(() => {/* use default */});
  }, []);

  const load = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "15" });
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    if (dateFilter.from) params.set("from", dateFilter.from);
    if (dateFilter.to) params.set("to", dateFilter.to);
    try {
      const res = await fetch(`/api/admin/delivery-reports?${params}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (res.ok) {
        setRows(json.data ?? []);
        setStats(json.stats ?? {});
        setTotal(json.total ?? 0);
        setPages(json.pages ?? 1);
        setLastRefreshed(new Date());
        window.dispatchEvent(new CustomEvent("nav-counts-update"));
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page, status, q, dateFilter]);

  React.useEffect(() => {
    const t = setTimeout(() => { void load(false); }, 250);
    return () => clearTimeout(t);
  }, [load]);

  // Efficient Auto-refresh with tab visibility awareness & silent background refresh
  const {
    secondsRemaining,
    isRefreshing,
    isPaused,
    isManuallyPaused,
    togglePause,
    triggerRefresh,
    intervalSeconds,
    lastRefreshedAt,
  } = useAutoRefresh({
    intervalSeconds: refreshInterval,
    onRefresh: () => load(true),
    enabled: !manageId, // pause background refresh while review dialog is open
    pauseOnHidden: true,
    refreshOnVisible: true,
    pauseOnOffline: true,
  });

  const displayTime = lastRefreshed || lastRefreshedAt;
  const underReviewCount = stats["UNDER_REVIEW"] ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <div className="flex flex-wrap items-center gap-2.5">
            <span>Not Received Reports</span>
            {underReviewCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 border border-rose-500/30 px-2.5 py-0.5 text-xs font-bold text-rose-600 dark:text-rose-400 animate-pulse">
                <FileWarning className="h-3.5 w-3.5" />
                {underReviewCount} Under Review
              </span>
            )}
          </div>
        }
        description={`${total} report${total === 1 ? "" : "s"} filed by customers`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {displayTime && (
              <span className="hidden text-xs text-slate-400 dark:text-slate-500 md:inline">
                Updated {displayTime.toLocaleTimeString()}
              </span>
            )}
            {intervalSeconds > 0 && (
              <span className="hidden text-xs text-slate-400 dark:text-slate-500 sm:flex items-center gap-1 font-mono min-w-[50px]">
                {isRefreshing ? (
                  <span className="flex items-center gap-1 text-brand-600 dark:text-brand-400 font-medium">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    Updating...
                  </span>
                ) : isPaused ? (
                  <span className="text-amber-500 font-medium">Paused</span>
                ) : (
                  <>
                    <Clock className="h-3 w-3 text-slate-400" />
                    {secondsRemaining}s
                  </>
                )}
              </span>
            )}
            {intervalSeconds > 0 && (
              <button
                type="button"
                onClick={togglePause}
                className="rounded-lg border border-slate-200 bg-white p-1.5 text-xs text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 cursor-pointer"
                title={isManuallyPaused ? "Resume auto-refresh" : "Pause auto-refresh"}
              >
                {isManuallyPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              </button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                triggerRefresh();
              }}
              disabled={loading || isRefreshing}
              className="gap-1.5"
              title={displayTime ? `Last updated: ${displayTime.toLocaleTimeString()}` : "Refresh"}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading || isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <ScrollableTabs
            tabs={TABS.map((t) => ({
              key: t.key,
              label: t.label,
              badge: t.key && stats[t.key] ? stats[t.key] : undefined,
            }))}
            activeTab={status}
            onChange={(st) => {
              setStatus(st);
              setPage(1);
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <OrderDateFilter
            value={dateFilter}
            onChange={(df) => {
              setDateFilter(df);
              setPage(1);
            }}
          />
          <input
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 placeholder:text-slate-400 sm:w-64 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100 dark:placeholder:text-slate-500 caret-brand-600 dark:caret-brand-400"
            placeholder="Search phone, user, order code…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner className="h-6 w-6 text-brand-600" />
          </div>
        ) : rows.length === 0 ? (
          dateFilter.mode !== "all" ? (
            <EmptyState
              icon={FileWarning}
              title={`No reports found for ${dateFilter.label}`}
              description="No delivery reports were filed on this date. You can select another date from the calendar or view all time."
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDateFilter(getAllTimeRange());
                    setPage(1);
                  }}
                >
                  View All Time Reports
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={FileWarning}
              title="No reports"
              description="Customer-filed reports will appear here."
            />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500 dark:border-slate-800">
                  <th className="px-4 py-3 font-medium">Report</th>
                  <th className="px-4 py-3 font-medium">Issue</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Order status</th>
                  <th className="px-4 py-3 font-medium">Closed</th>
                  <th className="px-4 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((r) => {
                  return (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs font-bold">{r.code}</p>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <DeliveryReportStatusBadge status={r.status} />
                          {r.proofImageMime && (
                            <span title={`Proof uploaded ${r.proofImageUploadedAt ? formatDateTime(r.proofImageUploadedAt) : ""}`}>
                              <ImageIcon className="h-3.5 w-3.5 text-emerald-500" />
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-400">{formatDateTime(r.createdAt)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{r.reason || "Not received"}</p>
                        {r.message && (
                          <p className="mt-0.5 max-w-[240px] truncate text-xs text-slate-500" title={r.message}>
                            {r.message}
                          </p>
                        )}
                        {r.adminResponse && (
                          <p className="mt-0.5 max-w-[240px] truncate text-xs text-teal-600 dark:text-teal-400" title={r.adminResponse}>
                            Response: {r.adminResponse}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{r.user.name}</p>
                        <p className="text-xs text-slate-500">{r.user.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs font-bold">{orderCode(r.order.id)}</p>
                        <p className="text-xs text-slate-500">
                          {r.order.phoneNumber} · {r.order.gbAmount} GB {r.order.network}
                        </p>
                        <p className="text-xs text-slate-400">{formatGHS(r.order.amount)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={r.order.status} />
                        {r.order.failureReason && (
                          <p className="mt-0.5 max-w-[160px] truncate text-[11px] text-red-500" title={r.order.failureReason}>
                            {r.order.failureReason}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {r.resolvedAt && (
                          <p className="text-xs text-slate-400">{formatDateTime(r.resolvedAt)}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="outline" onClick={() => setManageId(r.id)}>
                          Manage
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination page={page} pages={pages} total={total} onPage={setPage} />

      <DeliveryReportManageDialog
        reportId={manageId}
        open={!!manageId}
        onClose={() => setManageId(null)}
        onChanged={load}
      />
    </div>
  );
}

