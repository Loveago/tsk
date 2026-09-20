"use client";

import * as React from "react";
import { PageHeader, EmptyState, Spinner } from "@/components/shared";
import { BatchStatusBadge } from "@/components/batches/batch-ui";
import { ExportDetailSheet } from "@/components/admin/export-detail-sheet";
import { NetworkExportDialog } from "@/components/admin/network-export-dialog";
import { Pagination } from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatGHS } from "@/lib/types";
import { FileSpreadsheet, Download, RefreshCw, ChevronRight } from "lucide-react";

import { useToast } from "@/components/toast";

const NETWORKS = ["MTN", "TELECEL", "AIRTELTIGO", "AIRTELTIGO_BIGTIME"] as const;
const EXPORT_STATUSES = ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"];
const QUICK_RANGES = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 days" },
  { key: "month", label: "This month" },
];

const selectCls =
  "h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 placeholder:text-slate-400 dark:border-white/10 dark:bg-[#0d1526] dark:text-slate-100 dark:placeholder:text-slate-500 caret-brand-600 dark:caret-brand-400 [&>option]:bg-white dark:[&>option]:bg-[#0d1526]";

interface NetworkStat {
  network: string;
  pending: number;
  pendingGb: number;
  pendingAmount: number;
  processing: number;
  failed: number;
  successToday: number;
  activeBatches: number;
  lastExport: { exportCode: string; createdAt: string; adminLabel: string } | null;
}

interface ExportRow {
  id: string;
  exportCode: string;
  network: string;
  adminLabel: string;
  totalRecipients: number;
  totalGb: number;
  totalAmount: number;
  status: string;
  fileName: string;
  isReexport: boolean;
  note: string | null;
  createdAt: string;
  admin?: { name: string; email: string } | null;
  _count?: { orders: number };
}

