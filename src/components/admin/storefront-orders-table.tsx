"use client";

import * as React from "react";
import { EmptyState, Spinner } from "@/components/shared";
import { StatusBadge } from "@/components/status-badge";
import { Store } from "lucide-react";

export interface StorefrontOrderRow {
  id: string;
  seq: number;
  code: string;
  paymentReference: string;
  storeName: string;
  storeSlug: string;
  customerPhone: string;
  network: string;
  gbAmount: number;
  sellingPrice: number; // pesewas
  status: string;
  commissionState: string;
  underlyingOrderId: number | null;
  paidAt: string | null;
  createdAt: string;
}

const NETWORK_CLS: Record<string, string> = {
  MTN: "bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300",
  TELECEL: "bg-red-100 text-red-800 border border-red-300 dark:bg-red-500/20 dark:text-red-300",
  AIRTELTIGO: "bg-blue-100 text-blue-800 border border-blue-300 dark:bg-blue-500/20 dark:text-blue-300",
};

function ghs(pesewas: number) {
  return `GHS ${(pesewas / 100).toFixed(2)}`;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-GH", { dateStyle: "medium", timeStyle: "short" });
}

export function StorefrontOrdersTable({
  orders,
  loading,
}: {
  orders: StorefrontOrderRow[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex justify-center rounded-2xl border border-slate-100 bg-white py-12 dark:border-slate-800 dark:bg-slate-900">
        <Spinner className="h-6 w-6 text-brand-600" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
      {orders.length === 0 ? (
        <EmptyState
          icon={Store}
          title="No storefront orders found"
          description="Storefront sales from your resellers will appear here once buyers start purchasing."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500 dark:border-slate-800">
                <th className="px-4 py-3 font-medium">Reference</th>
                <th className="px-4 py-3 font-medium">Store</th>
                <th className="px-4 py-3 font-medium">Customer Phone</th>
                <th className="px-4 py-3 font-medium">Network</th>
                <th className="px-4 py-3 font-medium">Bundle</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Commission</th>
                <th className="px-4 py-3 font-medium">Order ID</th>
                <th className="px-4 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  {/* Reference / code */}
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs font-bold text-violet-600 dark:text-violet-400">
                      {o.code}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] text-slate-400">
                      {o.paymentReference}
                    </p>
                  </td>

                  {/* Store */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <Store className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                      <div>
                        <p className="font-semibold text-slate-800 dark:text-slate-200">
                          {o.storeName}
                        </p>
                        <p className="text-[10px] text-slate-400">/{o.storeSlug}</p>
                      </div>
                    </div>
                  </td>

                  {/* Phone */}
                  <td className="px-4 py-3 font-mono font-bold text-slate-900 dark:text-white">
                    {o.customerPhone}
                  </td>

                  {/* Network */}
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        NETWORK_CLS[o.network] ?? NETWORK_CLS.AIRTELTIGO
                      }`}
                    >
                      {o.network}
                    </span>
                  </td>

                  {/* Bundle */}
                  <td className="px-4 py-3 font-semibold">{o.gbAmount} GB</td>

                  {/* Amount */}
                  <td className="px-4 py-3 font-semibold">{ghs(o.sellingPrice)}</td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    {o.status === "AWAITING_PAYMENT" ? (
                      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                        Awaiting Payment
                      </span>
                    ) : (
                      <StatusBadge status={o.status} />
                    )}
                  </td>

                  {/* Commission state */}
                  <td className="px-4 py-3">
                    {o.underlyingOrderId ? (
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          o.commissionState === "AVAILABLE"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                            : o.commissionState === "WITHDRAWN"
                            ? "bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-400"
                            : o.commissionState === "REVERSED"
                            ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                        }`}
                      >
                        {o.commissionState}
                      </span>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>
                    )}
                  </td>

                  {/* Underlying order ID */}
                  <td className="px-4 py-3 font-mono text-xs">
                    {o.underlyingOrderId ? (
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        #{o.underlyingOrderId}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">Unpaid</span>
                    )}
                  </td>

                  {/* Date */}
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {fmt(o.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
