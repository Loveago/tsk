"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

export function WithdrawalForm({
  available,
  pending,
  disabled,
}: {
  available: number; // pesewas
  pending: boolean;
  disabled: boolean;
}) {
  const router = useRouter();
  const [amount, setAmount] = React.useState("");
  const [network, setNetwork] = React.useState("MTN");
  const [momoNumber, setMomoNumber] = React.useState("");
  const [accountName, setAccountName] = React.useState("");
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/storefront/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parseFloat(amount || "0"), network, momoNumber, accountName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Withdrawal request failed");
      setMsg({ kind: "ok", text: "Withdrawal requested — awaiting admin approval." });
      setAmount("");
      router.refresh();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Withdrawal request failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0d1526]">
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Request withdrawal</h2>
      {msg && (
        <p className={`rounded-lg px-3 py-2 text-sm ${msg.kind === "ok" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"}`}>
          {msg.text}
        </p>
      )}
      {pending && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          You already have a withdrawal awaiting review.
        </p>
      )}
      <p className="text-xs text-slate-500">Minimum GHS 50.00 · Available: GHS {(available / 100).toFixed(2)}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount (GHS)"
          inputMode="decimal"
          required
          className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-transparent"
        />
        <select
          value={network}
          onChange={(e) => setNetwork(e.target.value)}
          className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-[#0d1526]"
        >
          <option value="MTN">MTN MoMo</option>
          <option value="TELECEL">Telecel Cash</option>
          <option value="AIRTELTIGO">AirtelTigo Money</option>
        </select>
        <input
          value={momoNumber}
          onChange={(e) => setMomoNumber(e.target.value)}
          placeholder="MoMo number e.g. 0241234567"
          inputMode="tel"
          pattern="0[0-9]{9}"
          required
          className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-transparent"
        />
        <input
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
          placeholder="Account name"
          required
          className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-transparent"
        />
      </div>
      <button
        type="submit"
        disabled={busy || disabled || pending}
        className="h-10 rounded-lg bg-violet-600 px-5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
      >
        {busy ? "Submitting…" : "Request withdrawal"}
      </button>
    </form>
  );
}
