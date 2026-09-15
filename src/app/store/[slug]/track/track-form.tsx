"use client";

import * as React from "react";

interface TrackedOrder {
  code: string;
  reference: string;
  network: string;
  size: string;
  amount: number; // GHS
  status: string;
  createdAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  PROCESSING: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  COMPLETED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  SUCCESS: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  FAILED: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  REFUNDED: "bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300",
};

export function TrackForm({ slug }: { slug: string }) {
  const [query, setQuery] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [results, setResults] = React.useState<TrackedOrder[] | null>(null);

  async function track(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 4) {
      setError("Enter your order ID (e.g. CF-ST-00001), phone number, or payment reference.");
      return;
    }
    setBusy(true);
    setError("");
    setResults(null);
    try {
      const res = await fetch(`/api/store/${slug}/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not look up that order");
      setResults(data.orders as TrackedOrder[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not look up that order");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={track}>
        <label htmlFor="track-query" className="block text-sm font-bold text-slate-800 dark:text-slate-100">
          Order ID, phone, or email
        </label>
        <input
          id="track-query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="CLQ-XXXXXXXX · 024 XXX XXXX · you@example.com"
          className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-yellow-400 caret-yellow-500 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-slate-500 dark:caret-yellow-400"
        />
        <button
          type="submit"
          disabled={busy}
          className="mt-4 w-full rounded-full bg-yellow-300 py-3.5 text-sm font-bold text-slate-900 shadow-md shadow-yellow-400/30 transition-colors hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Searching…" : "Track Order"}
        </button>
        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </p>
        )}
      </form>

      {results && (
        <div className="mt-6 space-y-3">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {results.length === 0 ? "No orders found for that query." : `${results.length} order${results.length === 1 ? "" : "s"} found`}
          </p>
          {results.map((o) => (
            <div
              key={o.reference}
              className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 dark:border-white/10 dark:bg-white/5"
            >
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {o.network} {o.size} — ₵{o.amount.toFixed(2)}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-400">
                  {o.code} · {new Date(o.createdAt).toLocaleString()}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${STATUS_STYLES[o.status] ?? STATUS_STYLES.REFUNDED}`}
              >
                {o.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
