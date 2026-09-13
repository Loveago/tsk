"use client";

import * as React from "react";
import { PageHeader, EmptyState, Spinner } from "@/components/shared";
import { StatusBadge } from "@/components/status-badge";
import { BatchStatusBadge, BatchStatsChips, type BatchStats } from "@/components/batches/batch-ui";
import { ProgressBar } from "@/components/ui/progress";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { formatDateTime, formatGHS } from "@/lib/types";
import { orderCode } from "@/lib/utils";
import { ChevronRight, FileWarning, Layers, Search } from "lucide-react";

const NETWORKS = ["MTN", "TELECEL", "AIRTELTIGO"] as const;
const BATCH_STATUSES = ["PENDING", "PROCESSING", "PARTIALLY_COMPLETED", "COMPLETED", "FAILED", "CANCELLED"];
const REPORT_REASONS = ["Data not received", "Partial data received", "Wrong number sent", "Other"];

interface BatchRow {
  id: string;
  batchCode: string;
  network: string;
  status: string;
  totalRecipients: number;
  totalGb: number;
  totalAmount: number;
  createdAt: string;
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
}

interface BatchDetail {
  batch: BatchRow & { updatedAt: string };
  orders: DetailOrder[];
  stats: BatchStats;
  progress: number;
  exports: Array<{ id: string; exportCode: string; network: string; isReexport: boolean; createdAt: string }>;
}

const selectCls =
  "h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-brand-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100";

export default function OrdersPage() {
  const { toast } = useToast();
  const [rows, setRows] = React.useState<BatchRow[]>([]);
  const [pages, setPages] = React.useState(1);
  const [page, setPage] = React.useState(1);
  const [network, setNetwork] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [q, setQ] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [detail, setDetail] = React.useState<BatchDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [reportOrder, setReportOrder] = React.useState<DetailOrder | null>(null);
  const [reason, setReason] = React.useState(REPORT_REASONS[0]);
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "12" });
    if (network) params.set("network", network);
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    try {
      const res = await fetch(`/api/orders/batches?${params}`);
      const json = await res.json();
      if (res.ok) {
        setRows(json.data ?? []);
        setPages(json.pages ?? 1);
      }
    } finally {
      setLoading(false);
    }
  }, [page, network, status, q]);

  React.useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/orders/batches/${id}`);
      const json = await res.json();
      if (res.ok) setDetail(json);
      else toast(json.error ?? "Failed to load batch", "error");
    } finally {
      setDetailLoading(false);
    }
  };

  const fileReport = async () => {
    if (!reportOrder) return;
    setBusy(true);
    try {
      const res = await fetch("/api/reports/not-received", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: reportOrder.id, reason, message: message || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? "Failed to file report", "error");
        return;
      }
      toast("Report filed — our team will investigate", "success");
      setReportOrder(null);
      setMessage("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Sent Orders"
        description="Orders are grouped into batches per network"
      />

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
            {n || "All networks"}
          </button>
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-2">
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
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              className={selectCls + " w-52 pl-8"}
              placeholder="Search batch or phone…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center rounded-2xl border border-slate-100 bg-white py-12 dark:border-slate-800 dark:bg-slate-900">
          <Spinner className="h-6 w-6 text-brand-600" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
          <EmptyState
            icon={Layers}
            title="No batches yet"
            description="Send an order from the Send Order page — recipients are grouped into a network batch."
          />
        </div>
      ) : (
        /* Horizontal line order history layout */
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-[#0d1526]">
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
                      <p className="mt-0.5 text-xs text-slate-400">{formatDateTime(b.createdAt)}</p>
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
        className="max-w-3xl"
      >
        {detailLoading || !detail ? (
          <div className="flex justify-center py-12">
            <Spinner className="h-6 w-6 text-brand-600" />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <BatchStatusBadge status={detail.batch.status} />
                <ProgressBar
                  value={detail.stats.completed + detail.stats.cancelled}
                  total={detail.stats.total}
                  className="max-w-xs"
                />
                <span className="text-xs font-semibold text-slate-500">{detail.progress}%</span>
              </div>
              <BatchStatsChips stats={detail.stats} className="mt-2" />
            </div>
            <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-100 dark:border-white/5">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white dark:bg-[#0d1526]">
                  <tr className="border-b border-slate-100 text-left text-xs text-slate-500 dark:border-white/5">
                    <th className="px-3 py-2 font-medium">Order</th>
                    <th className="px-3 py-2 font-medium">Phone</th>
                    <th className="px-3 py-2 font-medium">Size</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {detail.orders.map((o) => (
                    <tr key={o.id}>
                      <td className="px-3 py-2 font-mono text-xs font-semibold">{orderCode(o.id)}</td>
                      <td className="px-3 py-2">{o.phoneNumber}</td>
                      <td className="px-3 py-2">{o.gbAmount} GB</td>
                      <td className="px-3 py-2">
                        <StatusBadge status={o.status} />
                        {o.failureReason && (
                          <p className="mt-0.5 max-w-[150px] truncate text-[11px] text-red-500" title={o.failureReason}>
                            {o.failureReason}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1.5">
                          {/* Cancel order feature removed per user request */}
                          {/* Report only shows on completed orders (SUCCESS or COMPLETED) */}
                          {(o.status === "SUCCESS" || o.status === "COMPLETED") && (
                            <Button size="sm" variant="ghost" className="text-amber-600 dark:text-amber-400" onClick={() => setReportOrder(o)}>
                              <FileWarning className="h-3.5 w-3.5" /> Report
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

      <Dialog open={!!reportOrder} onClose={() => setReportOrder(null)} title="Report not received">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Reporting <strong className="font-mono">{reportOrder ? orderCode(reportOrder.id) : ""}</strong> to{" "}
            {reportOrder?.phoneNumber} ({reportOrder?.gbAmount} GB {reportOrder?.network}).
          </p>
          <select className={selectCls + " w-full"} value={reason} onChange={(e) => setReason(e.target.value)}>
            {REPORT_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <textarea
            className="h-20 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm outline-none transition focus:border-brand-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100"
            placeholder="Describe the issue (optional)"
            value={message}
            maxLength={600}
            onChange={(e) => setMessage(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setReportOrder(null)} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" onClick={fileReport} disabled={busy}>
              {busy ? <Spinner className="h-3.5 w-3.5" /> : "Submit report"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
