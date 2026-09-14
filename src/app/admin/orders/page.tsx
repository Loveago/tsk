"use client";

import * as React from "react";
import { PageHeader } from "@/components/shared";
import { BatchesTable, type BatchRow } from "@/components/admin/batches-table";
import { SingleOrdersTable, type AdminOrderRow } from "@/components/admin/single-orders-table";
import { StorefrontOrdersTable, type StorefrontOrderRow } from "@/components/admin/storefront-orders-table";
import { BatchDetailSheet } from "@/components/admin/batch-detail-sheet";
import { QuickExportPanel } from "@/components/admin/quick-export-panel";
import { Pagination } from "@/components/ui/pagination";
import { ScrollableTabs } from "@/components/ui/scrollable-tabs";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { Layers, Search, Store, RefreshCw } from "lucide-react";

const NETWORKS = ["MTN", "TELECEL", "AIRTELTIGO"] as const;
const BATCH_STATUSES = ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"];
const STOREFRONT_STATUSES = ["PENDING", "PROCESSING", "COMPLETED", "AWAITING_PAYMENT", "FAILED", "REFUNDED"];
const QUICK_RANGES = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 days" },
  { key: "month", label: "This month" },
];

const selectCls =
  "h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-brand-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100";

type ViewMode = "batches" | "single" | "storefront";

