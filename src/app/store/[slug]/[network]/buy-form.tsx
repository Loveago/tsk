"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

interface Product {
  packageId: string;
  gbAmount: number;
  name: string;
  price: number; // GHS
}

/**
 * Data-size picker + beneficiary phone + BUY — mirrors the Clequa product page:
 * grid of size cards, then the phone field and a full-width yellow BUY button.
 * Guest checkout via the existing Paystack hosted flow.
 */
export function NetworkBuyForm({ slug, products }: { slug: string; products: Product[] }) {
  const [selected, setSelected] = React.useState<Product>(products[0]);
  const [phone, setPhone] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const phoneValid = /^0\d{9}$/.test(phone.trim());

  async function buy(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    if (!phoneValid) {
      setError("Enter a valid 10-digit number starting with 0, e.g. 0241234567");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/store/${slug}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId: selected.packageId, customerPhone: phone.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start payment");
      // Hosted checkout — Paystack redirects back to /store/[slug]?payment=…
      window.location.href = data.authorizationUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start payment");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={buy} className="mt-6">
      <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Data size</p>
      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((p) => {
          const active = selected?.packageId === p.packageId;
          return (
            <button
              type="button"
              key={p.packageId}
              onClick={() => {
                setSelected(p);
                setError("");
              }}
              className={`rounded-xl border px-3 py-3 text-center transition-colors ${
                active
                  ? "border-yellow-400 bg-yellow-50 ring-1 ring-yellow-400 dark:bg-yellow-400/10"
                  : "border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20"
              }`}
            >
              <span className="block text-sm font-extrabold text-slate-900 dark:text-white">{p.gbAmount}GB</span>
              <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">₵{p.price.toFixed(2)}</span>
            </button>
          );
        })}
      </div>

      <label htmlFor="beneficiary" className="mt-6 block text-sm font-bold text-slate-800 dark:text-slate-100">
        Beneficiary phone number <span className="text-red-500">*</span>
      </label>
      <input
        id="beneficiary"
        value={phone}
        onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
        placeholder="0XXXXXXXXX"
        inputMode="numeric"
        className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-base tracking-wide text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-yellow-400 caret-yellow-500 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-slate-500 dark:caret-yellow-400"
      />
      <p className="mt-1.5 text-xs text-slate-400">10 digits starting with 0 only (not 233…)</p>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !selected || !phoneValid}
        className="mt-5 h-13 w-full rounded-full bg-yellow-300 text-sm font-bold tracking-wide text-slate-900 shadow-md shadow-yellow-400/30 transition-colors hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-40"
        style={{ height: 52 }}
      >
        {busy ? (
          <span className="inline-flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Starting payment…</span>
          </span>
        ) : selected ? (
          `BUY — ₵${selected.price.toFixed(2)}`
        ) : (
          "BUY"
        )}
      </button>
      <p className="mt-3 text-center text-[11px] text-slate-400">
        You will be redirected to Paystack to complete payment.
      </p>
    </form>
  );
}
