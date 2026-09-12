"use client";

import * as React from "react";
import { PageHeader } from "@/components/shared";
import { BatchesTable, type BatchRow } from "@/components/admin/batches-table";
import { BatchDetailSheet } from "@/components/admin/batch-detail-sheet";
import { QuickExportPanel } from "@/components/admin/quick-export-panel";
import { Pagination } from "@/components/ui/pagination";
import { ScrollableTabs } from "@/components/ui/scrollable-tabs";

const NETWORKS = ["MTN", "TELECEL", "AIRTELTIGO"] as const;
const BATCH_STATUSES = ["PENDING", "PROCESSING", "PARTIALLY_COMPLETED", "COMPLETED", "FAILED", "CANCELLED"];
const QUICK_RANGES = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 days" },
  { key: "month", label: "This month" },
];

const selectCls =
  "h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-brand-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100";

export default function AdminOrdersPage() {
  const [data, setData] = React.useState<BatchRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [pages, setPages] = React.useState(1);
  const [page, setPage] = React.useState(1);
  const [network, setNetwork] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [q, setQ] = React.useState("");
  const [quick, setQuick] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "15" });
    if (network) params.set("network", network);
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    if (quick) params.set("quick", quick);
    try {
      const res = await fetch(`/api/admin/batches?${params}`);
      const json = await res.json();
      setData(json.data ?? []);
      setTotal(json.total ?? 0);
      setPages(json.pages ?? 1);
    } finally {
      setLoading(false);
    }
  }, [page, network, status, q, quick]);

  React.useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const openBatch = (b: BatchRow) => {
    setDetailId(b.id);
    setSheetOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Batch Ops Center"
        description={`${total} batch${total === 1 ? "" : "es"} — orders grouped per network`}
      />

      <QuickExportPanel onChanged={load} />

      {/* Network tabs with smooth scrolling & chevrons on mobile */}
      <div className="flex flex-wrap items-center gap-4">
        <ScrollableTabs
          tabs={[
            { key: "", label: "All Networks" },
            ...NETWORKS.map((n) => ({ key: n, label: n })),
          ]}
          activeTab={network}
          onChange={(n) => {
            setNetwork(n);
            setPage(1);
          }}
        />
        <div className="ml-auto flex flex-wrap items-center gap-2">
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
          <input
            className={selectCls + " w-56"}
            placeholder="Search code, user, phone…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <BatchesTable data={data} loading={loading} onOpen={openBatch} />

      <Pagination page={page} pages={pages} total={total} onPage={setPage} />

      <BatchDetailSheet
        batchId={detailId}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onChanged={load}
      />
    </div>
  );
}