export default function AdminExportsPage() {
  const { toast } = useToast();
  const [stats, setStats] = React.useState<NetworkStat[]>([]);
  const [rows, setRows] = React.useState<ExportRow[]>([]);
  const [pages, setPages] = React.useState(1);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);

  // Filters
  const [network, setNetwork] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [q, setQ] = React.useState("");
  const [quick, setQuick] = React.useState("");

  // Bulk selection
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  // Dialog state for per-network export
  const [dialogNetwork, setDialogNetwork] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "12" });
      if (network) params.set("network", network);
      if (status) params.set("status", status);
      if (q) params.set("q", q);
      if (quick) params.set("quick", quick);

      const [statsRes, listRes] = await Promise.all([
        fetch("/api/admin/network-stats"),
        fetch(`/api/admin/exports?${params}`),
      ]);
      const statsJson = await statsRes.json();
      const listJson = await listRes.json();
      if (statsRes.ok) setStats(statsJson.stats ?? []);
      if (listRes.ok) {
        setRows(listJson.data ?? []);
        setPages(listJson.pages ?? 1);
      }
    } finally {
      setLoading(false);
    }
  }, [page, network, status, q, quick]);

  React.useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const handleStatusChange = async (exportId: string, action: string) => {
    try {
      const res = await fetch(`/api/admin/exports/${exportId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, force: true }),
      });
      const json = await res.json();
      if (!res.ok) return toast(json.error ?? "Failed to update export status", "error");
      toast(`Export status updated (${json.applied ?? 0} orders updated)`, "success");
      load();
    } catch {
      toast("Error updating export status", "error");
    }
  };

  const handleBulkStatus = async (action: string) => {
    if (selectedIds.size === 0) return;
    try {
      const ids = Array.from(selectedIds);
      let successCount = 0;
      for (const id of ids) {
        const res = await fetch(`/api/admin/exports/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, force: true }),
        });
        if (res.ok) successCount++;
      }
      toast(`Updated ${successCount} export(s) successfully`, "success");
      setSelectedIds(new Set());
      load();
    } catch {
      toast("Error during bulk export status update", "error");
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === rows.length && rows.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)));
    }
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Export Center"
        description="Generate per-network Excel files — PENDING recipients move to PROCESSING on export"
        actions={
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={"h-3.5 w-3.5" + (loading ? " animate-spin" : "")} /> Refresh
          </Button>
        }
      />

      {/* Per-network queue cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((s) => (
          <div
            key={s.network}
            className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-[#0d1526]"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-bold tracking-wide">{s.network}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {s.activeBatches} active batch{s.activeBatches === 1 ? "" : "es"}
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => setDialogNetwork(s.network)}
                className="gap-1.5"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Export
              </Button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-amber-50 p-3 dark:bg-amber-500/10">
                <p className="text-xs text-amber-700 dark:text-amber-400">Pending queue</p>
                <p className="mt-0.5 text-xl font-bold text-amber-700 dark:text-amber-400">{s.pending}</p>
                <p className="text-xs text-amber-600/70 dark:text-amber-400/70">
                  {s.pendingGb} GB · {formatGHS(s.pendingAmount)}
                </p>
              </div>
              <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                <p><span className="font-semibold text-blue-600 dark:text-blue-400">{s.processing}</span> processing</p>
                <p><span className="font-semibold text-red-600 dark:text-red-400">{s.failed}</span> failed</p>
                <p><span className="font-semibold text-emerald-600 dark:text-emerald-400">{s.successToday}</span> completed today</p>
              </div>
            </div>
            <p className="mt-3 truncate text-xs text-slate-400">
              {s.lastExport
                ? `Last export ${s.lastExport.exportCode} · ${formatDateTime(s.lastExport.createdAt)}`
                : "No exports yet"}
            </p>
          </div>
        ))}
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={selectCls}
            value={network}
            onChange={(e) => {
              setNetwork(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Networks</option>
            {NETWORKS.map((n) => (
              <option key={n} value={n}>
                {n === "AIRTELTIGO" ? "AT iShare" : n === "AIRTELTIGO_BIGTIME" ? "AT Big Time" : n}
              </option>
            ))}
          </select>
          <select
            className={selectCls}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Statuses</option>
            {EXPORT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
          <select
            className={selectCls}
            value={quick}
            onChange={(e) => {
              setQuick(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All time</option>
            {QUICK_RANGES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <input
          className={selectCls + " w-60"}
          placeholder="Search export code, admin…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-500/20 bg-brand-50/70 p-3 text-xs font-semibold text-brand-900 dark:bg-brand-500/10 dark:text-brand-200">
          <span>{selectedIds.size} export(s) selected</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={() => handleBulkStatus("MARK_PROCESSING")}>
              → Processing
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleBulkStatus("MARK_COMPLETED")}>
              → Completed
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleBulkStatus("MARK_FAILED")}>
              → Failed
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleBulkStatus("CANCEL")}>
              Cancel
            </Button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="ml-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Export history */}
      <div className="rounded-2xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-5 py-3.5 dark:border-white/5">
          <h3 className="text-sm font-semibold">Export history</h3>
        </div>
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner className="h-6 w-6 text-brand-600" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={FileSpreadsheet}
            title="No exports yet"
            description="Export a network queue above or adjust filters to see exports."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500 dark:border-slate-800">
                  <th className="px-3 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === rows.length && rows.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-300 dark:border-white/20"
                    />
                  </th>
                  <th className="px-4 py-3 font-medium">Export</th>
                  <th className="px-4 py-3 font-medium">Network</th>
                  <th className="px-4 py-3 font-medium">Recipients</th>
                  <th className="px-4 py-3 font-medium">Value</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Change Status</th>
                  <th className="hidden px-4 py-3 font-medium lg:table-cell">By</th>
                  <th className="px-4 py-3 text-right font-medium">File</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((e) => (
                  <tr
                    key={e.id}
                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    onClick={() => {
                      setDetailId(e.id);
                      setSheetOpen(true);
                    }}
                  >
                    <td className="px-3 py-3" onClick={(ev) => ev.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(e.id)}
                        onChange={() => toggleSelectRow(e.id)}
                        className="rounded border-slate-300 dark:border-white/20"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400">{e.exportCode}</p>
                      <p className="text-xs text-slate-400">
                        {formatDateTime(e.createdAt)}
                        {e.isReexport ? " · re-export" : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3 font-medium">{e.network}</td>
                    <td className="px-4 py-3">{e._count?.orders ?? e.totalRecipients}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{e.totalGb} GB</p>
                      <p className="text-xs text-slate-500">{formatGHS(e.totalAmount)}</p>
                    </td>
                    <td className="px-4 py-3"><BatchStatusBadge status={e.status} /></td>
                    <td className="px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
                      <select
                        defaultValue=""
                        onChange={(ev) => {
                          if (ev.target.value) {
                            handleStatusChange(e.id, ev.target.value);
                            ev.target.value = "";
                          }
                        }}
                        className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-900 outline-none transition hover:border-brand-500 dark:border-white/10 dark:bg-[#0d1526] dark:text-slate-100 cursor-pointer [&>option]:bg-white dark:[&>option]:bg-[#0d1526]"
                      >
                        <option value="" disabled>Change Status ▾</option>
                        <option value="MARK_PROCESSING">→ Processing</option>
                        <option value="MARK_COMPLETED">→ Completed</option>
                        <option value="MARK_FAILED">→ Failed</option>
                        <option value="CANCEL">Cancel</option>
                      </select>
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-slate-500 lg:table-cell">{e.adminLabel}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <a
                          href={`/api/admin/exports/${e.id}/download`}
                          onClick={(ev) => ev.stopPropagation()}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"
                        >
                          <Download className="h-3.5 w-3.5" /> Download
                        </a>
                        <ChevronRight className="h-4 w-4 text-slate-300" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination page={page} pages={pages} onPage={setPage} />

      <ExportDetailSheet
        exportId={detailId}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onChanged={load}
      />

      {/* Per-network export dialog with filters */}
      <NetworkExportDialog
        network={dialogNetwork ?? ""}
        pendingCount={stats.find((st) => st.network === dialogNetwork)?.pending ?? 0}
        pendingGb={stats.find((st) => st.network === dialogNetwork)?.pendingGb ?? 0}
        pendingAmount={stats.find((st) => st.network === dialogNetwork)?.pendingAmount ?? 0}
        open={dialogNetwork !== null}
        onClose={() => setDialogNetwork(null)}
        onExported={load}
      />
    </div>
  );
}
