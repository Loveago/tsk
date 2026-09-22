"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";

export interface PendingWithdrawalInfo {
  amountGHS: number;
  feeGHS: number;
  netAmountGHS: number;
  network: string;
  momoNumber: string;
  accountName: string;
  reference: string;
  requestedAt: string;
}

export function WithdrawalForm({
  available,
  pending,
  pendingDetails,
  disabled,
}: {
  available: number; // pesewas
  pending: boolean;
  pendingDetails?: PendingWithdrawalInfo | null;
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
    if (pending) return;
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

  const isFormLocked = pending || disabled;

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0d1526]">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Request withdrawal</h2>
        {pending && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
            <Lock className="h-3 w-3" /> Locked
          </span>
        )}
      </div>

      {msg && (
        <p className={`rounded-lg px-3 py-2 text-sm ${msg.kind === "ok" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"}`}>
          {msg.text}
        </p>
      )}

      {pending && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-200 text-amber-900 dark:bg-amber-500/20 dark:text-amber-300">
              <Lock className="h-4 w-4" />
            </span>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                Withdrawals Locked — Pending Request in Progress
              </h3>
              <p className="text-xs text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
                You currently have an active withdrawal request awaiting admin review and payout
                {pendingDetails ? (
                  <>
                    : <strong className="text-amber-950 dark:text-amber-100">GHS {pendingDetails.amountGHS.toFixed(2)}</strong> (Net payout: <strong className="text-amber-950 dark:text-amber-100">GHS {pendingDetails.netAmountGHS.toFixed(2)}</strong>) to {pendingDetails.network} {pendingDetails.momoNumber} ({pendingDetails.reference}).
                  </>
                ) : (
                  "."
                )}
              </p>
              <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80">
                🔒 To prevent double withdrawals, subsequent withdrawal requests are locked until your pending request is approved or processed.
              </p>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-500">
        Minimum GHS 50.00 · Available: GHS {(available / 100).toFixed(2)} · Withdrawal fee: <span className="font-semibold text-slate-700 dark:text-slate-300">GHS 1.00</span>
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount (GHS)"
          inputMode="decimal"
          required
          disabled={isFormLocked || busy}
          className="h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-900 placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed dark:border-slate-700 dark:bg-transparent dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:bg-slate-900/50"
        />
        <select
          value={network}
          onChange={(e) => setNetwork(e.target.value)}
          disabled={isFormLocked || busy}
          className="h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed dark:border-slate-700 dark:bg-[#0d1526] dark:text-slate-100 dark:disabled:bg-slate-900/50"
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
          disabled={isFormLocked || busy}
          className="h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-900 placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed dark:border-slate-700 dark:bg-transparent dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:bg-slate-900/50"
        />
        <input
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
          placeholder="Account name"
          required
          disabled={isFormLocked || busy}
          className="h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-900 placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed dark:border-slate-700 dark:bg-transparent dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:bg-slate-900/50"
        />
      </div>

      {!isFormLocked && parseFloat(amount || "0") > 0 && (
        <div className="rounded-lg bg-slate-50 p-3 text-xs dark:bg-white/5 border border-slate-200 dark:border-slate-800">
          <div className="flex justify-between py-0.5 text-slate-500 dark:text-slate-400">
            <span>Requested withdrawal:</span>
            <span className="font-medium text-slate-700 dark:text-slate-300">GHS {parseFloat(amount || "0").toFixed(2)}</span>
          </div>
          <div className="flex justify-between py-0.5 text-slate-500 dark:text-slate-400">
            <span>Withdrawal fee:</span>
            <span className="font-medium text-red-500">- GHS 1.00</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 font-semibold text-slate-900 dark:border-slate-700 dark:text-white">
            <span>Net payout to your MoMo:</span>
            <span className="text-emerald-600 dark:text-emerald-400">
              GHS {Math.max(0, parseFloat(amount || "0") - 1).toFixed(2)}
            </span>
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={busy || isFormLocked}
        className={`flex items-center justify-center gap-2 h-10 rounded-lg px-5 text-sm font-semibold transition-colors ${
          pending
            ? "bg-amber-100 text-amber-800 border border-amber-300 cursor-not-allowed dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30"
            : disabled
            ? "bg-slate-200 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-500"
            : "bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50"
        }`}
      >
        {pending ? (
          <>
            <Lock className="h-4 w-4" />
            <span>Withdrawals Locked (Pending Request in Review)</span>
          </>
        ) : busy ? (
          "Submitting…"
        ) : (
          "Request withdrawal"
        )}
      </button>
    </form>
  );
}
