"use client";

import * as React from "react";
import { EmptyState, Spinner } from "@/components/shared";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime, formatGHS } from "@/lib/types";
import { orderCode } from "@/lib/utils";
import { AlertTriangle, Check, Copy, ShieldAlert, Store, UserCheck } from "lucide-react";
import type { AdminOrderRow } from "./single-orders-table";

export function UnverifiedOrdersTable({
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
  const [copiedId, setCopiedId] = React.useState<number | null>(null);

  const copyPhone = (phone: string, id: number) => {
    navigator.clipboard?.writeText(phone);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  if (loading) {
    return (
      <div className="flex justify-center rounded-2xl border border-slate-100 bg-white py-12 dark:border-slate-800 dark:bg-slate-900">
        <Spinner className="h-6 w-6 text-amber-600" />
      </div>
    );
  }

  const allSelected = selectedIds && selectedIds.size === orders.length && orders.length > 0;

  return (
    <div className="rounded-2xl border border-amber-200/80 bg-white shadow-sm dark:border-amber-900/40 dark:bg-slate-900">
      {orders.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="No unverified orders found"
          description="Awesome! There are currently no orders with unverified recipient phone numbers."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
                {onToggleSelectRow && (
                  <th className="px-3 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={onToggleSelectAll}
                      className="rounded border-slate-300 dark:border-white/20 accent-amber-600"
                    />
                  </th>
                )}
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Phone Number</th>
                <th className="px-4 py-3 font-medium">Network</th>
                <th className="px-4 py-3 font-medium">Data Size (GB)</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Verification Status</th>
                <th className="px-4 py-3 font-medium">User / Storefront</th>
                {onChangeStatus && <th className="px-4 py-3 font-medium">Quick Status</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {orders.map((o) => {
                return (
                  <tr
                    key={o.id}
                    className={`transition hover:bg-amber-50/40 dark:hover:bg-amber-950/20 ${
                      selectedIds?.has(o.id) ? "bg-amber-50/60 dark:bg-amber-950/30" : ""
                    }`}
                  >
                    {onToggleSelectRow && (
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds?.has(o.id)}
                          onChange={() => onToggleSelectRow(o.id)}
                          className="rounded border-slate-300 dark:border-white/20 accent-amber-600"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400">
                        {orderCode(o.id)}
                      </p>
                      <p className="text-[11px] text-slate-400">{formatDateTime(o.createdAt)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-slate-900 dark:text-white">
                          {o.phoneNumber}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyPhone(o.phoneNumber, o.id)}
                          className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                          title="Copy phone number"
                        >
                          {copiedId === o.id ? (
                            <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300">
                        {o.network}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2.5 py-1 font-mono text-xs font-bold text-amber-800 dark:text-amber-300 border border-amber-500/30">
                        {o.gbAmount} GB
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                      {formatGHS(o.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/80 bg-amber-100/80 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                        <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                        Unverified MTN
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {o.storefrontOrder ? (
                        <div className="flex items-center gap-1 text-violet-700 dark:text-violet-400">
                          <Store className="h-3.5 w-3.5" />
                          <span className="font-medium">
                            {o.storefrontOrder.storefront.name}
                          </span>
                        </div>
                      ) : o.user ? (
                        <div>
                          <p className="font-medium text-slate-800 dark:text-slate-200">
                            {o.user.name || "Customer"}
                          </p>
                          <p className="text-[11px] text-slate-400">{o.user.email}</p>
                        </div>
                      ) : (
                        <span className="text-slate-400">Direct</span>
                      )}
                    </td>
                    {onChangeStatus && (
                      <td className="px-4 py-3">
                        <select
                          value={o.status}
                          onChange={(e) => onChangeStatus(o.id, e.target.value)}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition hover:border-brand-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          <option value="PENDING">Pending</option>
                          <option value="PROCESSING">Processing</option>
                          <option value="SUCCESS">Completed</option>
                          <option value="FAILED">Failed</option>
                          <option value="REFUNDED">Refunded</option>
                        </select>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
