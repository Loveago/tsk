"use client";

import * as React from "react";
import { EmptyState, Spinner } from "@/components/shared";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime, formatGHS } from "@/lib/types";
import { orderCode } from "@/lib/utils";
import { AlertCircle, Check, Copy, ShieldAlert, Store } from "lucide-react";
import type { AdminOrderRow } from "./single-orders-table";

export function ExcludedOrdersTable({
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
        <Spinner className="h-6 w-6 text-brand-600" />
      </div>
    );
  }

  const allSelected = selectedIds && selectedIds.size === orders.length && orders.length > 0;

  return (
    <div className="rounded-2xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
      {orders.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="No API excluded orders found"
          description="Great news! There are currently no orders held back or excluded by provider APIs."
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
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Phone Number</th>
                <th className="px-4 py-3 font-medium">Network</th>
                <th className="px-4 py-3 font-medium">Bundle</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Exclusion Reason / API Hold</th>
                <th className="px-4 py-3 font-medium">Storefront / User</th>
                {onChangeStatus && <th className="px-4 py-3 font-medium">Quick Status</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {orders.map((o) => {
                const ref = o.providerReference || "";
                const isManualHold = ref.startsWith("CLICKYFIED_MANUAL_HOLD");
                const isInFlightHold = ref.startsWith("CLICKYFIED_INFLIGHT_HOLD");
                const isFiltered = ref.includes(":FILTERED:");
                const isBlocked = ref === "CLICKYFIED:BLOCKED";

                let holdBadgeLabel = "Excluded by API";
                let holdBadgeCls = "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/40";

                if (isManualHold) {
                  holdBadgeLabel = "Manual Fulfillment Hold";
                  holdBadgeCls = "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/40";
                } else if (isInFlightHold) {
                  holdBadgeLabel = "Active In-Flight Duplicate";
                  holdBadgeCls = "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800/40";
                } else if (isFiltered) {
                  holdBadgeLabel = "Provider Filtered";
                  holdBadgeCls = "bg-red-100 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/40";
                } else if (isBlocked) {
                  holdBadgeLabel = "Blocked by Provider";
                  holdBadgeCls = "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700";
                }

                const batchCodeMatch = ref.match(/(?:CF-BATCH-\w+|order-\w+)/);
                const batchCode = batchCodeMatch ? batchCodeMatch[0] : (o.batch?.batchCode ?? null);

                return (
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
                      <p className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400">
                        {orderCode(o.id)}
                      </p>
                      <p className="text-[11px] text-slate-400">{formatDateTime(o.createdAt)}</p>
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-slate-900 dark:text-white">
                      <div className="flex items-center gap-1.5">
                        <span>{o.phoneNumber}</span>
                        <button
                          type="button"
                          onClick={() => copyPhone(o.phoneNumber, o.id)}
                          title="Copy phone number"
                          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          {copiedId === o.id ? (
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
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

                    {/* Hold / Exclusion Cause */}
                    <td className="px-4 py-3 max-w-xs">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${holdBadgeCls}`}
                          >
                            <AlertCircle className="h-3 w-3" />
                            {holdBadgeLabel}
                          </span>
                          {batchCode && (
                            <span className="font-mono text-[10px] text-slate-400">
                              #{batchCode}
                            </span>
                          )}
                        </div>
                        {((o as any).failureReason || ref) && (
                          <p className="line-clamp-2 text-xs text-slate-500 dark:text-slate-400" title={(o as any).failureReason || ref}>
                            {(o as any).failureReason || ref}
                          </p>
                        )}
                      </div>
                    </td>

                    {/* Storefront / User */}
                    <td className="px-4 py-3">
                      {o.storefrontOrder ? (
                        <div className="flex items-start gap-1.5">
                          <Store className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />
                          <div className="min-w-0">
                            <p className="truncate max-w-[120px] text-xs font-semibold text-slate-800 dark:text-slate-200">
                              {o.storefrontOrder.storefront.name}
                            </p>
                            <p className="font-mono text-[10px] text-slate-400">
                              {o.storefrontOrder.paymentReference}
                            </p>
                          </div>
                        </div>
                      ) : o.user ? (
                        <div className="text-xs">
                          <p className="font-medium text-slate-800 dark:text-slate-200">{o.user.name}</p>
                          <p className="text-slate-400 truncate max-w-[120px]">{o.user.email}</p>
                        </div>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>

                    {onChangeStatus && (
                      <td className="px-4 py-3">
                        <select
                          defaultValue=""
                          onChange={(ev) => {
                            if (ev.target.value) {
                              onChangeStatus(o.id, ev.target.value);
                              ev.target.value = "";
                            }
                          }}
                          className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-800 outline-none transition hover:border-brand-500 dark:border-white/10 dark:bg-[#0d1526] dark:text-slate-100 [&>option]:bg-white [&>option]:text-slate-900 dark:[&>option]:bg-[#0d1526] dark:[&>option]:text-slate-100 cursor-pointer"
                        >
                          <option value="" disabled>Change Status ▾</option>
                          <option value="Pending">Pending</option>
                          <option value="Processing">Processing</option>
                          <option value="Processed">Processed</option>
                          <option value="Refund">Refund</option>
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
