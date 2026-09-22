"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { fromPesewas } from "@/lib/storefront-utils";

export interface ResellerTransactionItem {
  id: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  pendingBefore: number | null;
  pendingAfter: number | null;
  reference: string | null;
  description: string | null;
  createdAt: string;
}

const TYPE_STYLES: Record<string, string> = {
  COMMISSION: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  COMMISSION_RELEASE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  COMMISSION_REVERSAL: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
  WITHDRAWAL: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300",
  WITHDRAWAL_REVERSAL: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
  ADJUSTMENT: "bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-300",
};

export function WalletLedgerView({
  transactions,
  total,
  page,
  pageSize = 15,
}: {
  transactions: ResellerTransactionItem[];
  total: number;
  page: number;
  pageSize?: number;
}) {
  const router = useRouter();
  const totalPages = Math.ceil(total / pageSize) || 1;

  function goToPage(p: number) {
    const next = Math.max(1, Math.min(totalPages, p));
    const url = new URL(window.location.href);
    url.searchParams.set("txPage", String(next));
    router.push(url.pathname + url.search);
  }

  if (total === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-800">
        No transactions yet
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#0d1526]">
      {/* Mobile Cards (sm:hidden) */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800/60 sm:hidden">
        {transactions.map((t) => {
          const isPositive = t.amount >= 0;
          return (
            <div key={t.id} className="p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    TYPE_STYLES[t.type] || "bg-slate-100 text-slate-700"
                  }`}
                >
                  {t.type}
                </span>
                <span className="text-[11px] text-slate-400">
                  {new Date(t.createdAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
                </span>
              </div>

              <div className="flex items-center justify-between pt-0.5">
                <div>
                  <p
                    className={`text-sm font-bold ${
                      isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
                    }`}
                  >
                    {isPositive ? "+" : "−"}GHS {fromPesewas(Math.abs(t.amount)).toFixed(2)}
                  </p>
                  {t.description && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{t.description}</p>
                  )}
                  {t.reference && (
                    <p className="font-mono text-[10px] text-slate-400">Ref: {t.reference}</p>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Balance after</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    GHS {fromPesewas(t.balanceAfter).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop Table (hidden sm:block) */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-white/5">
            <tr>
              <th className="px-4 py-2.5">Date</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5">Amount</th>
              <th className="px-4 py-2.5">Balance After</th>
              <th className="px-4 py-2.5">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {transactions.map((t) => (
              <tr key={t.id} className="transition-colors hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
                <td className="px-4 py-2.5 text-xs text-slate-500">
                  {new Date(t.createdAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      TYPE_STYLES[t.type] || "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {t.type}
                  </span>
                </td>
                <td
                  className={`px-4 py-2.5 font-bold ${
                    t.amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
                  }`}
                >
                  {t.amount >= 0 ? "+" : "−"}GHS {fromPesewas(Math.abs(t.amount)).toFixed(2)}
                </td>
                <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-white">
                  GHS {fromPesewas(t.balanceAfter).toFixed(2)}
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                  {t.description || t.reference || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-3.5 dark:border-slate-800 text-xs">
          <span className="text-slate-500 dark:text-slate-400">
            Page {page} of {totalPages} ({total} transactions)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => goToPage(page - 1)}
              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Previous</span>
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => goToPage(page + 1)}
              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
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
