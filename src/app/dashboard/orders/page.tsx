"use client";

import * as React from "react";
import { PageHeader, EmptyState, Spinner } from "@/components/shared";
import { StatusBadge } from "@/components/status-badge";
import { BatchStatusBadge, BatchStatsChips, type BatchStats } from "@/components/batches/batch-ui";
import { ProgressBar } from "@/components/ui/progress";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { formatDateTime, formatGHS, sanitizeCustomerRefundNote } from "@/lib/types";
import { orderCode } from "@/lib/utils";
import { ChevronRight, FileWarning, Layers, Search, Clock, Eye, CheckCircle2, Smartphone, Code2 } from "lucide-react";
import { NotReceivedReportDetailDialog } from "@/components/orders/not-received-report-dialog";
import { OrderDateFilter, getTodayRange, getAllTimeRange, type DateFilterValue } from "@/components/orders/order-date-filter";

const NETWORKS = ["MTN", "TELECEL", "AIRTELTIGO", "AIRTELTIGO_BIGTIME"] as const;
const BATCH_STATUSES = ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"];

type ViewMode = "batches" | "single" | "api";

interface BatchRow {
  id: string;
  batchCode: string;
  network: string;
  status: string;
  totalRecipients: number;
  totalGb: number;
  totalAmount: number;
  createdAt: string;
  updatedAt?: string;
  completedAt?: string | null;
  stats: BatchStats;
  progress: number;
}

interface DetailOrder {
  id: number;
  phoneNumber: string;
  network: string;
  gbAmount: number;
  amount: number;
  status: string;
  failureReason: string | null;
  exportCount: number;
  lastExportedAt: string | null;
  createdAt: string;
  updatedAt?: string;
  completedAt?: string | null;
  deliveryReports?: { id: string; seq?: number; status: string; proofImageMime?: string | null }[];
  _hasReportedLocally?: boolean;
}

interface UserOrderRow {
  id: number;
  phoneNumber: string;
  network: string;
  gbAmount: number;
  amount: number;
  status: string;
  source?: string;
  externalReference?: string | null;
  apiCredential?: { name: string; keyPrefix: string } | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt?: string;
  completedAt?: string | null;
  batch?: { id: string; batchCode: string; status: string } | null;
  deliveryReports?: { id: string; seq?: number; status: string; proofImageMime?: string | null }[];
  _hasReportedLocally?: boolean;
}

interface BatchDetail {
  batch: BatchRow & { updatedAt: string; completedAt?: string | null };
  orders: DetailOrder[];
  stats: BatchStats;
  progress: number;
  exports: Array<{ id: string; exportCode: string; network: string; isReexport: boolean; createdAt: string }>;
}

const selectCls =
  "h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 placeholder:text-slate-400 dark:border-white/10 dark:bg-[#0d1526] dark:text-slate-100 dark:placeholder:text-slate-500 caret-brand-600 dark:caret-brand-400 [&>option]:bg-white dark:[&>option]:bg-[#0d1526]";