export default function AdminOrdersPage() {
  const { toast } = useToast();

  // ── view toggle ─────────────────────────────────────────────
  const [viewMode, setViewMode] = React.useState<ViewMode>("batches");

  // ── shared filters ───────────────────────────────────────────
  const [network, setNetwork] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [q, setQ] = React.useState("");
  const [quick, setQuick] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [reconciling, setReconciling] = React.useState(false);

  // auto-switch to single view when a phone number is typed in
  React.useEffect(() => {
    if (viewMode !== "storefront" && /\d{3,}/.test(q.trim())) {
      setViewMode("single");
    }
  }, [q, viewMode]);

  // ── batches state ────────────────────────────────────────────
  const [batches, setBatches] = React.useState<BatchRow[]>([]);
  const [batchTotal, setBatchTotal] = React.useState(0);
  const [batchPages, setBatchPages] = React.useState(1);
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [selectedBatchIds, setSelectedBatchIds] = React.useState<Set<string>>(new Set());

  // ── single orders state ──────────────────────────────────────
  const [singleOrders, setSingleOrders] = React.useState<AdminOrderRow[]>([]);
  const [singleTotal, setSingleTotal] = React.useState(0);
  const [singlePages, setSinglePages] = React.useState(1);
  const [selectedOrderIds, setSelectedOrderIds] = React.useState<Set<number>>(new Set());

  // ── storefront orders state ──────────────────────────────────
  const [sfOrders, setSfOrders] = React.useState<StorefrontOrderRow[]>([]);
  const [sfTotal, setSfTotal] = React.useState(0);
  const [sfPages, setSfPages] = React.useState(1);

  // ── data fetcher ─────────────────────────────────────────────
  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      if (viewMode === "storefront") {
        const params = new URLSearchParams({ page: String(page), pageSize: "15" });
        if (status) params.set("status", status);
        if (q) params.set("q", q);
        const res = await fetch(`/api/admin/storefront-orders?${params}`);
        const json = await res.json();
        setSfOrders(json.data ?? []);
        setSfTotal(json.total ?? 0);
        setSfPages(json.pages ?? 1);
      } else if (viewMode === "single") {
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
        // batches
        const params = new URLSearchParams({ page: String(page), pageSize: "15" });
        if (network) params.set("network", network);
        if (status) params.set("status", status);
        if (q) params.set("q", q);
        if (quick) params.set("quick", quick);
        const res = await fetch(`/api/admin/batches?${params}`);
        const json = await res.json();
        setBatches(json.data ?? []);
        setBatchTotal(json.total ?? 0);
        setBatchPages(json.pages ?? 1);
      }
    } finally {
      setLoading(false);
    }
  }, [viewMode, page, network, status, q, quick]);

  React.useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const switchView = (v: ViewMode) => {
    setViewMode(v);
    setPage(1);
    setStatus("");
  };

  // ── batch actions ─────────────────────────────────────────────
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

  // ── single order actions ──────────────────────────────────────
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

  // ── storefront reconciliation action ─────────────────────────
  const handleReconcileStorefront = async () => {
    setReconciling(true);
    try {
      const res = await fetch("/api/admin/storefront-orders", {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? "Failed to sync with Paystack", "error");
        return;
      }
      if (json.settledCount > 0) {
        toast(`Recovered & sent ${json.settledCount} paid storefront order(s) for processing!`, "success");
      } else {
        toast("Checked Paystack: all orders are up to date.", "info");
      }
      load();
    } catch {
      toast("Error checking Paystack orders", "error");
    } finally {
      setReconciling(false);
    }
  };

  // ── derived ───────────────────────────────────────────────────
  const pageTitle =
    viewMode === "storefront"
      ? "Storefront Orders"
      : viewMode === "single"
      ? "Order Lookup"
      : "Batch Ops Center";

  const pageDesc =
    viewMode === "storefront"
      ? `${sfTotal} storefront sale${sfTotal === 1 ? "" : "s"} from all public storefronts`
      : viewMode === "single"
      ? `${singleTotal} order${singleTotal === 1 ? "" : "s"}${q ? ` matching "${q}"` : ""}`
      : `${batchTotal} batch${batchTotal === 1 ? "" : "es"} — orders grouped per network`;

  const currentTotal = viewMode === "storefront" ? sfTotal : viewMode === "single" ? singleTotal : batchTotal;
  const currentPages = viewMode === "storefront" ? sfPages : viewMode === "single" ? singlePages : batchPages;

  return (
    <div className="space-y-6">
      <PageHeader
        title={pageTitle}
        description={pageDesc}
        actions={
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-1 text-xs font-semibold dark:border-white/10 dark:bg-white/5">
            <button
              onClick={() => switchView("batches")}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition ${
                viewMode === "batches"
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              <Layers className="h-3.5 w-3.5" /> Batches
            </button>
            <button
              onClick={() => switchView("single")}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition ${
                viewMode === "single"
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              <Search className="h-3.5 w-3.5" /> Single Orders
            </button>
            <button
              onClick={() => switchView("storefront")}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition ${
                viewMode === "storefront"
                  ? "bg-violet-600 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              <Store className="h-3.5 w-3.5" /> Storefront
            </button>
          </div>
        }
      />

      <QuickExportPanel onChanged={load} />

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Network tabs — hidden for storefront view (they span all networks) */}
        {viewMode !== "storefront" && (
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
        )}

        <div className={`${viewMode !== "storefront" ? "ml-auto" : ""} flex flex-wrap items-center gap-2`}>
          {/* Quick range — batches only */}
          {viewMode === "batches" && (
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

          {/* Status filter */}
          <select
            className={selectCls}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {(viewMode === "storefront" ? STOREFRONT_STATUSES : BATCH_STATUSES).map((s) => (
              <option key={s} value={s}>
                {s.replaceAll("_", " ")}
              </option>
            ))}
          </select>

          {/* Search */}
          <input
            className={selectCls + " w-60"}
            placeholder={
              viewMode === "storefront"
                ? "Search phone, reference, store…"
                : "Search phone number, code, user…"
            }
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />

          {/* Sync Paystack button for storefront */}
          {viewMode === "storefront" && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleReconcileStorefront}
              disabled={reconciling}
              className="flex items-center gap-1.5 border-violet-200 text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-300"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${reconciling ? "animate-spin" : ""}`} />
              {reconciling ? "Checking Paystack…" : "Sync Paystack"}
            </Button>
          )}
        </div>
      </div>

      {/* Bulk action bar — Batches */}
      {viewMode === "batches" && selectedBatchIds.size > 0 && (
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

      {/* Bulk action bar — Single orders */}
      {viewMode === "single" && selectedOrderIds.size > 0 && (
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

      {/* Tables */}
      {viewMode === "storefront" ? (
        <StorefrontOrdersTable orders={sfOrders} loading={loading} />
      ) : viewMode === "single" ? (
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
          data={batches}
          loading={loading}
          onOpen={(b) => { setDetailId(b.id); setSheetOpen(true); }}
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
            if (selectedBatchIds.size === batches.length && batches.length > 0) {
              setSelectedBatchIds(new Set());
            } else {
              setSelectedBatchIds(new Set(batches.map((b) => b.id)));
            }
          }}
          onChangeStatus={handleBatchStatusChange}
        />
      )}

      <Pagination
        page={page}
        pages={currentPages}
        total={currentTotal}
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
