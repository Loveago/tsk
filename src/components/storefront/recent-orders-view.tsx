"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Package, ChevronLeft, ChevronRight, Phone, Mail, DollarSign } from "lucide-react";
import { fromPesewas, storefrontOrderCode } from "@/lib/storefront-utils";

export interface StorefrontOrderData {
  id: string;
  seq: number;
  paymentReference: string;
  customerPhone: string;
  customerEmail: string | null;
  sellingPrice: number;
  commission: number;
  status: string;
  createdAt: string;
  product: {
    dataPackage: {
      network: string;
      gbAmount: number;
    };
  };
}

const ORDER_BADGES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  PROCESSING: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
  COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
  REFUNDED: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300",
};

const NETWORK_BADGES: Record<string, string> = {
  MTN: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
  TELECEL: "bg-red-100 text-red-900 border-red-300 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",
  AIRTELTIGO: "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
        ORDER_BADGES[status] ?? "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300"
      }`}
    >
      {status}
    </span>
  );
}

export function RecentOrdersView({
  orders,
  totalOrders,
  page,
  pageSize = 10,
  storeUrl,
}: {
  orders: StorefrontOrderData[];
  totalOrders: number;
  page: number;
  pageSize?: number;
  storeUrl: string;
}) {
  const router = useRouter();
  const totalPages = Math.ceil(totalOrders / pageSize) || 1;

  function goToPage(p: number) {
    const next = Math.max(1, Math.min(totalPages, p));
    const url = new URL(window.location.href);
    url.searchParams.set("orderPage", String(next));
    router.push(url.pathname + url.search);
  }

  if (totalOrders === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
        <Package className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
        <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">No sales yet</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Share your store link{" "}
          <span className="font-semibold text-violet-600 dark:text-violet-400">{storeUrl}</span> with your customers to get your first order.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#0d1526]">
      {/* Mobile Card List (sm:hidden) */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800/60 sm:hidden">
        {orders.map((o) => {
          const code = storefrontOrderCode(o.seq, o.paymentReference);
          const network = o.product.dataPackage.network;
          const gb = o.product.dataPackage.gbAmount;

          return (
            <div key={o.id} className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                  {code}
                </span>
                <StatusBadge status={o.status} />
              </div>

              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${NETWORK_BADGES[network] || "bg-slate-100"}`}>
                    {network}
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{gb} GB Bundle</span>
                </div>
                <span className="text-[11px] text-slate-400">
                  {new Date(o.createdAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
                </span>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5 text-xs dark:border-slate-800 dark:bg-white/[0.02]">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Recipient Phone:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{o.customerPhone}</span>
                </div>
                {o.customerEmail && (
                  <div className="flex items-center justify-between mt-1 text-[11px]">
                    <span className="text-slate-500 dark:text-slate-400">Customer Email:</span>
                    <span className="text-slate-700 dark:text-slate-300 truncate max-w-[180px]">{o.customerEmail}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800 text-xs">
                <div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">Price: </span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">GHS {fromPesewas(o.sellingPrice).toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">Your Profit: </span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">+GHS {fromPesewas(o.commission).toFixed(2)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop Table View (hidden sm:block) */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-white/5 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Bundle</th>
              <th className="px-4 py-3">Recipient</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Commission</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {orders.map((o) => (
              <tr key={o.id} className="transition-colors hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
                <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900 dark:text-white">
                  {storefrontOrderCode(o.seq, o.paymentReference)}
                  <p className="text-[10px] font-normal text-slate-400 mt-0.5">
                    {new Date(o.createdAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${NETWORK_BADGES[o.product.dataPackage.network] || "bg-slate-100"}`}>
                      {o.product.dataPackage.network}
                    </span>
                    <span className="font-medium">{o.product.dataPackage.gbAmount} GB</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900 dark:text-white">{o.customerPhone}</p>
                  {o.customerEmail && (
                    <p className="text-[11px] text-slate-400 max-w-[170px] truncate" title={o.customerEmail}>
                      {o.customerEmail}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300 font-medium">
                  GHS {fromPesewas(o.sellingPrice).toFixed(2)}
                </td>
                <td className="px-4 py-3 font-bold text-emerald-600 dark:text-emerald-400">
                  +GHS {fromPesewas(o.commission).toFixed(2)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={o.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-4 dark:border-slate-800 text-xs">
          <span className="text-slate-500 dark:text-slate-400">
            Page {page} of {totalPages} ({totalOrders} total orders)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => goToPage(page - 1)}
              className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Previous</span>
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => goToPage(page + 1)}
              className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <span>Next</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