export default function OrdersPage() {
  const { toast } = useToast();
  const [viewMode, setViewMode] = React.useState<ViewMode>("batches");

  // Filter state
  const [network, setNetwork] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [q, setQ] = React.useState("");
  const [dateFilter, setDateFilter] = React.useState<DateFilterValue>(getTodayRange());
  const [page, setPage] = React.useState(1);
  const [pages, setPages] = React.useState(1);
  const [loading, setLoading] = React.useState(true);

  // Batches state
  const [rows, setRows] = React.useState<BatchRow[]>([]);

  // Single orders state
  const [singleOrders, setSingleOrders] = React.useState<UserOrderRow[]>([]);
  const [singleTotal, setSingleTotal] = React.useState(0);

  // API orders state
  const [apiOrders, setApiOrders] = React.useState<UserOrderRow[]>([]);
  const [apiTotal, setApiTotal] = React.useState(0);

  // Detail dialog state
  const [detail, setDetail] = React.useState<BatchDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [batchSearch, setBatchSearch] = React.useState("");
  const [submittingReportId, setSubmittingReportId] = React.useState<number | null>(null);
  const [viewReportId, setViewReportId] = React.useState<string | null>(null);

  // Auto-switch to single view when searching for a phone number (unless already in api view)
  React.useEffect(() => {
    if (viewMode !== "api" && /\d{3,}/.test(q.trim())) {
      setViewMode("single");
    }
  }, [q, viewMode]);

  const load = React.useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: viewMode === "batches" ? "12" : "15",
    });
    if (network) params.set("network", network);
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    if (dateFilter.from) params.set("from", dateFilter.from);
    if (dateFilter.to) params.set("to", dateFilter.to);

    try {
      if (viewMode === "api") {
        params.set("source", "API");
        const res = await fetch(`/api/orders?${params}`);
        const json = await res.json();
        if (res.ok) {
          setApiOrders(json.data ?? []);
          setApiTotal(json.total ?? 0);
          setPages(json.pages ?? 1);
        }
      } else if (viewMode === "single") {
        params.set("source", "SINGLE");
        const res = await fetch(`/api/orders?${params}`);
        const json = await res.json();
        if (res.ok) {
          setSingleOrders(json.data ?? []);
          setSingleTotal(json.total ?? 0);
          setPages(json.pages ?? 1);
        }
      } else {
        const res = await fetch(`/api/orders/batches?${params}`);
        const json = await res.json();
        if (res.ok) {
          setRows(json.data ?? []);
          setPages(json.pages ?? 1);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [page, network, status, q, dateFilter, viewMode]);

  React.useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    // Pre-populate in-modal search with q if searching for a number
    setBatchSearch(q.trim());
    try {
      const res = await fetch(`/api/orders/batches/${id}`);
      const json = await res.json();
      if (res.ok) setDetail(json);
      else toast(json.error ?? "Failed to load batch", "error");
    } finally {
      setDetailLoading(false);
    }
  };

  const directReportOrder = async (order: { id: number }) => {
    setSubmittingReportId(order.id);
    try {
      const res = await fetch("/api/reports/not-received", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, reason: "Data not received" }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? "Failed to file report", "error");
        return;
      }
      toast("Report submitted — our team will investigate", "success");

      // Update local state in single orders
      setSingleOrders((prev) =>
        prev.map((o) =>
          o.id === order.id
            ? {
                ...o,
                _hasReportedLocally: true,
                deliveryReports: [{ id: json.report?.id ?? json.id ?? "", status: "UNDER_REVIEW" }],
              }
            : o
        )
      );

      // Update local state in batch detail if open
      if (detail) {
        setDetail({
          ...detail,
          orders: detail.orders.map((o) =>
            o.id === order.id
              ? {
                  ...o,
                  _hasReportedLocally: true,
                  deliveryReports: [{ id: json.report?.id ?? json.id ?? "", status: "UNDER_REVIEW" }],
                }
              : o
          ),
        });
      }
    } catch {
      toast("Error submitting report", "error");
    } finally {
      setSubmittingReportId(null);
    }
  };

  const filteredModalOrders = React.useMemo(() => {
    if (!detail) return [];
    if (!batchSearch.trim()) return detail.orders;
    const s = batchSearch.trim().toLowerCase();
    return detail.orders.filter(
      (o) =>
        o.phoneNumber.toLowerCase().includes(s) ||
        orderCode(o.id).toLowerCase().includes(s)
    );
  }, [detail, batchSearch]);

  const renderReportButton = (o: DetailOrder | UserOrderRow) => {
    const isCompleted = o.status === "SUCCESS" || o.status === "COMPLETED";
    const hasReports = (o.deliveryReports && o.deliveryReports.length > 0) || o._hasReportedLocally;

    if (!isCompleted && !hasReports) return null;

    const rep = (o.deliveryReports && o.deliveryReports[0]) || (o._hasReportedLocally ? { id: "", status: "UNDER_REVIEW" } : null);
    const isSubmitting = submittingReportId === o.id;

    if (rep) {
      const isDelivered = rep.status === "DELIVERED" || rep.status === "CONFIRM_SENT";
      const isResolved = rep.status === "RESOLVED";
      const isRefunded = rep.status === "REFUNDED";
      const hasProof = Boolean((rep as any).proofImageMime);

      let badgeText = "Under Review";
      let badgeCls = "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20";
      if (isDelivered) {
        badgeText = hasProof ? "Confirmed Sent (Proof)" : "Confirm Sent";
        badgeCls = "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20";
      } else if (isResolved) {
        badgeText = "Resolved";
        badgeCls = "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20";
      } else if (isRefunded) {
        badgeText = "Refunded";
        badgeCls = "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-400 dark:border-cyan-500/20";
      } else if (rep.status === "REJECTED") {
        badgeText = "Rejected";
        badgeCls = "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20";
      }

      return (
        <button
          type="button"
          disabled={!rep.id}
          onClick={() => { if (rep.id) setViewReportId(rep.id); }}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${badgeCls} ${
            rep.id ? "cursor-pointer hover:opacity-80" : "cursor-default opacity-80"
          }`}
          title={rep.id ? "Click to view review status and delivery proof" : "Under Review"}
        >
          <Clock className="h-3 w-3" />
          <span>{badgeText}</span>
          {hasProof && <Eye className="h-3 w-3 ml-0.5" />}
        </button>
      );
    }

    if (!isCompleted) return null;

    return (
      <Button
        size="sm"
        variant="ghost"
        className="text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10"
        onClick={() => directReportOrder(o)}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <Spinner className="h-3.5 w-3.5 mr-1" />
        ) : (
          <FileWarning className="h-3.5 w-3.5 mr-1" />
        )}
        {isSubmitting ? "Submitting…" : "Report"}
      </Button>
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="My Sent Orders"
        description="View your order batches or search individual phone numbers directly"
      />

      {/* View mode toggle + Search — compact on mobile */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
        {/* View mode toggle */}
        <div className="flex items-center gap-1 self-start rounded-xl border border-slate-200 bg-white p-1 text-xs font-semibold dark:border-white/10 dark:bg-white/5">
          <button
            type="button"
            onClick={() => {
              setViewMode("batches");
              setPage(1);
            }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
              viewMode === "batches"
                ? "bg-brand-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Batches</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setViewMode("single");
              setPage(1);
            }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
              viewMode === "single"
                ? "bg-brand-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            }`}
          >
            <Search className="h-3.5 w-3.5" />
            <span>Single Orders</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setViewMode("api");
              setPage(1);
            }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
              viewMode === "api"
                ? "bg-brand-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            }`}
          >
            <Code2 className="h-3.5 w-3.5" />
            <span>API Orders</span>
          </button>
        </div>

        {/* Search box — full width on mobile */}
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            className={selectCls + " w-full pl-8"}
            placeholder="Search phone, batch, or ID…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {/* Filter chips row */}
      <div className="flex flex-wrap items-center gap-1.5">
        {["", ...NETWORKS].map((n) => (
          <button
            key={n || "all"}
            onClick={() => {
              setNetwork(n);
              setPage(1);
            }}
            className={
              "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition " +
              (network === n
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-brand-300 dark:border-white/10 dark:bg-transparent dark:text-slate-300")
            }
          >
            {n ? (n === "AIRTELTIGO" ? "AT iShare" : n === "AIRTELTIGO_BIGTIME" ? "AT Big Time" : n) : "All networks"}
          </button>
        ))}
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          <OrderDateFilter
            value={dateFilter}
            onChange={(df) => {
              setDateFilter(df);
              setPage(1);
            }}
          />
          <select
            className={selectCls}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {BATCH_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center rounded-2xl border border-slate-100 bg-white py-12 dark:border-slate-800 dark:bg-slate-900">
          <Spinner className="h-6 w-6 text-brand-600" />
        </div>
      ) : viewMode === "single" ? (
        /* ── Single Orders View ── */
        singleOrders.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
            <EmptyState
              icon={Search}
              title={q ? `No orders found for "${q}"` : "No individual orders found"}
              description={
                q
                  ? "Check the phone number or adjust your date filter to find this order."
                  : "Orders you send will appear here individually."
              }
              action={
                dateFilter.mode !== "all" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDateFilter(getAllTimeRange());
                      setPage(1);
                    }}
                  >
                    View All Time Orders
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <>
            {/* Mobile card list */}
            <div className="flex flex-col gap-3 sm:hidden">
              {singleOrders.map((o) => (
                <div
                  key={o.id}
                  className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-[#0d1526]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400">
                        {orderCode(o.id)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400">{formatDateTime(o.createdAt)}</p>
                    </div>
                    <StatusBadge status={o.status} />
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-400">Phone</span>
                      <p className="font-mono font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {o.phoneNumber}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-400">Network</span>
                      <p>
                        <span className="inline-flex rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-200">
                          {o.network}
                        </span>
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-400">Bundle</span>
                      <p className="font-medium text-slate-800 dark:text-slate-200">{o.gbAmount} GB</p>
                    </div>
                    <div>
                      <span className="text-slate-400">Amount</span>
                      <p className="font-bold text-slate-900 dark:text-white">{formatGHS(o.amount)}</p>
                    </div>
                  </div>

                  {o.failureReason && (
                    <p
                      className="mt-2 truncate text-[11px] text-red-500"
                      title={sanitizeCustomerRefundNote(o.failureReason, o.amount) ?? o.failureReason}
                    >
                      {sanitizeCustomerRefundNote(o.failureReason, o.amount)}
                    </p>
                  )}

                  {(o.status === "SUCCESS" || o.status === "COMPLETED") && (
                    <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      Delivered: {formatDateTime(o.completedAt ?? o.updatedAt ?? o.createdAt)}
                    </p>
                  )}

                  {o.batch && (
                    <p className="mt-1 text-[11px] text-slate-400">
                      Batch:{" "}
                      <button
                        type="button"
                        onClick={() => openDetail(o.batch!.id)}
                        className="font-mono font-medium text-brand-600 underline-offset-2 hover:underline dark:text-brand-400"
                      >
                        {o.batch.batchCode}
                      </button>
                    </p>
                  )}

                  <div className="mt-3 flex justify-end">{renderReportButton(o)}</div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-[#0d1526] sm:block">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-left text-sm">
                  <thead className="border-b border-slate-200/80 bg-slate-50/80 text-xs font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-white/5 dark:text-slate-400">
                    <tr>
                      <th className="px-5 py-3.5">Order</th>
                      <th className="px-4 py-3.5">Phone Number</th>
                      <th className="px-4 py-3.5">Network</th>
                      <th className="px-4 py-3.5">Bundle</th>
                      <th className="px-4 py-3.5">Amount</th>
                      <th className="px-4 py-3.5">Status</th>
                      <th className="px-4 py-3.5">Delivered At</th>
                      <th className="px-4 py-3.5">Batch</th>
                      <th className="px-5 py-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {singleOrders.map((o) => (
                      <tr key={o.id} className="transition-colors hover:bg-slate-50/80 dark:hover:bg-white/[0.03]">
                        <td className="px-5 py-3.5">
                          <p className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400">
                            {orderCode(o.id)}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-400">{formatDateTime(o.createdAt)}</p>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {o.phoneNumber}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="inline-flex rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-200">
                            {o.network}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 font-medium text-slate-800 dark:text-slate-200">
                          {o.gbAmount} GB
                        </td>
                        <td className="px-4 py-3.5 font-semibold text-slate-900 dark:text-white">
                          {formatGHS(o.amount)}
                        </td>
                        <td className="px-4 py-3.5">
                          <StatusBadge status={o.status} />
                          {o.failureReason && (
                            <p
                              className="mt-1 max-w-[170px] truncate text-[11px] text-red-500"
                              title={sanitizeCustomerRefundNote(o.failureReason, o.amount) ?? o.failureReason}
                            >
                              {sanitizeCustomerRefundNote(o.failureReason, o.amount)}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-xs whitespace-nowrap">
                          {o.status === "SUCCESS" || o.status === "COMPLETED" ? (
                            <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                              {formatDateTime(o.completedAt ?? o.updatedAt ?? o.createdAt)}
                            </span>
                          ) : o.status === "PROCESSING" ? (
                            <span className="text-[11px] font-medium text-sky-600 dark:text-sky-400">In progress…</span>
                          ) : o.status === "FAILED" ? (
                            <span className="text-[11px] font-medium text-red-500 dark:text-red-400">Failed</span>
                          ) : (
                            <span className="text-[11px] text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          {o.batch ? (
                            <button
                              type="button"
                              onClick={() => openDetail(o.batch!.id)}
                              className="font-mono text-xs font-medium text-brand-600 underline-offset-2 hover:underline dark:text-brand-400"
                              title="View batch containing this order"
                            >
                              {o.batch.batchCode}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex justify-end gap-1.5">{renderReportButton(o)}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )
      ) : viewMode === "api" ? (
        /* ── API Orders View ── */
        apiOrders.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
            <EmptyState
              icon={Code2}
              title={q ? `No API orders found for "${q}"` : "No API orders found"}
              description={
                q
                  ? "Check the phone number, reference, or adjust your date filter."
                  : "Orders placed via your Developer API keys will appear here with an API- reference."
              }
              action={
                dateFilter.mode !== "all" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDateFilter(getAllTimeRange());
                      setPage(1);
                    }}
                  >
                    View All Time API Orders
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <>
            {/* Mobile card list */}
            <div className="flex flex-col gap-3 sm:hidden">
              {apiOrders.map((o) => (
                <div
                  key={o.id}
                  className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-[#0d1526]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-bold text-violet-600 dark:text-violet-400">
                        {`API-${o.id}`}
                      </p>
                      {o.externalReference && (
                        <p className="mt-0.5 font-mono text-[11px] text-slate-500 truncate" title={o.externalReference}>
                          Ref: {o.externalReference}
                        </p>
                      )}
                      <p className="mt-0.5 text-[11px] text-slate-400">{formatDateTime(o.createdAt)}</p>
                    </div>
                    <StatusBadge status={o.status} />
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-400">Phone</span>
                      <p className="font-mono font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {o.phoneNumber}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-400">Network</span>
                      <p>
                        <span className="inline-flex rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-200">
                          {o.network}
                        </span>
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-400">Bundle</span>
                      <p className="font-medium text-slate-800 dark:text-slate-200">{o.gbAmount} GB</p>
                    </div>
                    <div>
                      <span className="text-slate-400">Amount</span>
                      <p className="font-bold text-slate-900 dark:text-white">{formatGHS(o.amount)}</p>
                    </div>
                  </div>

                  {o.failureReason && (
                    <p
                      className="mt-2 truncate text-[11px] text-red-500"
                      title={sanitizeCustomerRefundNote(o.failureReason, o.amount) ?? o.failureReason}
                    >
                      {sanitizeCustomerRefundNote(o.failureReason, o.amount)}
                    </p>
                  )}

                  {(o.status === "SUCCESS" || o.status === "COMPLETED") && (
                    <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      Delivered: {formatDateTime(o.completedAt ?? o.updatedAt ?? o.createdAt)}
                    </p>
                  )}

                  <div className="mt-3 flex justify-end">{renderReportButton(o)}</div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-[#0d1526] sm:block">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-left text-sm">
                  <thead className="border-b border-slate-200/80 bg-slate-50/80 text-xs font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-white/5 dark:text-slate-400">
                    <tr>
                      <th className="px-5 py-3.5">API Order</th>
                      <th className="px-4 py-3.5">Client Reference</th>
                      <th className="px-4 py-3.5">Phone Number</th>
                      <th className="px-4 py-3.5">Network</th>
                      <th className="px-4 py-3.5">Bundle</th>
                      <th className="px-4 py-3.5">Amount</th>
                      <th className="px-4 py-3.5">Status</th>
                      <th className="px-4 py-3.5">Delivered At</th>
                      <th className="px-5 py-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {apiOrders.map((o) => (
                      <tr key={o.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                        <td className="px-5 py-3.5">
                          <p className="font-mono text-xs font-bold text-violet-600 dark:text-violet-400">
                            {`API-${o.id}`}
                          </p>
                          <p className="text-[11px] text-slate-400">{formatDateTime(o.createdAt)}</p>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-300">
                          {o.externalReference ? (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">
                              {o.externalReference}
                            </span>
                          ) : (
                            <span className="text-slate-300 dark:text-slate-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 font-mono font-bold text-slate-900 dark:text-white">
                          {o.phoneNumber}
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                              o.network === "MTN"
                                ? "bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300"
                                : o.network === "TELECEL"
                                ? "bg-red-100 text-red-800 border border-red-300 dark:bg-red-500/20 dark:text-red-300"
                                : "bg-blue-100 text-blue-800 border border-blue-300 dark:bg-blue-500/20 dark:text-blue-300"
                            }`}
                          >
                            {o.network}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 font-semibold text-slate-800 dark:text-slate-200">
                          {o.gbAmount} GB
                        </td>
                        <td className="px-4 py-3.5 font-bold text-slate-900 dark:text-white">
                          {formatGHS(o.amount)}
                        </td>
                        <td className="px-4 py-3.5">
                          <StatusBadge status={o.status} />
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-500">
                          {o.status === "SUCCESS" || o.status === "COMPLETED" ? (
                            <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                              {formatDateTime(o.completedAt ?? o.updatedAt ?? o.createdAt)}
                            </span>
                          ) : o.status === "FAILED" ? (
                            <span className="text-[11px] font-medium text-red-500 dark:text-red-400">Failed</span>
                          ) : (
                            <span className="text-[11px] text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex justify-end gap-1.5">{renderReportButton(o)}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )
      ) : rows.length === 0 ? (
        /* ── Batches Empty State ── */
        <div className="rounded-2xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
          {dateFilter.mode !== "all" ? (
            <EmptyState
              icon={Layers}
              title={`No batches found for ${dateFilter.label}`}
              description="No order batches were created on this date. You can pick another date using the calendar or view all time."
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDateFilter(getAllTimeRange());
                    setPage(1);
                  }}
                >
                  View All Time Batches
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Layers}
              title="No batches yet"
              description="Send an order from the Send Order page — recipients are grouped into a network batch."
            />
          )}
        </div>
      ) : (
        /* ── Batches View ── */
        <>
          {/* Mobile card list */}
          <div className="flex flex-col gap-3 sm:hidden">
            {rows.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => openDetail(b.id)}
                className="w-full rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-xs transition active:scale-[0.99] hover:border-brand-300/60 dark:border-white/10 dark:bg-[#0d1526] dark:hover:border-brand-500/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400">{b.batchCode}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">Sent: {formatDateTime(b.createdAt)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <BatchStatusBadge status={b.status} />
                    <span className="inline-flex rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-200">
                      {b.network}
                    </span>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400">Recipients</span>
                    <p className="font-semibold text-slate-800 dark:text-slate-200">
                      {b.stats.total || b.totalRecipients}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Total GB</span>
                    <p className="font-semibold text-slate-800 dark:text-slate-200">{b.totalGb} GB</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Value</span>
                    <p className="font-bold text-slate-900 dark:text-white">{formatGHS(b.totalAmount)}</p>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="flex items-center gap-2">
                    <ProgressBar value={b.stats.completed + b.stats.cancelled} total={b.stats.total} />
                    <span className="text-xs font-semibold text-slate-500">{b.progress}%</span>
                  </div>
                </div>

                <div className="mt-2.5 flex items-center justify-end gap-1 text-[11px] font-medium text-brand-600 dark:text-brand-400">
                  View details <ChevronRight className="h-3 w-3" />
                </div>
              </button>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-[#0d1526] sm:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-slate-200/80 bg-slate-50/80 text-xs font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-white/5 dark:text-slate-400">
                  <tr>
                    <th className="px-5 py-3.5">Batch Code</th>
                    <th className="px-4 py-3.5">Network</th>
                    <th className="px-4 py-3.5">Recipients</th>
                    <th className="px-4 py-3.5">Total GB</th>
                    <th className="px-4 py-3.5">Total Value</th>
                    <th className="px-4 py-3.5">Progress</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {rows.map((b) => (
                    <tr
                      key={b.id}
                      onClick={() => openDetail(b.id)}
                      className="cursor-pointer transition-colors hover:bg-slate-50/80 dark:hover:bg-white/[0.03]"
                    >
                      <td className="px-5 py-3.5">
                        <p className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400">
                          {b.batchCode}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400">Sent: {formatDateTime(b.createdAt)}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-200">
                          {b.network}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-medium text-slate-800 dark:text-slate-200">
                        {b.stats.total || b.totalRecipients}
                      </td>
                      <td className="px-4 py-3.5 font-medium text-slate-800 dark:text-slate-200">
                        {b.totalGb} GB
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-slate-900 dark:text-white">
                        {formatGHS(b.totalAmount)}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex w-32 items-center gap-2">
                          <ProgressBar value={b.stats.completed + b.stats.cancelled} total={b.stats.total} />
                          <span className="text-xs font-semibold text-slate-500">{b.progress}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <BatchStatusBadge status={b.status} />
                        {(b.status === "COMPLETED" || b.completedAt) && (
                          <span className="mt-1 block text-[11px] text-slate-400">
                            {formatDateTime(b.completedAt ?? b.updatedAt ?? b.createdAt)}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDetail(b.id);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:border-brand-300 hover:text-brand-600 dark:border-white/10 dark:text-slate-300 dark:hover:border-brand-500/40 dark:hover:text-brand-400"
                        >
                          Details <ChevronRight className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Page {page} of {pages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      <Dialog
        open={!!detail || detailLoading}
        onClose={() => setDetail(null)}
        title={detail ? <span className="font-mono">{detail.batch.batchCode}</span> : "Batch"}
        description={
          detail
            ? `${detail.batch.network} · ${formatDateTime(detail.batch.createdAt)} · ${detail.batch.totalGb} GB · ${formatGHS(detail.batch.totalAmount)}`
            : undefined
        }
        className="max-w-4xl"
      >
        {detailLoading || !detail ? (
          <div className="flex justify-center py-12">
            <Spinner className="h-6 w-6 text-brand-600" />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <BatchStatusBadge status={detail.batch.status} />
                  <ProgressBar
                    value={detail.stats.completed + detail.stats.cancelled}
                    total={detail.stats.total}
                    className="max-w-xs"
                  />
                  <span className="text-xs font-semibold text-slate-500">{detail.progress}%</span>
                </div>
                {(detail.batch.status === "COMPLETED" || detail.batch.completedAt) && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>Delivered at {formatDateTime(detail.batch.completedAt ?? detail.batch.updatedAt ?? detail.batch.createdAt)}</span>
                  </div>
                )}
              </div>
              <BatchStatsChips stats={detail.stats} className="mt-2" />
            </div>

            {/* In-batch search / filter */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="relative w-full max-w-xs">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  className={selectCls + " h-8 w-full pl-8 text-xs"}
                  placeholder="Filter phone number in batch…"
                  value={batchSearch}
                  onChange={(e) => setBatchSearch(e.target.value)}
                />
              </div>
              {batchSearch.trim() && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>
                    Showing {filteredModalOrders.length} of {detail.orders.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setBatchSearch("")}
                    className="font-medium text-brand-600 hover:underline dark:text-brand-400"
                  >
                    Clear filter
                  </button>
                </div>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-100 dark:border-white/5">
              {filteredModalOrders.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  No orders in this batch match &quot;{batchSearch}&quot;.
                  <button
                    type="button"
                    onClick={() => setBatchSearch("")}
                    className="ml-1.5 font-medium text-brand-600 hover:underline dark:text-brand-400"
                  >
                    Clear filter
                  </button>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white dark:bg-[#0d1526]">
                    <tr className="border-b border-slate-100 text-left text-xs text-slate-500 dark:border-white/5">
                      <th className="px-3 py-2 font-medium">Order</th>
                      <th className="px-3 py-2 font-medium">Phone</th>
                      <th className="px-3 py-2 font-medium">Size</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Delivered At</th>
                      <th className="px-3 py-2 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {filteredModalOrders.map((o) => (
                      <tr key={o.id}>
                        <td className="px-3 py-2 font-mono text-xs font-semibold">{orderCode(o.id)}</td>
                        <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{o.phoneNumber}</td>
                        <td className="px-3 py-2">{o.gbAmount} GB</td>
                        <td className="px-3 py-2">
                          <StatusBadge status={o.status} />
                          {o.failureReason && (
                            <p
                              className="mt-0.5 max-w-[150px] truncate text-[11px] text-red-500"
                              title={sanitizeCustomerRefundNote(o.failureReason, o.amount) ?? o.failureReason}
                            >
                              {sanitizeCustomerRefundNote(o.failureReason, o.amount)}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap">
                          {o.status === "SUCCESS" || o.status === "COMPLETED" ? (
                            <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                              {formatDateTime(o.completedAt ?? o.updatedAt ?? o.createdAt)}
                            </span>
                          ) : o.status === "PROCESSING" ? (
                            <span className="text-[11px] font-medium text-sky-600 dark:text-sky-400">In progress…</span>
                          ) : o.status === "FAILED" ? (
                            <span className="text-[11px] font-medium text-red-500 dark:text-red-400">Failed</span>
                          ) : (
                            <span className="text-[11px] text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-1.5">
                            {renderReportButton(o)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {detail.exports.length > 0 && (
              <p className="text-xs text-slate-400">
                Processed in {detail.exports.length} export file{detail.exports.length === 1 ? "" : "s"}:{" "}
                {detail.exports.map((e) => e.exportCode).join(", ")}
              </p>
            )}
          </div>
        )}
      </Dialog>

      <NotReceivedReportDetailDialog
        reportId={viewReportId}
        open={!!viewReportId}
        onClose={() => setViewReportId(null)}
      />
    </div>
  );
}

