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
import { FileWarning, Image as ImageIcon, RefreshCw, Pause, Play, Clock, Loader2, CheckSquare, Download } from "lucide-react";
import { useToast } from "@/components/toast";
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
    createdAt: string;
    completedAt: string | null;
    failureReason: string | null;
    batch: { batchCode: string } | null;
  };
  user: { id: string; name: string; email: string };
}

export default function DeliveryReportsPage() {
  const { toast } = useToast();
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

  // Bulk actions state
  const [selectedReportIds, setSelectedReportIds] = React.useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = React.useState(false);

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

  React.useEffect(() => {
    setSelectedReportIds(new Set());
  }, [page, status, dateFilter]);

  const handleBulkStatus = async (action: string) => {
    if (selectedReportIds.size === 0 || bulkUpdating) return;
    try {
      setBulkUpdating(true);
      const res = await fetch("/api/admin/delivery-reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportIds: Array.from(selectedReportIds),
          action,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? "Failed to update reports", "error");
        return;
      }
      toast(`Successfully updated ${json.updatedCount ?? selectedReportIds.size} report(s)`, "success");
      setSelectedReportIds(new Set());
      await load(true);
    } catch {
      toast("Error during bulk reports update", "error");
    } finally {
      setBulkUpdating(false);
    }
  };

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
                const params = new URLSearchParams();
                if (dateFilter.from) params.set("from", dateFilter.from);
                if (dateFilter.to) params.set("to", dateFilter.to);
                window.open(`/api/admin/delivery-reports/export-txt?${params}`, "_blank");
              }}
              className="gap-1.5"
              title="Download not received reports as TXT (number + GB)"
            >
              <Download className="h-3.5 w-3.5" />
              Export TXT
            </Button>
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

      {/* Bulk action bar */}
      {selectedReportIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-500/20 bg-brand-50/70 p-3 text-xs font-semibold text-brand-900 dark:bg-brand-500/10 dark:text-brand-200 shadow-sm animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <span>{selectedReportIds.size} report{selectedReportIds.size === 1 ? "" : "s"} selected</span>
            {selectedReportIds.size < rows.length && (
              <button
                type="button"
                disabled={bulkUpdating}
                onClick={() => setSelectedReportIds(new Set(rows.map((r) => r.id)))}
                className="underline hover:text-brand-700 dark:hover:text-brand-300 cursor-pointer disabled:opacity-50"
              >
                (Select all {rows.length} on this page)
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              disabled={bulkUpdating}
              onClick={() => handleBulkStatus("RESOLVE_CONFIRM_SENT")}
              className="border-emerald-500/40 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/40 dark:text-emerald-300 dark:hover:bg-emerald-950/40 font-medium"
            >
              {bulkUpdating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Confirm Sent
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkUpdating}
              onClick={() => handleBulkStatus("RESOLVE")}
              className="border-blue-500/40 text-blue-700 hover:bg-blue-50 dark:border-blue-500/40 dark:text-blue-300 dark:hover:bg-blue-950/40 font-medium"
            >
              {bulkUpdating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Resolved
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkUpdating}
              onClick={() => handleBulkStatus("RESOLVE_REFUNDED")}
              className="border-cyan-500/40 text-cyan-700 hover:bg-cyan-50 dark:border-cyan-500/40 dark:text-cyan-300 dark:hover:bg-cyan-950/40 font-medium"
            >
              {bulkUpdating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Refunded
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkUpdating}
              onClick={() => handleBulkStatus("MARK_UNDER_REVIEW")}
              className="border-amber-500/40 text-amber-700 hover:bg-amber-50 dark:border-amber-500/40 dark:text-amber-300 dark:hover:bg-amber-950/40 font-medium"
            >
              {bulkUpdating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Under Review
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkUpdating}
              onClick={() => handleBulkStatus("REJECT")}
              className="border-rose-500/40 text-rose-700 hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-950/40 font-medium"
            >
              {bulkUpdating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Reject
            </Button>
            <button
              type="button"
              disabled={bulkUpdating}
              onClick={() => setSelectedReportIds(new Set())}
              className="ml-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        </div>
      )}

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
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all on this page"
                      checked={rows.length > 0 && selectedReportIds.size === rows.length}
                      ref={(el) => {
                        if (el) {
                          el.indeterminate = selectedReportIds.size > 0 && selectedReportIds.size < rows.length;
                        }
                      }}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedReportIds(new Set(rows.map((r) => r.id)));
                        } else {
                          setSelectedReportIds(new Set());
                        }
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                    />
                  </th>
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
                    <tr key={r.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/60 ${selectedReportIds.has(r.id) ? "bg-brand-50/40 dark:bg-brand-500/5" : ""}`}>
                      <td className="w-10 px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Select report ${r.code}`}
                          checked={selectedReportIds.has(r.id)}
                          onChange={(e) => {
                            setSelectedReportIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(r.id);
                              else next.delete(r.id);
                              return next;
                            });
                          }}
                          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                        />
                      </td>
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
                        <p className="mt-0.5 text-[11px] text-slate-400" title="Order purchase time">
                          🕐 {formatDateTime(r.order.createdAt)}
                        </p>
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

