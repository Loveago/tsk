"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeader, Spinner, EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Pagination } from "@/components/ui/pagination";
import { useToast } from "@/components/toast";
import { formatDateTime } from "@/lib/types";
import { orderCode } from "@/lib/utils";
import {
  Layers,
  Search,
  RefreshCw,
  Send,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Copy,
  ChevronRight,
  ShieldAlert,
  ArrowUpRight,
  Activity,
  Filter,
  Check,
  RotateCcw,
  Sparkles,
  Info,
} from "lucide-react";
import { ClickyfiedBatchDispatchButton } from "@/components/admin/clickyfied-batch-dispatch-button";

interface BatchItem {
  id: string;
  batchCode: string;
  clickyfiedOrderId: string | null;
  groupLabel: string | null;
  status: string;
  totalOrders: number;
  totalGb: number;
  totalAmount: number;
  processedCount: number;
  failedCount: number;
  pendingCount: number;
  actorLabel: string;
  idempotencyKey: string | null;
  errorMessage: string | null;
  rawFilteredOut: string | null;
  rawResponse: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    orders: number;
  };
}

interface BatchDetailItem extends BatchItem {
  parsedFilteredOut?: Array<{
    number: string;
    normPhone?: string;
    allocationGb?: number;
    reason?: string;
    type?: string;
  }>;
  parsedRawResponse?: any;
  orders: Array<{
    id: number;
    phoneNumber: string;
    network: string;
    gbAmount: number;
    amount: number;
    status: string;
    providerReference: string | null;
    externalReference: string | null;
    failureReason: string | null;
    createdAt: string;
    user?: {
      id: string;
      name: string | null;
      email: string;
      phone: string | null;
    };
    history?: Array<{
      id: number;
      status: string;
      note: string | null;
      changedBy: string | null;
      createdAt: string;
    }>;
  }>;
}

interface QueueStatus {
  batchEnabled: boolean;
  clickyfiedEnabled: boolean;
  pendingCount: number;
  totalGb: number;
  gbThreshold: number;
  timerMinutes: number;
  secondsRemaining: number;
  secondsElapsed: number;
  minutesElapsed: number;
  minutesRemaining: number;
  thresholdMet: boolean;
  timerExpired: boolean;
  group1Count: number;
  group1Gb: number;
  group2Count: number;
  group2Gb: number;
}

