"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Search,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader, StatCard } from "@/components/shared";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";

interface AdhRejectedOrder {
  id: number;
  phoneNumber: string;
  network: string;
  gbAmount: number;
  amount: number;
  status: string;
  source: string;
  providerReference: string | null;
  failureReason: string | null;
  exportCount: number;
  lastExportedAt: string | null;
  lastExportedBy: string | null;
  createdAt: string;
  updatedAt: string;
  packageName: string | null;
  batchCode: string | null;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  storefrontOrder: {
    seq: number;
    paymentReference: string;
    storefront: { name: string; slug: string } | null;
  } | null;
}

export default function AdminAdhRejectionsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [orders, setOrders] = React.useState<AdhRejectedOrder[]>([]);
  const [isAdhMtnActive, setIsAdhMtnActive] = React.useState(false);
  const [mtnProvider, setMtnProvider] = React.useState("MANUAL");
  const [stats, setStats] = React.useState({
    pendingCount: 0,
    pendingGb: 0,
    pendingAmountGhs: 0,
    processingCount: 0,
    totalCount: 0,
  });

  const [statusFilter, setStatusFilter] = React.useState("PENDING");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pages, setPages] = React.useState(1);
  const [total, setTotal] = React.useState(0);

  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(new Set());
  const [markProcessingOnExport, setMarkProcessingOnExport] = React.useState(true);
  const [exporting, setExporting] = React.useState<"excel" | "txt" | null>(null);
  const [updating, setUpdating] = React.useState(false);

  const loadOrders = React.useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        status: statusFilter,
        page: String(page),
        pageSize: "50",
      });
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/admin/adh-rejections?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load ADH rejections");

      setOrders(data.orders || []);
      setIsAdhMtnActive(Boolean(data.isAdhMtnActive));
      setMtnProvider(data.mtnProvider || "MANUAL");
      setStats(
        data.stats || {
          pendingCount: 0,
          pendingGb: 0,
          pendingAmountGhs: 0,
          processingCount: 0,
          totalCount: 0,
        }
      );
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } catch (err: any) {
      toast(err?.message || "Failed to load ADH rejections", "error");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page, search, toast]);

  React.useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (orders.length > 0 && selectedIds.size === orders.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(orders.map((o) => o.id)));
    }
  };

  const handleExport = async (format: "excel" | "txt") => {
    try {
      setExporting(format);
      const res = await fetch("/api/admin/adh-rejections/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          orderIds: selectedIds.size > 0 ? Array.from(selectedIds) : undefined,
          markProcessing: markProcessingOnExport,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to export rejected orders");
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/i);
      const filename =
        match?.[1] ||
        `ADH_MTN_Rejections.${format === "txt" ? "txt" : "xlsx"}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast(
        `Exported ${selectedIds.size > 0 ? selectedIds.size : "pending"} ADH rejection(s) as ${format.toUpperCase()}`,
        "success"
      );
      setSelectedIds(new Set());
      await loadOrders();
    } catch (err: any) {
      toast(err?.message || "Export failed", "error");
    } finally {
      setExporting(null);
    }
  };

  const handleStatusUpdate = async (ids: number[], nextStatus: string) => {
    if (ids.length === 0 || updating) return;
    try {
      setUpdating(true);
      const res = await fetch("/api/admin/adh-rejections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: ids, status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update status");

      if (data.retried) {
        toast(
          `Retried ${data.total ?? ids.length} order(s): ${data.dispatched ?? 0} dispatched, ${data.failed ?? 0} failed/rejected`,
          "success"
        );
      } else {
        toast(`Updated ${data.updatedCount ?? ids.length} order(s) to ${nextStatus}`, "success");
      }
      setSelectedIds(new Set());
      await loadOrders();
    } catch (err: any) {
      toast(err?.message || "Failed to update status", "error");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="ADH Group MTN Rejections"
        description="Export MTN numbers rejected by ADH Group for fulfillment elsewhere, and update their statuses across the site."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/admin/settings">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Settings className="h-3.5 w-3.5" />
                <span>Provider Settings</span>
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={loadOrders}
              disabled={loading}
              className="gap-1.5"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              <span>Refresh</span>
            </Button>
          </div>
        }
      />

      {isAdhMtnActive ? (
        <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/70 p-3.5 text-xs text-emerald-900 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-200 flex items-center gap-2.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>
            <strong>ADH Group is ACTIVE for MTN.</strong> Unverified or restricted numbers rejected by ADH Group automatically appear here so you can export, fulfill elsewhere, and update their status.
          </span>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-3.5 text-xs text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200 flex items-center gap-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <span>
            <strong>ADH Group is not currently active for MTN</strong> (current MTN route:{" "}
            <code className="font-mono font-semibold">{mtnProvider}</code>). Orders routed via Clickyfied follow the normal Clickyfied flow. Any previously held ADH Group rejections can still be exported and updated below.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Pending Rejections"
          value={stats.pendingCount}
          hint="Ready to export & replace"
        />
        <StatCard
          title="Pending Data Volume"
          value={`${stats.pendingGb} GB`}
          hint={`GHS ${stats.pendingAmountGhs.toFixed(2)} value`}
        />
        <StatCard
          title="Processing (Exported)"
          value={stats.processingCount}
          hint="Awaiting completion update"
        />
        <StatCard
          title="All ADH Rejections"
          value={stats.totalCount}
          hint="Historical & active total"
        />
      </div>

      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {["PENDING", "PROCESSING", "SUCCESS", "REFUNDED", "ALL"].map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setStatusFilter(tab);
                  setPage(1);
                  setSelectedIds(new Set());
                }}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer",
                  statusFilter === tab
                    ? "bg-brand-600 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                )}
              >
                {tab === "SUCCESS" ? "COMPLETED" : tab}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-56">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search phone, #ID, reason..."
                className="pl-8 h-8 text-xs"
              />
            </div>

            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer px-2">
              <input
                type="checkbox"
                checked={markProcessingOnExport}
                onChange={(e) => setMarkProcessingOnExport(e.target.checked)}
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <span>Mark Processing on export</span>
            </label>

            <Button
              size="sm"
              variant="outline"
              disabled={exporting !== null || (selectedIds.size === 0 && stats.pendingCount === 0)}
              onClick={() => handleExport("excel")}
              className="gap-1.5 h-8 text-xs"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
              <span>
                {exporting === "excel"
                  ? "Exporting..."
                  : selectedIds.size > 0
                  ? `Export Selected (${selectedIds.size}) Excel`
                  : "Export Pending (Excel)"}
              </span>
            </Button>

            <Button
              size="sm"
              variant="outline"
              disabled={exporting !== null || (selectedIds.size === 0 && stats.pendingCount === 0)}
              onClick={() => handleExport("txt")}
              className="gap-1.5 h-8 text-xs"
            >
              <FileText className="h-3.5 w-3.5 text-blue-600" />
              <span>
                {exporting === "txt"
                  ? "Exporting..."
                  : selectedIds.size > 0
                  ? `Export Selected (${selectedIds.size}) TXT`
                  : "Export Pending (TXT)"}
              </span>
            </Button>
          </div>
        </div>

        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-200 bg-brand-50/70 px-3.5 py-2.5 dark:border-brand-800/50 dark:bg-brand-950/30">
            <span className="text-xs font-semibold text-brand-900 dark:text-brand-200">
              {selectedIds.size} order{selectedIds.size === 1 ? "" : "s"} selected
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                disabled={updating}
                onClick={() => handleStatusUpdate(Array.from(selectedIds), "PROCESSING")}
                className="h-7 text-xs"
              >
                Mark Processing
              </Button>
              <Button
                size="sm"
                disabled={updating}
                onClick={() => handleStatusUpdate(Array.from(selectedIds), "SUCCESS")}
                className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Mark Completed
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={updating}
                onClick={() => handleStatusUpdate(Array.from(selectedIds), "REFUNDED")}
                className="h-7 text-xs text-rose-700 border-rose-300 hover:bg-rose-50 dark:text-rose-300 dark:border-rose-700"
              >
                Refund
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={updating}
                onClick={() => handleStatusUpdate(Array.from(selectedIds), "RETRY_ADH")}
                className="h-7 text-xs text-orange-700 border-orange-300 hover:bg-orange-50 dark:text-orange-300 dark:border-orange-700"
              >
                Retry ADH Group
              </Button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 uppercase tracking-wider border-b border-slate-200/80 dark:border-slate-800">
              <tr>
                <th className="px-3 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={orders.length > 0 && selectedIds.size === orders.length}
                    onChange={toggleSelectAll}
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                </th>
                <th className="px-3 py-3">Order</th>
                <th className="px-3 py-3">Recipient</th>
                <th className="px-3 py-3">Bundle</th>
                <th className="px-3 py-3">Customer / Store</th>
                <th className="px-3 py-3">Rejection Reason</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Exported</th>
                <th className="px-3 py-3 text-right">Update Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                    Loading ADH Group rejections...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                    No ADH Group rejected orders found for this filter.
                  </td>
                </tr>
              ) : (
                orders.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(o.id)}
                        onChange={() => toggleSelect(o.id)}
                        className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      />
                    </td>
                    <td className="px-3 py-3 font-mono font-semibold text-slate-900 dark:text-white">
                      <div>#{o.id}</div>
                      <div className="text-[10px] font-normal text-slate-400">
                        {new Date(o.createdAt).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono font-semibold text-slate-900 dark:text-white">
                      {o.phoneNumber}
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">
                        {o.gbAmount} GB
                      </div>
                      <div className="text-[11px] text-slate-500">
                        GHS {o.amount.toFixed(2)}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {o.storefrontOrder ? (
                        <div>
                          <span className="inline-flex items-center rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
                            Storefront
                          </span>
                          <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                            {o.storefrontOrder.storefront?.name || o.storefrontOrder.paymentReference}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="font-medium text-slate-800 dark:text-slate-200">
                            {o.user?.name || "—"}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate max-w-[140px]">
                            {o.user?.email}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 max-w-[220px]">
                      <span
                        title={o.failureReason || "Rejected by ADH Group"}
                        className="text-[11px] text-orange-800 dark:text-orange-300 line-clamp-2"
                      >
                        {o.failureReason || "ADH Group MTN Rejection"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="px-3 py-3 text-[11px] text-slate-500">
                      {o.exportCount > 0 ? (
                        <div>
                          <div className="font-medium text-slate-700 dark:text-slate-300">
                            {o.exportCount}x
                          </div>
                          {o.lastExportedAt && (
                            <div className="text-[10px] text-slate-400">
                              {new Date(o.lastExportedAt).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      ) : (
                        "Not yet"
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <select
                        defaultValue=""
                        disabled={updating}
                        onChange={(ev) => {
                          const val = ev.target.value;
                          if (val) {
                            handleStatusUpdate([o.id], val);
                            ev.target.value = "";
                          }
                        }}
                        className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 outline-none hover:border-brand-500 dark:border-white/10 dark:bg-[#0d1526] dark:text-slate-100 cursor-pointer"
                      >
                        <option value="" disabled>
                          Update ▾
                        </option>
                        <option value="PENDING">Pending</option>
                        <option value="PROCESSING">Processing</option>
                        <option value="SUCCESS">Completed</option>
                        <option value="REFUNDED">Refund</option>
                        <option value="RETRY_ADH">Retry ADH Group</option>
                      </select>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between pt-2 text-xs text-slate-500">
            <span>
              Showing page {page} of {pages} ({total} orders)
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= pages}
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
