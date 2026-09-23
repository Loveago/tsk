"use client";

import * as React from "react";
import { EmptyState, Spinner } from "@/components/shared";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime, formatGHS } from "@/lib/types";
import { Code2, Key, Terminal } from "lucide-react";
import type { AdminOrderRow } from "./single-orders-table";

export function ApiOrdersTable({
  orders,
  loading,
  selectedIds,
  onToggleSelectRow,
  onToggleSelectAll,
  onChangeStatus,
}: {
  orders: AdminOrderRow[];
  loading: boolean;
  selectedIds?: Set<number>;
  onToggleSelectRow?: (id: number) => void;
  onToggleSelectAll?: () => void;
  onChangeStatus?: (orderId: number, status: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex justify-center rounded-2xl border border-slate-100 bg-white py-12 dark:border-slate-800 dark:bg-slate-900">
        <Spinner className="h-6 w-6 text-brand-600" />
      </div>
    );
  }

  const allSelected = selectedIds && selectedIds.size === orders.length && orders.length > 0;

  return (
    <div className="rounded-2xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
      {orders.length === 0 ? (
        <EmptyState
          icon={Code2}
          title="No API orders found"
          description="Orders submitted by developers via API keys will appear here with API- references."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500 dark:border-slate-800">
                {onToggleSelectRow && (
                  <th className="px-3 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={onToggleSelectAll}
                      className="rounded border-slate-300 dark:border-white/20"
                    />
                  </th>
                )}
                <th className="px-4 py-3 font-medium">API Order</th>
                <th className="px-4 py-3 font-medium">Client Reference</th>
                <th className="px-4 py-3 font-medium">API Key / App</th>
                <th className="px-4 py-3 font-medium">Phone Number</th>
                <th className="px-4 py-3 font-medium">Network</th>
                <th className="px-4 py-3 font-medium">Bundle</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">User</th>
                {onChangeStatus && <th className="px-4 py-3 font-medium">Quick Status</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  {onToggleSelectRow && (
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds?.has(o.id)}
                        onChange={() => onToggleSelectRow(o.id)}
                        className="rounded border-slate-300 dark:border-white/20"
                      />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs font-bold text-violet-600 dark:text-violet-400">
                      {`API-${o.id}`}
                    </p>
                    <p className="text-[11px] text-slate-400">{formatDateTime(o.createdAt)}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">
                    {o.externalReference ? (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium dark:bg-slate-800">
                        {o.externalReference}
                      </span>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {o.apiCredential ? (
                      <div className="flex items-center gap-1.5">
                        <Key className="h-3 w-3 text-violet-500 shrink-0" />
                        <div>
                          <p className="font-semibold text-slate-800 dark:text-slate-200">
                            {o.apiCredential.name}
                          </p>
                          <p className="font-mono text-[10px] text-slate-400">
                            {o.apiCredential.keyPrefix}••••
                          </p>
                        </div>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                        <Terminal className="h-3 w-3" /> API
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono font-bold text-slate-900 dark:text-white">
                    {o.phoneNumber}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        o.network === "MTN"
                          ? "bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300"
                          : o.network === "TELECEL"
                          ? "bg-red-100 text-red-800 border border-red-300 dark:bg-red-500/20 dark:text-red-300"
                          : "bg-blue-100 text-blue-800 border border-blue-300 dark:bg-blue-500/20 dark:text-blue-300"
                      }`}
                    >
                      {o.network}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold">{o.gbAmount} GB</td>
                  <td className="px-4 py-3 font-semibold">{formatGHS(o.amount)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {o.user ? (
                      <div>
                        <p className="font-medium text-slate-800 dark:text-slate-200">{o.user.name}</p>
                        <p className="text-slate-400">{o.user.email}</p>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  {onChangeStatus && (
                    <td className="px-4 py-3">
                      <select
                        value={o.status}
                        onChange={(e) => onChangeStatus(o.id, e.target.value)}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-[#0d1526] dark:text-slate-200"
                      >
                        <option value="PENDING">PENDING</option>
                        <option value="PROCESSING">PROCESSING</option>
                        <option value="SUCCESS">SUCCESS</option>
                        <option value="FAILED">FAILED</option>
                        <option value="CANCELLED">CANCELLED</option>
                      </select>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