export default function AdminClickyfiedBatchesPage() {
  const { toast } = useToast();

  const [batches, setBatches] = React.useState<BatchItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [totalPages, setTotalPages] = React.useState(1);
  const [metrics, setMetrics] = React.useState({
    totalBatches: 0,
    totalGb: 0,
    totalOrders: 0,
    deliveredOrders: 0,
    failedOrders: 0,
    inFlightOrders: 0,
    processingBatches: 0,
  });

  // Live queue stats
  const [queueStatus, setQueueStatus] = React.useState<QueueStatus | null>(null);

  // Filters
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("ALL");
  const [groupFilter, setGroupFilter] = React.useState("ALL");

  // Inspect Modal
  const [inspectId, setInspectId] = React.useState<string | null>(null);
  const [batchDetail, setBatchDetail] = React.useState<BatchDetailItem | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [syncingBatchId, setSyncingBatchId] = React.useState<string | null>(null);
  const [retryingBatchId, setRetryingBatchId] = React.useState<string | null>(null);
  const [copiedText, setCopiedText] = React.useState<string | null>(null);
  const [showRawJson, setShowRawJson] = React.useState(false);

  // Auto-refresh state
  const [autoRefresh, setAutoRefresh] = React.useState(true);
  const [countdown, setCountdown] = React.useState(15);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
    toast(`${label} copied to clipboard`, "info");
  };

  // Fetch batches list
  const loadBatches = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (groupFilter !== "ALL") params.set("group", groupFilter);
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/admin/clickyfied-batches?${params}`);
      const data = await res.json();
      if (res.ok) {
        setBatches(data.batches || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
        if (data.metrics) setMetrics(data.metrics);
      }
    } catch {
      // ignore transient errors
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page, pageSize, statusFilter, groupFilter, search]);

  // Fetch live queue status
  const loadQueueStatus = React.useCallback(async () => {
    try {
      const res = await fetch("/api/admin/provider-apis/clickyfied-batch");
      if (res.ok) {
        const data = await res.json();
        setQueueStatus(data);
      }
    } catch {
      // ignore
    }
  }, []);

  // Fetch single batch detail
  const loadBatchDetail = React.useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/clickyfied-batches/${encodeURIComponent(id)}`);
      const data = await res.json();
      if (res.ok && data.batch) {
        setBatchDetail(data.batch);
      } else {
        toast(data.error || "Failed to load batch details", "error");
      }
    } catch {
      toast("Error loading batch details", "error");
    } finally {
      setDetailLoading(false);
    }
  }, [toast]);

  // Sync batch status from Clickyfied
  const handleSyncBatch = async (batchIdentifier: string) => {
    setSyncingBatchId(batchIdentifier);
    try {
      const res = await fetch(
        `/api/admin/clickyfied-batches/${encodeURIComponent(batchIdentifier)}/sync`,
        { method: "POST" }
      );
      const data = await res.json();
      if (res.ok && data.success) {
        toast(data.message || "Batch status synced with Clickyfied!", "success");
        await loadBatches(true);
        if (inspectId === batchIdentifier || batchDetail?.batchCode === batchIdentifier) {
          await loadBatchDetail(batchIdentifier);
        }
      } else {
        toast(data.error || "Sync failed with Clickyfied", "error");
      }
    } catch (err: any) {
      toast(err.message || "Network error syncing batch", "error");
    } finally {
      setSyncingBatchId(null);
    }
  };

  // Retry failed orders in batch
  const handleRetryFailed = async (batchIdentifier: string) => {
    if (!confirm(`Are you sure you want to retry all failed orders in batch ${batchIdentifier}? They will be returned to the pending queue.`)) {
      return;
    }
    setRetryingBatchId(batchIdentifier);
    try {
      const res = await fetch(
        `/api/admin/clickyfied-batches/${encodeURIComponent(batchIdentifier)}/retry`,
        { method: "POST" }
      );
      const data = await res.json();
      if (res.ok && data.success) {
        toast(data.message || "Failed orders returned to queue!", "success");
        await loadBatches(true);
        if (inspectId === batchIdentifier || batchDetail?.batchCode === batchIdentifier) {
          await loadBatchDetail(batchIdentifier);
        }
      } else {
        toast(data.error || "Retry failed", "error");
      }
    } catch (err: any) {
      toast(err.message || "Error retrying orders", "error");
    } finally {
      setRetryingBatchId(null);
    }
  };

  // Backfill historical batches trigger
  const handleBackfill = async () => {
    try {
      const res = await fetch("/api/admin/clickyfied-batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "backfill" }),
      });
      const data = await res.json();
      if (res.ok) {
        toast(data.message || `Backfilled ${data.count ?? 0} batches!`, "success");
        loadBatches();
      } else {
        toast(data.error || "Backfill failed", "error");
      }
    } catch {
      toast("Error running backfill", "error");
    }
  };

  // Auto-refresh timer
  React.useEffect(() => {
    loadBatches();
    loadQueueStatus();
  }, [loadBatches, loadQueueStatus]);

  React.useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          loadBatches(true);
          loadQueueStatus();
          return 15;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadBatches, loadQueueStatus]);

  React.useEffect(() => {
    if (inspectId) {
      loadBatchDetail(inspectId);
    } else {
      setBatchDetail(null);
      setShowRawJson(false);
    }
  }, [inspectId, loadBatchDetail]);

  const deliveryRate =
    metrics.totalOrders > 0
      ? Math.round((metrics.deliveredOrders / metrics.totalOrders) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* ── Top Header ────────────────────────────────────────── */}
      <PageHeader
        title={
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="flex items-center gap-2">
              <Layers className="h-6 w-6 text-brand-600 dark:text-brand-400" />
              Clickyfied Batches
            </span>
            {metrics.processingBatches > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-xs font-bold text-amber-600 dark:text-amber-400 animate-pulse">
                <Clock className="h-3 w-3" />
                {metrics.processingBatches} In-Flight
              </span>
            )}
          </div>
        }
        description="Monitor every batch sent to Clickyfied, inspect recipient entries, live status updates, and manage failed or blocked orders."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Auto refresh countdown */}
            <div className="hidden sm:flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-500 dark:border-white/10 dark:bg-[#0d1526] dark:text-slate-400">
              <span
                className={`h-2 w-2 rounded-full ${
                  autoRefresh ? "bg-emerald-500 animate-ping" : "bg-slate-400"
                }`}
              />
              <button
                type="button"
                onClick={() => setAutoRefresh(!autoRefresh)}
                className="hover:underline font-medium"
              >
                {autoRefresh ? `Auto-sync: ${countdown}s` : "Auto-sync: Paused"}
              </button>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                loadBatches();
                loadQueueStatus();
              }}
              disabled={loading}
              className="gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </Button>

            <ClickyfiedBatchDispatchButton onSuccess={() => void loadBatches()} />

            <Link
              href="/admin/orders"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
            >
              <span>All Orders</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>

            <Link
              href="/admin/order-api-logs"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
            >
              <Activity className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
              <span>API Logs</span>
            </Link>
          </div>
        }
      />

      {/* ── Metric Cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0d1526]">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Total Batches</span>
            <Layers className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {metrics.totalBatches.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {metrics.totalOrders.toLocaleString()} total recipients
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0d1526]">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Total Dispatched</span>
            <Send className="h-4 w-4 text-sky-600 dark:text-sky-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {metrics.totalGb.toLocaleString()} <span className="text-sm font-normal text-slate-400">GB</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">MTN Data volume</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0d1526]">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Delivered Orders</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {metrics.deliveredOrders.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {deliveryRate}% success rate
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0d1526]">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>In-Flight / Processing</span>
            <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-400">
            {metrics.inFlightOrders.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {metrics.processingBatches} active batch(es)
          </div>
        </div>

        <div className="col-span-2 sm:col-span-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0d1526]">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Failed / Blocked</span>
            <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-rose-600 dark:text-rose-400">
            {metrics.failedOrders.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-rose-500 dark:text-rose-400">
            Blocked by provider or rejected
          </div>
        </div>
      </div>

      {/* ── Live Queue Accumulator Bar ────────────────────────── */}
      {queueStatus && (
        <div className="rounded-xl border border-brand-500/20 bg-gradient-to-r from-brand-500/5 via-sky-500/5 to-purple-500/5 p-4 dark:border-brand-500/30">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-brand-500"></span>
              </span>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  Live Queue Accumulator
                  {queueStatus.pendingCount === 0 && (
                    <span className="text-xs font-normal text-slate-400">
                      (No pending orders waiting)
                    </span>
                  )}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {queueStatus.pendingCount > 0 ? (
                    <>
                      <strong className="text-slate-900 dark:text-white">
                        {queueStatus.pendingCount} orders ({queueStatus.totalGb} GB)
                      </strong>{" "}
                      accumulating · Next auto-dispatch in{" "}
                      <strong className="text-brand-600 dark:text-brand-400">
                        {Math.floor(queueStatus.secondsRemaining / 60)}m{" "}
                        {queueStatus.secondsRemaining % 60}s
                      </strong>{" "}
                      or upon reaching {queueStatus.gbThreshold} GB
                    </>
                  ) : (
                    "Ready to buffer incoming MTN orders into small (1-5 GB) & large (6+ GB) groups."
                  )}
                </p>
              </div>
            </div>

            {queueStatus.pendingCount > 0 && (
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Group 1: {queueStatus.group1Gb} GB ({queueStatus.group1Count}) · Group 2:{" "}
                    {queueStatus.group2Gb} GB ({queueStatus.group2Count})
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Threshold: {queueStatus.totalGb}/{queueStatus.gbThreshold} GB
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Progress bar towards volume threshold */}
          {queueStatus.pendingCount > 0 && (
            <div className="mt-3 w-full bg-slate-200 rounded-full h-1.5 dark:bg-white/10 overflow-hidden">
              <div
                className="bg-brand-600 h-1.5 rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((queueStatus.totalGb / queueStatus.gbThreshold) * 100)
                  )}%`,
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Filter Bar ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-[#0d1526]">
        <div className="flex flex-1 flex-wrap items-center gap-2 min-w-[280px]">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search batch code (CF-BATCH-...), provider ID, or phone..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-500 dark:border-white/10 dark:bg-[#0d1526] dark:text-white"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400 font-medium">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none transition focus:border-brand-500 dark:border-white/10 dark:bg-[#0d1526] dark:text-slate-200"
            >
              <option value="ALL">All Statuses</option>
              <option value="PROCESSING">Processing</option>
              <option value="COMPLETED">Completed</option>
              <option value="PARTIALLY_COMPLETED">Partially Completed</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>

          {/* Group Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400 font-medium">Group:</span>
            <select
              value={groupFilter}
              onChange={(e) => {
                setGroupFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none transition focus:border-brand-500 dark:border-white/10 dark:bg-[#0d1526] dark:text-slate-200"
            >
              <option value="ALL">All Groups</option>
              <option value="Group 1">Group 1 (1–5 GB)</option>
              <option value="Group 2">Group 2 (6+ GB)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {batches.length === 0 && !loading && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleBackfill}
              className="text-xs text-slate-600 dark:text-slate-300"
              title="Detect any past Clickyfied batches from previous orders and populate them into this view"
            >
              <Sparkles className="h-3.5 w-3.5 mr-1 text-brand-600" />
              Backfill Past Batches
            </Button>
          )}
        </div>
      </div>

      {/* ── Batches Table ─────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-white/10 dark:bg-[#0d1526]">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 text-slate-400">
            <Spinner className="h-8 w-8 text-brand-600 dark:text-brand-400 mb-2" />
            <p className="text-xs">Loading Clickyfied batches...</p>
          </div>
        ) : batches.length === 0 ? (
          <div className="p-12 text-center">
            <EmptyState
              icon={Layers}
              title="No Clickyfied batches found"
              description={
                search || statusFilter !== "ALL" || groupFilter !== "ALL"
                  ? "Try adjusting your filters or search query."
                  : "When MTN batch orders are dispatched to Clickyfied, they will appear here with complete real-time tracking."
              }
              action={
                <div className="mt-4 flex gap-2 justify-center">
                  <Button size="sm" variant="outline" onClick={handleBackfill}>
                    Scan For Past Batches
                  </Button>
                  <ClickyfiedBatchDispatchButton onSuccess={() => void loadBatches()} />
                </div>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50/75 text-slate-500 dark:border-white/10 dark:bg-white/[0.02] dark:text-slate-400 uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3">Batch Code</th>
                  <th className="px-4 py-3">Clickyfied Order ID</th>
                  <th className="px-4 py-3">Partition / Group</th>
                  <th className="px-4 py-3">Orders / Volume</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Delivery Breakdown</th>
                  <th className="px-4 py-3">Dispatched At</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {batches.map((batch) => {
                  const isProcessing = batch.status === "PROCESSING";
                  const isCompleted = batch.status === "COMPLETED";
                  const isFailed = batch.status === "FAILED";
                  const isPartial = batch.status === "PARTIALLY_COMPLETED";

                  const totalCount = batch.totalOrders || 1;
                  const successPct = Math.round((batch.processedCount / totalCount) * 100);
                  const failPct = Math.round((batch.failedCount / totalCount) * 100);

                  return (
                    <tr
                      key={batch.id}
                      className="hover:bg-slate-50/75 dark:hover:bg-white/[0.02] transition"
                    >
                      {/* Batch Code */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 font-mono font-bold text-slate-900 dark:text-white">
                          <span>{batch.batchCode}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(batch.batchCode, batch.batchCode)}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            title="Copy batch code"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                        {batch.errorMessage && (
                          <div className="mt-0.5 text-[11px] text-rose-500 font-normal line-clamp-1 max-w-[200px]" title={batch.errorMessage}>
                            {batch.errorMessage}
                          </div>
                        )}
                      </td>

                      {/* Clickyfied Order ID */}
                      <td className="px-4 py-3 font-mono">
                        {batch.clickyfiedOrderId ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-700 dark:text-slate-300 font-medium">
                              {batch.clickyfiedOrderId}
                            </span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(batch.clickyfiedOrderId!, "Order ID")}
                              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                              title="Copy Clickyfied Order ID"
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Pending assignment</span>
                        )}
                      </td>

                      {/* Partition / Group */}
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            batch.groupLabel?.includes("Group 1")
                              ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20"
                              : batch.groupLabel?.includes("Group 2")
                              ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                              : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"
                          }`}
                        >
                          {batch.groupLabel || "General"}
                        </span>
                      </td>

                      {/* Orders / Volume */}
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {batch.totalGb} GB
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {batch.totalOrders} order{batch.totalOrders === 1 ? "" : "s"} · GHS{" "}
                          {(batch.totalAmount || 0).toFixed(2)}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            isCompleted
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                              : isProcessing
                              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                              : isFailed
                              ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                              : isPartial
                              ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {isProcessing && <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />}
                          {isCompleted && <CheckCircle2 className="h-3 w-3" />}
                          {isFailed && <XCircle className="h-3 w-3" />}
                          {batch.status}
                        </span>
                      </td>

                      {/* Delivery Breakdown Bar */}
                      <td className="px-4 py-3 min-w-[150px]">
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span className="text-emerald-600 font-semibold">{batch.processedCount} done</span>
                          {batch.failedCount > 0 && (
                            <span className="text-rose-500 font-semibold">{batch.failedCount} failed</span>
                          )}
                          {batch.pendingCount > 0 && (
                            <span className="text-amber-500 font-semibold">{batch.pendingCount} pending</span>
                          )}
                        </div>
                        <div className="w-full bg-slate-200 dark:bg-white/10 rounded-full h-1.5 flex overflow-hidden">
                          <div
                            className="bg-emerald-500 h-1.5"
                            style={{ width: `${successPct}%` }}
                            title={`${batch.processedCount} Successful`}
                          />
                          <div
                            className="bg-rose-500 h-1.5"
                            style={{ width: `${failPct}%` }}
                            title={`${batch.failedCount} Failed`}
                          />
                          <div
                            className="bg-amber-400 h-1.5"
                            style={{
                              width: `${Math.max(
                                0,
                                100 - successPct - failPct
                              )}%`,
                            }}
                            title={`${batch.pendingCount} Processing`}
                          />
                        </div>
                      </td>

                      {/* Timestamp */}
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                        <div>{formatDateTime(batch.createdAt)}</div>
                        {batch.lastSyncedAt && (
                          <div className="text-[10px] text-slate-400">
                            Synced {formatDateTime(batch.lastSyncedAt)}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setInspectId(batch.id)}
                            className="h-7 px-2.5 text-xs font-semibold gap-1 text-slate-700 dark:text-slate-200"
                          >
                            <span>Inspect</span>
                            <ChevronRight className="h-3 w-3" />
                          </Button>

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleSyncBatch(batch.batchCode)}
                            disabled={syncingBatchId === batch.batchCode}
                            className="h-7 px-2 text-xs font-medium text-brand-600 dark:text-brand-400"
                            title="Sync live status with Clickyfied"
                          >
                            <RefreshCw
                              className={`h-3 w-3 ${
                                syncingBatchId === batch.batchCode ? "animate-spin" : ""
                              }`}
                            />
                          </Button>

                          {batch.failedCount > 0 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRetryFailed(batch.batchCode)}
                              disabled={retryingBatchId === batch.batchCode}
                              className="h-7 px-2 text-xs font-medium text-amber-600 dark:text-amber-400"
                              title="Retry failed orders in this batch"
                            >
                              <RotateCcw
                                className={`h-3 w-3 ${
                                  retryingBatchId === batch.batchCode ? "animate-spin" : ""
                                }`}
                              />
                            </Button>
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
          <div className="border-t border-slate-200 p-4 dark:border-white/10">
            <Pagination
              page={page}
              pages={totalPages}
              total={total}
              onPage={setPage}
              pageSize={pageSize}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setPage(1);
              }}
            />
          </div>
        )}
      </div>

      {/* ── Batch Detail Modal ─────────────────────────────────── */}
      <Dialog
        open={Boolean(inspectId)}
        onClose={() => setInspectId(null)}
        title="Batch Details"
        className="max-w-4xl max-h-[90vh] overflow-y-auto"
      >
        {detailLoading && !batchDetail ? (
          <div className="flex flex-col items-center justify-center p-12 text-slate-400">
            <Spinner className="h-8 w-8 text-brand-600 mb-2" />
            <p className="text-xs">Fetching batch details from database...</p>
          </div>
        ) : batchDetail ? (
          <div className="space-y-6">
            {/* Modal Header */}
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-white/10">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold font-mono text-slate-900 dark:text-white">
                    {batchDetail.batchCode}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      batchDetail.status === "COMPLETED"
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : batchDetail.status === "PROCESSING"
                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        : "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {batchDetail.status}
                  </span>
                  <span className="text-xs text-slate-400">
                    {batchDetail.groupLabel || "General Group"}
                  </span>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                  {batchDetail.clickyfiedOrderId && (
                    <span className="font-mono">
                      Clickyfied ID:{" "}
                      <strong className="text-slate-700 dark:text-slate-200">
                        {batchDetail.clickyfiedOrderId}
                      </strong>
                    </span>
                  )}
                  <span>Dispatched: {formatDateTime(batchDetail.createdAt)}</span>
                  {batchDetail.lastSyncedAt && (
                    <span>Last Synced: {formatDateTime(batchDetail.lastSyncedAt)}</span>
                  )}
                  <span>Actor: {batchDetail.actorLabel}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSyncBatch(batchDetail.batchCode)}
                  disabled={syncingBatchId === batchDetail.batchCode}
                  className="gap-1.5 text-xs"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${
                      syncingBatchId === batchDetail.batchCode ? "animate-spin" : ""
                    }`}
                  />
                  <span>Sync Status Now</span>
                </Button>

                {batchDetail.failedCount > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRetryFailed(batchDetail.batchCode)}
                    disabled={retryingBatchId === batchDetail.batchCode}
                    className="gap-1.5 text-xs text-amber-600 dark:text-amber-400 border-amber-500/30"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Retry Failed ({batchDetail.failedCount})</span>
                  </Button>
                )}
              </div>
            </div>

            {/* Error Message Alert (if any) */}
            {batchDetail.errorMessage && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-700 dark:text-rose-300">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500 mt-0.5" />
                  <div>
                    <strong className="font-bold">Provider Dispatch Notice:</strong>
                    <div className="mt-1 font-mono">{batchDetail.errorMessage}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Blocked / Filtered Out Entries Alert */}
            {batchDetail.parsedFilteredOut && batchDetail.parsedFilteredOut.length > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-800 dark:text-amber-200">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
                  <div className="w-full">
                    <strong className="font-bold text-sm">
                      Blocked Numbers ({batchDetail.parsedFilteredOut.length})
                    </strong>
                    <p className="mt-1 text-xs">
                      The following phone numbers were rejected or filtered out by Clickyfied:
                    </p>
                    <div className="mt-2 divide-y divide-amber-500/20 max-h-40 overflow-y-auto rounded-lg border border-amber-500/20 bg-white/40 dark:bg-black/20 p-2">
                      {batchDetail.parsedFilteredOut.map((fo, idx) => (
                        <div key={idx} className="py-1 flex items-center justify-between font-mono text-[11px]">
                          <div>
                            <span className="font-bold">{fo.number}</span>
                            {fo.allocationGb && (
                              <span className="text-slate-500 ml-1.5">({fo.allocationGb} GB)</span>
                            )}
                          </div>
                          <span className="text-rose-600 dark:text-rose-400 text-right">
                            {fo.reason || "Blocked by provider"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Metrics Breakdown Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 dark:border-white/10 dark:bg-white/[0.02]">
                <div className="text-[11px] text-slate-500">Total Volume</div>
                <div className="text-lg font-bold text-slate-900 dark:text-white">
                  {batchDetail.totalGb} GB
                </div>
                <div className="text-[10px] text-slate-400">
                  GHS {(batchDetail.totalAmount || 0).toFixed(2)}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 dark:border-white/10 dark:bg-white/[0.02]">
                <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                  Delivered
                </div>
                <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                  {batchDetail.processedCount}
                </div>
                <div className="text-[10px] text-slate-400">
                  {Math.round((batchDetail.processedCount / (batchDetail.totalOrders || 1)) * 100)}% complete
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 dark:border-white/10 dark:bg-white/[0.02]">
                <div className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold">
                  Failed / Blocked
                </div>
                <div className="text-lg font-bold text-rose-600 dark:text-rose-400">
                  {batchDetail.failedCount}
                </div>
                <div className="text-[10px] text-slate-400">Excluded from delivery</div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 dark:border-white/10 dark:bg-white/[0.02]">
                <div className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold">
                  Pending / In-Flight
                </div>
                <div className="text-lg font-bold text-amber-600 dark:text-amber-400">
                  {batchDetail.pendingCount}
                </div>
                <div className="text-[10px] text-slate-400">Awaiting provider callback</div>
              </div>
            </div>

            {/* Recipient Orders Table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  Recipients & Orders ({batchDetail.orders?.length || 0})
                </h4>
              </div>

              <div className="rounded-xl border border-slate-200 overflow-hidden dark:border-white/10 max-h-80 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 border-b border-slate-200 bg-slate-100/90 text-slate-500 dark:border-white/10 dark:bg-[#141e33] dark:text-slate-400 uppercase font-semibold">
                    <tr>
                      <th className="px-3 py-2">Order</th>
                      <th className="px-3 py-2">Recipient Phone</th>
                      <th className="px-3 py-2">Bundle</th>
                      <th className="px-3 py-2">Provider Status</th>
                      <th className="px-3 py-2">Provider Ref / Entry</th>
                      <th className="px-3 py-2">Customer</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-mono">
                    {batchDetail.orders?.map((ord) => {
                      const isOrdSuccess = ord.status === "SUCCESS";
                      const isOrdFailed = ord.status === "FAILED";
                      const isOrdProcessing = ord.status === "PROCESSING";

                      return (
                        <tr
                          key={ord.id}
                          className="hover:bg-slate-50/75 dark:hover:bg-white/[0.02] transition"
                        >
                          <td className="px-3 py-2 font-bold text-slate-900 dark:text-white">
                            <Link
                              href={`/admin/orders?q=${ord.phoneNumber}`}
                              className="text-brand-600 hover:underline"
                            >
                              {orderCode(ord.id)}
                            </Link>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1 font-bold text-slate-900 dark:text-white">
                              <span>{ord.phoneNumber}</span>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(ord.phoneNumber, ord.phoneNumber)}
                                className="text-slate-400 hover:text-slate-600"
                              >
                                <Copy className="h-3 w-3" />
                              </button>
                            </div>
                            {ord.failureReason && (
                              <div className="text-[10px] text-rose-500 font-normal">
                                {ord.failureReason}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              {ord.gbAmount} GB
                            </span>
                            <span className="text-slate-400 ml-1">({ord.network})</span>
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                                isOrdSuccess
                                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                  : isOrdFailed
                                  ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                                  : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                              }`}
                            >
                              {ord.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-[11px] text-slate-600 dark:text-slate-400">
                            {ord.providerReference ? (
                              <span title={ord.providerReference}>
                                {ord.providerReference.replace(/^CLICKYFIED:/, "")}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">None</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-[11px] font-sans text-slate-600 dark:text-slate-300">
                            {ord.user ? (
                              <div>
                                <div className="font-semibold">{ord.user.name || "User"}</div>
                                <div className="text-[10px] text-slate-400">{ord.user.email}</div>
                              </div>
                            ) : (
                              <span className="text-slate-400">Guest</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Raw JSON Debug Viewer */}
            <div className="border-t border-slate-200 pt-3 dark:border-white/10">
              <button
                type="button"
                onClick={() => setShowRawJson(!showRawJson)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1"
              >
                <span>{showRawJson ? "Hide" : "View"} Raw Clickyfied Response</span>
              </button>
              {showRawJson && (
                <pre className="mt-2 p-3 rounded-xl bg-slate-900 text-slate-200 text-[11px] font-mono overflow-x-auto max-h-60">
                  {batchDetail.rawResponse
                    ? JSON.stringify(JSON.parse(batchDetail.rawResponse), null, 2)
                    : "No raw response stored."}
                </pre>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4 dark:border-white/10">
              <Button variant="outline" size="sm" onClick={() => setInspectId(null)}>
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
