"use client";

import * as React from "react";
import { Search, Filter, RefreshCw, ExternalLink, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner, EmptyState } from "@/components/shared";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime, formatGHS } from "@/lib/types";

export function DeveloperOrdersPanel() {
  const [orders, setOrders] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [statusFilter, setStatusFilter] = React.useState("ALL");
  const [networkFilter, setNetworkFilter] = React.useState("ALL");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [selectedOrder, setSelectedOrder] = React.useState<any | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "20");
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (networkFilter !== "ALL") params.set("network", networkFilter);
      if (search.trim()) params.set("reference", search.trim());

      const res = await fetch(`/v1/orders?${params.toString()}`);
      const json = await res.json();
      if (json.success && json.data) {
        setOrders(json.data.orders || []);
        setTotalPages(json.data.totalPages || 1);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, networkFilter, search]);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      {/* Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search reference..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="h-9 w-48 rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="ALL">All Statuses</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="PENDING">PENDING</option>
            <option value="PROCESSING">PROCESSING</option>
            <option value="FAILED">FAILED</option>
          </select>

          <select
            value={networkFilter}
            onChange={(e) => {
              setNetworkFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="ALL">All Networks</option>
            <option value="MTN">MTN</option>
            <option value="TELECEL">Telecel</option>
            <option value="AIRTELTIGO">AirtelTigo</option>
          </select>
        </div>

        <Button variant="outline" size="sm" onClick={load} className="gap-1.5 h-9">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {/* Orders Table */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner className="h-6 w-6 text-blue-600" />
          </div>
        ) : orders.length === 0 ? (
          <EmptyState
            title="No API orders found"
            description="Orders created via POST /v1/orders will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 dark:border-slate-800">
                  <th className="px-4 py-3 font-semibold">Order ID & Ref</th>
                  <th className="px-4 py-3 font-semibold">Network & Package</th>
                  <th className="px-4 py-3 font-semibold">Recipient</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Created At</th>
                  <th className="px-4 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {orders.map((o) => (
                  <tr key={o.orderId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <p className="font-mono font-bold text-blue-600 dark:text-blue-400">{o.orderId}</p>
                      <p className="font-mono text-[11px] text-slate-400">{o.reference || "No ref"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{o.network}</span>
                      <p className="text-[11px] text-slate-500">{o.package}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300">
                      {o.recipient}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">
                      {formatGHS(o.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="px-4 py-3 text-[11px] text-slate-400">
                      {formatDateTime(o.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedOrder(o)}
                        className="h-7 text-xs text-blue-600 hover:text-blue-700"
                      >
                        Inspect
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 p-4 dark:border-slate-800 text-xs">
            <p className="text-slate-500">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-base font-bold">Order Details: {selectedOrder.orderId}</h3>
              <Button variant="ghost" size="sm" onClick={() => setSelectedOrder(null)}>
                ✕
              </Button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/60 font-mono">
                <div>
                  <p className="text-slate-400">Order ID</p>
                  <p className="font-bold text-slate-800 dark:text-slate-200">{selectedOrder.orderId}</p>
                </div>
                <div>
                  <p className="text-slate-400">External Ref</p>
                  <p className="font-bold text-slate-800 dark:text-slate-200">{selectedOrder.reference || "None"}</p>
                </div>
                <div>
                  <p className="text-slate-400">Recipient</p>
                  <p className="font-bold text-slate-800 dark:text-slate-200">{selectedOrder.recipient}</p>
                </div>
                <div>
                  <p className="text-slate-400">Network & Package</p>
                  <p className="font-bold text-slate-800 dark:text-slate-200">
                    {selectedOrder.network} - {selectedOrder.package}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Amount Charged</p>
                  <p className="font-bold text-slate-800 dark:text-slate-200">{formatGHS(selectedOrder.amount)}</p>
                </div>
                <div>
                  <p className="text-slate-400">Status</p>
                  <div className="mt-0.5">
                    <StatusBadge status={selectedOrder.status} />
                  </div>
                </div>
              </div>

              {selectedOrder.failureReason && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700 dark:border-red-900 dark:bg-red-950/20">
                  <p className="font-bold">Failure Reason:</p>
                  <p className="mt-0.5">{selectedOrder.failureReason}</p>
                </div>
              )}

              <div className="space-y-1 text-slate-500 pt-1">
                <p>Created: {formatDateTime(selectedOrder.createdAt)}</p>
                {selectedOrder.completedAt && <p>Completed: {formatDateTime(selectedOrder.completedAt)}</p>}
                {selectedOrder.isSandbox && (
                  <p className="text-amber-600 font-semibold">Environment: SANDBOX (Test order)</p>
                )}
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <Button size="sm" onClick={() => setSelectedOrder(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
