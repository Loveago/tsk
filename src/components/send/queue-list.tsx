import { formatGHS } from "@/lib/types";
import { isMtnPrefix } from "@/lib/phone-utils";
import { Send, ShoppingBag, Trash2 } from "lucide-react";

export interface Line {
  phoneNumber: string;
  network: string;
  gbAmount: number;
  price: number | null;
}

export function QueueList({
  lines,
  onRemove,
  onClear,
}: {
  lines: Line[];
  onRemove: (i: number) => void;
  onClear: () => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white shadow-sm dark:border-white/5 dark:bg-[#0d1526]">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-white/5">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <ShoppingBag className="h-4 w-4 text-brand-500" /> Order Queue
          <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-[11px] font-bold text-brand-600 dark:text-brand-400">
            {lines.length}
          </span>
        </h2>
        {lines.length > 0 && (
          <button onClick={onClear} className="text-xs font-semibold text-red-500 hover:underline">
            Clear all
          </button>
        )}
      </div>
      <div className="divide-y divide-slate-100 dark:divide-white/5">
        {lines.map((l, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-2.5 text-sm">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500 dark:bg-white/5 dark:text-slate-400">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 truncate">
              <span className="font-semibold">{l.phoneNumber}</span>
              {l.network === "MTN" && !isMtnPrefix(l.phoneNumber) && (
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                  Ported to MTN
                </span>
              )}
            </div>
            <span
              className={`hidden sm:inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                l.network === "MTN"
                  ? "bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30"
                  : l.network === "TELECEL"
                  ? "bg-red-100 text-red-800 border border-red-300 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/30"
                  : "bg-blue-100 text-blue-800 border border-blue-300 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30"
              }`}
            >
              {l.network}
            </span>
            <span className="inline-flex items-center rounded-full bg-violet-500/10 px-2 py-0.5 text-[11px] font-bold text-violet-600 dark:text-violet-400">
              {l.gbAmount} GB
            </span>
            <span className="w-20 text-right font-semibold">{formatGHS(l.price ?? 0)}</span>
            <button
              onClick={() => onRemove(i)}
              className="text-slate-400 hover:text-red-500"
              aria-label="Remove"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SendSummary({
  count,
  total,
  submitting,
  onSubmit,
}: {
  count: number;
  total: number;
  submitting: boolean;
  onSubmit: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-600 to-violet-600 text-white shadow-lg shadow-blue-600/25">
      <div className="flex flex-col items-center gap-1.5 px-6 py-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 backdrop-blur">
          <Send className="h-6 w-6" />
        </span>
        <h2 className="text-base font-bold">Ready to Send Orders</h2>
        {count === 0 ? (
          <p className="max-w-xs text-xs text-blue-100">
            Upload an order file or paste your order list to begin processing and sending orders.
          </p>
        ) : (
          <>
            <p className="text-xs text-blue-100">
              {count} order{count === 1 ? "" : "s"} queued · total cost {formatGHS(total)}
            </p>
            <button
              onClick={onSubmit}
              disabled={submitting}
              className="mt-3 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-8 text-sm font-bold text-blue-700 shadow-md transition hover:bg-blue-50 disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {submitting ? "Sending…" : `Send ${count} order${count === 1 ? "" : "s"}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
