"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeader, Spinner, EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/toast";
import { formatDateTime } from "@/lib/types";
import { orderCode } from "@/lib/utils";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  Copy,
  ExternalLink,
  Filter,
  RefreshCw,
  Search,
  Server,
  Sliders,
  Terminal,
  Zap,
  RotateCcw,
} from "lucide-react";

interface OrderApiLogRow {
  id: number;
  orderId: number | null;
  provider: string;
  action: string;
  endpoint: string;
  method: string;
  requestPayload: string | null;
  responsePayload: string | null;
  statusCode: number | null;
  success: boolean;
  errorMessage: string | null;
  providerReference: string | null;
  durationMs: number | null;
  createdAt: string;
  order: {
    id: number;
    phoneNumber: string;
    network: string;
    gbAmount: number;
    amount: number;
    status: string;
    failureReason: string | null;
    createdAt: string;
    providerReference: string | null;
    externalReference: string | null;
  } | null;
}

interface Stats {
  total: number;
  failed: number;
  success: number;
  clickyfiedErrors: number;
  bigwindataErrors: number;
}

export default function OrderApiLogsPage() {
  const { toast } = useToast();
  const [logs, setLogs] = React.useState<OrderApiLogRow[]>([]);
  const [stats, setStats] = React.useState<Stats>({
    total: 0,
    failed: 0,
    success: 0,
    clickyfiedErrors: 0,
    bigwindataErrors: 0,
  });
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [totalCount, setTotalCount] = React.useState(0);

  // Filters
  const [search, setSearch] = React.useState("");
  const [provider, setProvider] = React.useState("ALL");
  const [status, setStatus] = React.useState("ALL");
  const [action, setAction] = React.useState("ALL");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");

  // Inspect Modal
  const [inspectLog, setInspectLog] = React.useState<OrderApiLogRow | null>(null);
  const [retryingId, setRetryingId] = React.useState<number | null>(null);
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  const loadLogs = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "25",
        provider,
        status,
        action,
      });
      if (search) params.set("search", search);
      if (from) params.set("from", from);
      if (to) params.set("to", to);

      const res = await fetch(`/api/admin/order-api-logs?${params}`);
      if (!res.ok) throw new Error("Failed to load Order API logs");
      const data = await res.json();

      setLogs(data.logs || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotalCount(data.pagination?.total || 0);
      if (data.stats) {
        setStats(data.stats);
      }
    } catch (err: any) {
      toast(err?.message || "Failed to load logs", "error");
    } finally {
      setLoading(false);
    }
  }, [page, provider, status, action, search, from, to, toast]);

  React.useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
    toast("Copied to clipboard", "info");
  };

  const handleRetryDispatch = async (orderId: number) => {
    setRetryingId(orderId);
    try {
      const res = await fetch("/api/admin/order-api-logs/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error || "Retry dispatch failed");
      }
      toast(
        `Order ${orderCode(orderId)} re-dispatched via ${data.provider}! Status: ${data.status || "PROCESSING"}`,
        "success"
      );
      loadLogs();
      if (inspectLog && inspectLog.orderId === orderId) {
        setInspectLog(null);
      }
    } catch (err: any) {
      toast(`Retry failed: ${err?.message}`, "error");
    } finally {
      setRetryingId(null);
    }
  };

  const formatJson = (val: string | null) => {
    if (!val) return "null";
    try {
      return JSON.stringify(JSON.parse(val), null, 2);
    } catch {
      return val;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Order API Logs"
        description="Monitor external provider API transactions (Clickyfied & Bigwindata), inspect payloads, and diagnose why order dispatches failed."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setStatus((prev) => (prev === "FAILED" ? "ALL" : "FAILED"));
                setPage(1);
              }}
              className={status === "FAILED" ? "border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" : ""}
            >
              <AlertCircle className="h-3.5 w-3.5 mr-1" />
              {status === "FAILED" ? "Showing Failed Only" : "Filter Failed Only"}
            </Button>
            <Link
              href="/admin/settings?tab=provider_apis"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
            >
              <Sliders className="h-3.5 w-3.5" />
              Provider Settings
            </Link>
            <Button size="sm" variant="outline" onClick={loadLogs} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        }
      />

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Total Calls */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total API Calls
            </p>
            <div className="rounded-xl bg-blue-500/10 p-2 text-blue-600 dark:text-blue-400">
              <Server className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-slate-900 dark:text-white">
            {stats.total.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate-500">Provider requests recorded</p>
        </div>

        {/* Card 2: Failed Calls */}
        <div className={`rounded-2xl border p-5 shadow-sm ${
          stats.failed > 0
            ? "border-rose-300 bg-rose-50/50 dark:border-rose-900/50 dark:bg-rose-950/20"
            : "border-slate-200/80 bg-white dark:border-white/10 dark:bg-slate-900"
        }`}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">
              API Errors / Failed
            </p>
            <div className="rounded-xl bg-rose-500/10 p-2 text-rose-600 dark:text-rose-400">
              <AlertCircle className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-rose-600 dark:text-rose-400">
            {stats.failed.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {stats.total > 0 ? `${((stats.failed / stats.total) * 100).toFixed(1)}% error rate` : "No failures recorded"}
          </p>
        </div>

        {/* Card 3: Successful Calls */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Successful Calls
            </p>
            <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {stats.success.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate-500">Accepted without provider errors</p>
        </div>

        {/* Card 4: Provider Breakdown */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Errors by Provider
            </p>
            <div className="rounded-xl bg-purple-500/10 p-2 text-purple-600 dark:text-purple-400">
              <Activity className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-center gap-4 text-xs font-bold">
            <div className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400">
              <span>Clickyfied:</span>
              <span className="font-mono text-base">{stats.clickyfiedErrors}</span>
            </div>
            <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
              <span>Bigwindata:</span>
              <span className="font-mono text-base">{stats.bigwindataErrors}</span>
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-500">Failed dispatch attempts</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by Order #, phone number, reference, or error message..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-[#0d1526] dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Provider Filter */}
            <select
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none transition focus:border-brand-500 dark:border-white/10 dark:bg-[#0d1526] dark:text-slate-100"
            >
              <option value="ALL">All Providers</option>
              <option value="CLICKYFIED">Clickyfied</option>
              <option value="BIGWINDATA">Bigwindata</option>
            </select>

            {/* Status Filter */}
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none transition focus:border-brand-500 dark:border-white/10 dark:bg-[#0d1526] dark:text-slate-100"
            >
              <option value="ALL">All Statuses</option>
              <option value="FAILED">Errors & Failures Only</option>
              <option value="SUCCESS">Success Only</option>
            </select>

            {/* Action Filter */}
            <select
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none transition focus:border-brand-500 dark:border-white/10 dark:bg-[#0d1526] dark:text-slate-100"
            >
              <option value="ALL">All Actions</option>
              <option value="SUBMIT_ORDER">Submit Order</option>
              <option value="SYNC_ORDER">Sync Status</option>
              <option value="NOT_RECEIVED">Not Received</option>
            </select>

            {/* Clear button */}
            {(search || provider !== "ALL" || status !== "ALL" || action !== "ALL" || from || to) && (
              <button
                onClick={() => {
                  setSearch("");
                  setProvider("ALL");
                  setStatus("ALL");
                  setAction("ALL");
                  setFrom("");
                  setTo("");
                  setPage(1);
                }}
                className="h-9 rounded-xl bg-slate-100 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-200 dark:bg-white/10 dark:text-slate-300 dark:hover:bg-white/20"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner className="h-8 w-8 text-brand-600" />
          </div>
        ) : logs.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No Order API logs found"
            description="Provider API dispatches and synchronization records will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50/80 text-[11px] uppercase tracking-wider text-slate-500 dark:border-white/5 dark:bg-white/[0.02] dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">Timestamp</th>
                  <th className="px-4 py-3 font-semibold">Order Details</th>
                  <th className="px-4 py-3 font-semibold">Provider</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                  <th className="px-4 py-3 font-semibold">Status / Latency</th>
                  <th className="px-4 py-3 font-semibold">Result</th>
                  <th className="px-4 py-3 font-semibold">Why it Failed / Message</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {logs.map((log) => {
                  const isClickyfied = log.provider === "CLICKYFIED";
                  const isBigwin = log.provider === "BIGWINDATA";
                  return (
                    <tr
                      key={log.id}
                      className="transition-colors hover:bg-slate-50/70 dark:hover:bg-white/[0.03]"
                    >
                      {/* Timestamp */}
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {formatDateTime(log.createdAt)}
                      </td>

                      {/* Order Details */}
                      <td className="px-4 py-3">
                        {log.order ? (
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-slate-900 dark:text-white">
                                {orderCode(log.order.id)}
                              </span>
                              <span className="rounded bg-slate-100 px-1 py-0.2 text-[10px] font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-300">
                                {log.order.network}
                              </span>
                            </div>
                            <p className="mt-0.5 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                              {log.order.phoneNumber} · {log.order.gbAmount} GB
                            </p>
                          </div>
                        ) : log.orderId ? (
                          <span className="font-mono font-bold text-slate-900 dark:text-white">
                            {orderCode(log.orderId)}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">General / Test</span>
                        )}
                      </td>

                      {/* Provider */}
                      <td className="px-4 py-3">
                        {isClickyfied ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                            🚀 Clickyfied
                          </span>
                        ) : isBigwin ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                            ⚡ Bigwindata
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:text-slate-400">
                            {log.provider}
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3">
                        <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-300">
                          {log.action}
                        </span>
                      </td>

                      {/* Status / Latency */}
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px]">
                        <span
                          className={`font-bold ${
                            !log.statusCode || log.statusCode >= 400
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-emerald-600 dark:text-emerald-400"
                          }`}
                        >
                          {log.statusCode ? `HTTP ${log.statusCode}` : "ERR"}
                        </span>
                        {log.durationMs !== null && (
                          <span className="ml-1 text-[10px] text-slate-400">
                            · {log.durationMs}ms
                          </span>
                        )}
                      </td>

                      {/* Result */}
                      <td className="px-4 py-3">
                        {log.success ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" /> OK
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                            <AlertTriangle className="h-3 w-3" /> FAILED
                          </span>
                        )}
                      </td>

                      {/* Why it Failed / Message */}
                      <td className="px-4 py-3 max-w-[280px]">
                        {log.errorMessage ? (
                          <p
                            className="truncate font-semibold text-rose-600 dark:text-rose-400"
                            title={log.errorMessage}
                          >
                            {log.errorMessage}
                          </p>
                        ) : log.providerReference ? (
                          <p className="truncate font-mono text-[11px] text-slate-500" title={log.providerReference}>
                            Ref: {log.providerReference}
                          </p>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setInspectLog(log)}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            Inspect
                          </button>
                          {!log.success && log.orderId && (
                            <button
                              onClick={() => handleRetryDispatch(log.orderId!)}
                              disabled={retryingId === log.orderId}
                              className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-50"
                              title="Retry dispatching this order to the provider"
                            >
                              <RotateCcw className={`h-3 w-3 ${retryingId === log.orderId ? "animate-spin" : ""}`} />
                              Retry
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-white/5">
            <span>
              Page {page} of {totalPages} ({totalCount} total logs)
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold transition hover:bg-slate-50 disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/5"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold transition hover:bg-slate-50 disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/5"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Log Inspection Dialog */}
      <Dialog
        open={!!inspectLog}
        onClose={() => setInspectLog(null)}
        title={inspectLog ? `API Log: ${inspectLog.provider} ${inspectLog.action}` : "Log Details"}
        className="max-w-2xl max-h-[85vh] overflow-y-auto"
      >
        {inspectLog && (
          <div className="space-y-4 text-xs">
            {/* Failure Reason Callout */}
            {!inspectLog.success && (
              <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-4 dark:border-rose-900/50 dark:bg-rose-950/40">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-rose-900 dark:text-rose-200">
                      API Dispatch Failed
                    </h4>
                    <p className="mt-1 text-xs text-rose-800 dark:text-rose-300 font-mono leading-relaxed">
                      {inspectLog.errorMessage || "Unknown provider error occurred."}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Order Overview */}
            {inspectLog.order && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 dark:border-white/10 dark:bg-white/5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Associated Order
                    </p>
                    <p className="mt-1 font-mono text-sm font-bold text-slate-900 dark:text-white">
                      {orderCode(inspectLog.order.id)} · {inspectLog.order.network} · {inspectLog.order.phoneNumber}
                    </p>
                    <p className="mt-0.5 text-slate-500">
                      {inspectLog.order.gbAmount} GB · Current Status:{" "}
                      <span className="font-bold text-slate-900 dark:text-white">
                        {inspectLog.order.status}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Link
                      href="/admin/orders"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:underline dark:text-brand-400"
                    >
                      Orders Table <ExternalLink className="h-3 w-3" />
                    </Link>
                    {inspectLog.orderId && (
                      <button
                        onClick={() => handleRetryDispatch(inspectLog.orderId!)}
                        disabled={retryingId === inspectLog.orderId}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1 font-semibold text-white shadow transition hover:bg-brand-700 disabled:opacity-50"
                      >
                        <RotateCcw className={`h-3 w-3 ${retryingId === inspectLog.orderId ? "animate-spin" : ""}`} />
                        Retry Dispatch Now
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Request Summary Metadata */}
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 p-3 dark:border-white/10">
              <div>
                <span className="text-slate-400">Endpoint:</span>
                <p className="font-mono font-semibold break-all text-slate-800 dark:text-slate-200">
                  {inspectLog.method} {inspectLog.endpoint}
                </p>
              </div>
              <div>
                <span className="text-slate-400">HTTP Status:</span>
                <p className="font-mono font-semibold">
                  <span
                    className={
                      !inspectLog.statusCode || inspectLog.statusCode >= 400
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-emerald-600 dark:text-emerald-400"
                    }
                  >
                    {inspectLog.statusCode ? `${inspectLog.statusCode}` : "Network Error / Timeout"}
                  </span>
                  {inspectLog.durationMs !== null && (
                    <span className="ml-1 text-slate-400">({inspectLog.durationMs}ms)</span>
                  )}
                </p>
              </div>
              <div>
                <span className="text-slate-400">Provider Reference:</span>
                <p className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  {inspectLog.providerReference || "None"}
                </p>
              </div>
              <div>
                <span className="text-slate-400">Logged At:</span>
                <p className="font-mono text-slate-800 dark:text-slate-200">
                  {formatDateTime(inspectLog.createdAt)}
                </p>
              </div>
            </div>

            {/* Request Payload */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  Request Payload (Sent to {inspectLog.provider})
                </span>
                {inspectLog.requestPayload && (
                  <button
                    onClick={() => handleCopy(formatJson(inspectLog.requestPayload), "req")}
                    className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-300"
                  >
                    <Copy className="h-3 w-3" />
                    {copiedKey === "req" ? "Copied!" : "Copy"}
                  </button>
                )}
              </div>
              <pre className="max-h-48 overflow-auto rounded-xl bg-slate-950 p-3 font-mono text-[11px] text-emerald-400">
                {formatJson(inspectLog.requestPayload)}
              </pre>
            </div>

            {/* Response Payload */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  Response Payload (Returned by {inspectLog.provider})
                </span>
                {inspectLog.responsePayload && (
                  <button
                    onClick={() => handleCopy(formatJson(inspectLog.responsePayload), "res")}
                    className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-300"
                  >
                    <Copy className="h-3 w-3" />
                    {copiedKey === "res" ? "Copied!" : "Copy"}
                  </button>
                )}
              </div>
              <pre
                className={`max-h-56 overflow-auto rounded-xl bg-slate-950 p-3 font-mono text-[11px] ${
                  inspectLog.success ? "text-cyan-400" : "text-rose-400"
                }`}
              >
                {formatJson(inspectLog.responsePayload)}
              </pre>
            </div>

            {/* Close Button */}
            <div className="flex justify-end pt-2">
              <Button size="sm" variant="outline" onClick={() => setInspectLog(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
