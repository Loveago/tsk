"use client";

import * as React from "react";
import { PageHeader } from "@/components/shared";
import { BatchesTable, type BatchRow } from "@/components/admin/batches-table";
import { SingleOrdersTable, type AdminOrderRow } from "@/components/admin/single-orders-table";
import { BatchDetailSheet } from "@/components/admin/batch-detail-sheet";
import { QuickExportPanel } from "@/components/admin/quick-export-panel";
import { Pagination } from "@/components/ui/pagination";
import { ScrollableTabs } from "@/components/ui/scrollable-tabs";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { Layers, Search, CheckSquare } from "lucide-react";

const NETWORKS = ["MTN", "TELECEL", "AIRTELTIGO"] as const;
const BATCH_STATUSES = ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"];
const QUICK_RANGES = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 days" },
  { key: "month", label: "This month" },
];

const selectCls =
  "h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-brand-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100";

export default function AdminOrdersPage() {
  const { toast } = useToast();
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

  // View mode: automatic switch when searching a phone number, or manual toggle
  const [viewMode, setViewMode] = React.useState<"auto" | "batches" | "single">("auto");
  const isPhoneSearch =
    viewMode === "single" || (viewMode === "auto" && /\d{3,}/.test(q.trim()));

  // Single orders state
  const [singleOrders, setSingleOrders] = React.useState<AdminOrderRow[]>([]);
  const [singleTotal, setSingleTotal] = React.useState(0);
  const [singlePages, setSinglePages] = React.useState(1);

  // Bulk selection states
  const [selectedBatchIds, setSelectedBatchIds] = React.useState<Set<string>>(new Set());
  const [selectedOrderIds, setSelectedOrderIds] = React.useState<Set<number>>(new Set());

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      if (isPhoneSearch) {
        const params = new URLSearchParams({ page: String(page), pageSize: "15" });
        if (network) params.set("network", network);
        if (status) params.set("status", status);
        if (q) params.set("q", q);
        const res = await fetch(`/api/admin/orders?${params}`);
        const json = await res.json();
        setSingleOrders(json.data ?? []);
        setSingleTotal(json.total ?? 0);
        setSinglePages(json.pages ?? 1);
      } else {
        const params = new URLSearchParams({ page: String(page), pageSize: "15" });
        if (network) params.set("network", network);
        if (status) params.set("status", status);
        if (q) params.set("q", q);
        if (quick) params.set("quick", quick);
        const res = await fetch(`/api/admin/batches?${params}`);
        const json = await res.json();
        setData(json.data ?? []);
        setTotal(json.total ?? 0);
        setPages(json.pages ?? 1);
      }
    } finally {
      setLoading(false);
    }
  }, [page, network, status, q, quick, isPhoneSearch]);

  React.useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const openBatch = (b: BatchRow) => {
    setDetailId(b.id);
    setSheetOpen(true);
  };

  // Batch status change
  const handleBatchStatusChange = async (batchId: string, action: string) => {
    try {
      const res = await fetch(`/api/admin/batches/${batchId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, force: true }),
      });
      const json = await res.json();
      if (!res.ok) return toast(json.error ?? "Failed to update batch status", "error");
      toast(`Batch status updated (${json.applied ?? 0} orders updated)`, "success");
      load();
    } catch {
      toast("Error updating batch status", "error");
    }
  };

  const handleBulkBatchStatus = async (action: string) => {
    if (selectedBatchIds.size === 0) return;
    try {
      const ids = Array.from(selectedBatchIds);
      let count = 0;
      for (const id of ids) {
        const res = await fetch(`/api/admin/batches/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, force: true }),
        });
        if (res.ok) count++;
      }
      toast(`Updated ${count} batch(es) successfully`, "success");
      setSelectedBatchIds(new Set());
      load();
    } catch {
      toast("Error updating batches in bulk", "error");
    }
  };

  // Single order status change
  const handleSingleOrderStatusChange = async (orderId: number, nextStatus: string) => {
    try {
      const res = await fetch(`/api/admin/orders`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: orderId, status: nextStatus, force: true }),
      });
      const json = await res.json();
      if (!res.ok) return toast(json.error ?? "Failed to update order status", "error");
      toast("Order status updated", "success");
      load();
    } catch {
      toast("Error updating order status", "error");
    }
  };

  const handleBulkSingleOrderStatus = async (nextStatus: string) => {
    if (selectedOrderIds.size === 0) return;
    try {
      const res = await fetch(`/api/admin/orders`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: Array.from(selectedOrderIds), status: nextStatus, force: true }),
      });
      const json = await res.json();
      if (!res.ok) return toast(json.error ?? "Failed to bulk update orders", "error");
      toast(`Bulk updated ${json.updatedCount ?? selectedOrderIds.size} orders`, "success");
      setSelectedOrderIds(new Set());
      load();
    } catch {
      toast("Error during bulk order update", "error");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={isPhoneSearch ? "Order Lookup" : "Batch Ops Center"}
        description={
          isPhoneSearch
            ? `${singleTotal} order${singleTotal === 1 ? "" : "s"} matching "${q}"`
            : `${total} batch${total === 1 ? "" : "es"} — orders grouped per network`
        }
        actions={
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-1 text-xs font-semibold dark:border-white/10 dark:bg-white/5">
            <button
              onClick={() => {
                setViewMode("batches");
                setPage(1);
              }}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition ${
                !isPhoneSearch
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              <Layers className="h-3.5 w-3.5" /> Batches View
            </button>
            <button
              onClick={() => {
                setViewMode("single");
                setPage(1);
              }}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition ${
                isPhoneSearch
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              <Search className="h-3.5 w-3.5" /> Single Numbers
            </button>
          </div>
        }
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
          {!isPhoneSearch && (
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
          )}
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
            className={selectCls + " w-60"}
            placeholder="Search phone number, code, user…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {/* Bulk Action Bar for Batches */}
      {!isPhoneSearch && selectedBatchIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-500/20 bg-brand-50/70 p-3 text-xs font-semibold text-brand-900 dark:bg-brand-500/10 dark:text-brand-200">
          <span>{selectedBatchIds.size} batch(es) selected</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={() => handleBulkBatchStatus("MARK_PROCESSING")}>
              → Processing
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleBulkBatchStatus("MARK_COMPLETED")}>
              → Completed
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleBulkBatchStatus("MARK_FAILED")}>
              → Failed
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleBulkBatchStatus("CANCEL")}>
              Cancel
            </Button>
            <button
              type="button"
              onClick={() => setSelectedBatchIds(new Set())}
              className="ml-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Bulk Action Bar for Single Orders */}
      {isPhoneSearch && selectedOrderIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-500/20 bg-brand-50/70 p-3 text-xs font-semibold text-brand-900 dark:bg-brand-500/10 dark:text-brand-200">
          <span>{selectedOrderIds.size} order(s) selected</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={() => handleBulkSingleOrderStatus("PROCESSING")}>
              → Processing
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleBulkSingleOrderStatus("SUCCESS")}>
              → Completed
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleBulkSingleOrderStatus("FAILED")}>
              → Failed
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleBulkSingleOrderStatus("CANCELLED")}>
              Cancel
            </Button>
            <button
              type="button"
              onClick={() => setSelectedOrderIds(new Set())}
              className="ml-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {isPhoneSearch ? (
        <SingleOrdersTable
          orders={singleOrders}
          loading={loading}
          selectedIds={selectedOrderIds}
          onToggleSelectRow={(id) => {
            setSelectedOrderIds((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            });
          }}
          onToggleSelectAll={() => {
            if (selectedOrderIds.size === singleOrders.length && singleOrders.length > 0) {
              setSelectedOrderIds(new Set());
            } else {
              setSelectedOrderIds(new Set(singleOrders.map((o) => o.id)));
            }
          }}
          onChangeStatus={handleSingleOrderStatusChange}
        />
      ) : (
        <BatchesTable
          data={data}
          loading={loading}
          onOpen={openBatch}
          selectedIds={selectedBatchIds}
          onToggleSelectRow={(id) => {
            setSelectedBatchIds((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            });
          }}
          onToggleSelectAll={() => {
            if (selectedBatchIds.size === data.length && data.length > 0) {
              setSelectedBatchIds(new Set());
            } else {
              setSelectedBatchIds(new Set(data.map((b) => b.id)));
            }
          }}
          onChangeStatus={handleBatchStatusChange}
        />
      )}

      <Pagination
        page={page}
        pages={isPhoneSearch ? singlePages : pages}
        total={isPhoneSearch ? singleTotal : total}
        onPage={setPage}
      />

      <BatchDetailSheet
        batchId={detailId}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onChanged={load}
      />
    </div>
  );
}
