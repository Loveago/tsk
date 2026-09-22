"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Copy, Check } from "lucide-react";
import { fromPesewas } from "@/lib/storefront-utils";

export interface ResellerWithdrawalItem {
  id: string;
  seq: number;
  reference: string;
  amount: number;
  fee: number;
  netAmount: number;
  network: string;
  momoNumber: string;
  accountName: string;
  status: string;
  adminNote: string | null;
  requestedAt: string;
}

export function WalletWithdrawalsView({
  withdrawals,
  total,
  page,
  pageSize = 10,
}: {
  withdrawals: ResellerWithdrawalItem[];
  total: number;
  page: number;
  pageSize?: number;
}) {
  const router = useRouter();
  const totalPages = Math.ceil(total / pageSize) || 1;
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function goToPage(p: number) {
    const next = Math.max(1, Math.min(totalPages, p));
    const url = new URL(window.location.href);
    url.searchParams.set("wdPage", String(next));
    router.push(url.pathname + url.search);
  }

  if (total === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-800">
        No withdrawals yet
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#0d1526]">
      {/* Mobile Card View (sm:hidden) */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800/60 sm:hidden">
        {withdrawals.map((w) => {
          const isPending = w.status === "PENDING";
          const isApproved = w.status === "APPROVED";
          const isRejected = w.status === "REJECTED";

          return (
            <div key={w.id} className="p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-slate-900 dark:text-white">
                  <span>{w.reference}</span>
                  <button
                    type="button"
                    onClick={() => copy(w.reference, w.id)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    {copiedId === w.id ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                    isApproved
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                      : isRejected
                      ? "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300"
                      : "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-300"
                  }`}
                >
                  {isPending && <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping" />}
                  {w.status}
                </span>
              </div>

              <div className="rounded-lg bg-slate-50 p-2.5 text-xs dark:bg-white/[0.02] border border-slate-100 dark:border-slate-800 space-y-1">
                <div className="flex justify-between text-slate-500">
                  <span>Requested:</span>
                  <span className="font-medium text-slate-700 dark:text-slate-300">GHS {fromPesewas(w.amount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Fee:</span>
                  <span className="text-red-500">-GHS {fromPesewas(w.fee).toFixed(2)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200 dark:border-slate-800 font-semibold">
                  <span className="text-slate-800 dark:text-slate-200">Net Payout to MoMo:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">GHS {fromPesewas(w.netAmount).toFixed(2)}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-600 dark:text-slate-400">
                  {w.network} · {w.momoNumber} ({w.accountName})
                </span>
                <span className="text-[11px] text-slate-400">
                  {new Date(w.requestedAt).toLocaleDateString("en-GB", { dateStyle: "short" })}
                </span>
              </div>

              {w.adminNote && (
                <p className="text-[11px] italic text-slate-500 dark:text-slate-400">{w.adminNote}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop Table View (hidden sm:block) */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-white/5">
            <tr>
              <th className="px-4 py-2.5">Ref</th>
              <th className="px-4 py-2.5">Gross</th>
              <th className="px-4 py-2.5">Fee</th>
              <th className="px-4 py-2.5">Net Payout</th>
              <th className="px-4 py-2.5">Destination</th>
              <th className="px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {withdrawals.map((w) => (
              <tr key={w.id} className="transition-colors hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
                <td className="px-4 py-2.5 font-mono text-xs font-semibold text-slate-900 dark:text-white">
                  {w.reference}
                  <p className="text-[10px] font-normal text-slate-400 mt-0.5">
                    {new Date(w.requestedAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
                  </p>
                </td>
                <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                  GHS {fromPesewas(w.amount).toFixed(2)}
                </td>
                <td className="px-4 py-2.5 text-xs text-red-500">
                  -GHS {fromPesewas(w.fee).toFixed(2)}
                </td>
                <td className="px-4 py-2.5 font-bold text-emerald-600 dark:text-emerald-400">
                  GHS {fromPesewas(w.netAmount).toFixed(2)}
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-700 dark:text-slate-300">
                  {w.network} · {w.momoNumber}
                  <p className="text-[10px] text-slate-400">{w.accountName}</p>
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      w.status === "APPROVED"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                        : w.status === "REJECTED"
                        ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                    }`}
                  >
                    {w.status}
                  </span>
                  {w.adminNote && (
                    <p className="mt-1 text-[11px] italic text-slate-400 max-w-[200px] truncate" title={w.adminNote}>
                      {w.adminNote}
                    </p>
                  )}
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
            Page {page} of {totalPages} ({total} withdrawals)
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
