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
  const [stats, setStats] = React.useState<NetworkStat[]>([]);
  const [rows, setRows] = React.useState<ExportRow[]>([]);
  const [pages, setPages] = React.useState(1);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);

  // Dialog state for per-network export
  const [dialogNetwork, setDialogNetwork] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, listRes] = await Promise.all([
        fetch("/api/admin/network-stats"),
        fetch(`/api/admin/exports?page=${page}&pageSize=12`),
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
  }, [page]);

  React.useEffect(() => {
    load();
  }, [load]);

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
            description="Export a network queue above to generate the first file."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500 dark:border-slate-800">
                  <th className="px-4 py-3 font-medium">Export</th>
                  <th className="px-4 py-3 font-medium">Network</th>
                  <th className="px-4 py-3 font-medium">Recipients</th>
                  <th className="px-4 py-3 font-medium">Value</th>
                  <th className="px-4 py-3 font-medium">Status</th>
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
