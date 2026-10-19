"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Lock, CheckCircle2, AlertCircle, RefreshCw, ShieldCheck } from "lucide-react";

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

  // Inputs
  const [network, setNetwork] = React.useState("MTN");
  const [momoNumber, setMomoNumber] = React.useState("");
  const [amount, setAmount] = React.useState("");

  // Verification state
  const [verifiedName, setVerifiedName] = React.useState<string | null>(null);
  const [verifying, setVerifying] = React.useState(false);
  const [verifyError, setVerifyError] = React.useState<string | null>(null);

  // Form submission state
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Clear verification whenever network or momoNumber changes
  const handleNetworkChange = (newNet: string) => {
    setNetwork(newNet);
    setVerifiedName(null);
    setVerifyError(null);
  };

  const handleMomoNumberChange = (newNum: string) => {
    setMomoNumber(newNum);
    setVerifiedName(null);
    setVerifyError(null);
  };

  // Trigger Paystack verification
  const handleVerifyAccount = async () => {
    const cleanNum = momoNumber.replace(/\D/g, "");
    if (cleanNum.length !== 10 || !cleanNum.startsWith("0")) {
      setVerifyError("Please enter a valid 10-digit mobile number starting with 0 (e.g. 0241234567)");
      return;
    }

    setVerifying(true);
    setVerifyError(null);
    setVerifiedName(null);

    try {
      const res = await fetch("/api/storefront/withdrawals/verify-momo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ network, momoNumber: cleanNum }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok || !data.accountName) {
        throw new Error(data.error || "Could not resolve account name on Paystack. Please check the network and number.");
      }

      setVerifiedName(data.accountName);
    } catch (err: any) {
      setVerifyError(err?.message || "Verification failed. Please double check the number and network.");
    } finally {
      setVerifying(false);
    }
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending || isFormLocked) return;
    if (!verifiedName) {
      setVerifyError("Please verify your Mobile Money account number before proceeding.");
      return;
    }

    const numAmount = parseFloat(amount || "0");
    if (numAmount < 50) {
      setMsg({ kind: "err", text: "Minimum withdrawal amount is GHS 50.00" });
      return;
    }

    if (numAmount * 100 > available) {
      setMsg({ kind: "err", text: "Amount exceeds your available balance" });
      return;
    }

    setBusy(true);
    setMsg(null);

    try {
      const res = await fetch("/api/storefront/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: numAmount,
          network,
          momoNumber,
          accountName: verifiedName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Withdrawal request failed");

      if (data.autoPayout) {
        setMsg({
          kind: "ok",
          text: "⚡ Payout sent successfully! Funds have been disbursed directly to your Mobile Money account via Paystack.",
        });
      } else {
        setMsg({
          kind: "ok",
          text: data.message || "Withdrawal requested — awaiting admin review and payout.",
        });
      }

      setAmount("");
      setVerifiedName(null);
      setMomoNumber("");
      router.refresh();
    } catch (e: any) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Withdrawal request failed" });
    } finally {
      setBusy(false);
    }
  }

  const isFormLocked = pending || disabled;
  const isNumberComplete = momoNumber.replace(/\D/g, "").length === 10;
  const numAmount = parseFloat(amount || "0");
  const feeGHS = 1.0;
  const netPayout = Math.max(0, numAmount - feeGHS);

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
        <div className={`flex items-start gap-2 rounded-xl p-3 text-xs ${
          msg.kind === "ok"
            ? "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-300"
            : "bg-red-50 text-red-800 border border-red-200 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-300"
        }`}>
          {msg.kind === "ok" ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />}
          <span>{msg.text}</span>
        </div>
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
                You currently have an active withdrawal request awaiting review and payout
                {pendingDetails ? (
                  <>
                    : <strong className="text-amber-950 dark:text-amber-100">GHS {pendingDetails.amountGHS.toFixed(2)}</strong> (Net payout: <strong className="text-amber-950 dark:text-amber-100">GHS {pendingDetails.netAmountGHS.toFixed(2)}</strong>) to {pendingDetails.network} {pendingDetails.momoNumber} ({pendingDetails.reference}).
                  </>
                ) : (
                  "."
                )}
              </p>
              <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80">
                🔒 Subsequent withdrawal requests are locked until your pending request is processed.
              </p>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-500">
        Minimum GHS 50.00 · Available: <strong className="text-slate-800 dark:text-slate-200">GHS {(available / 100).toFixed(2)}</strong> · Withdrawal fee: <span className="font-semibold text-slate-700 dark:text-slate-300">GHS 1.00</span>
      </p>

      {/* Step 1: Telco & MoMo Number */}
      <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 dark:border-slate-800/80 dark:bg-white/[0.02]">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
          <span className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">1</span>
            Mobile Money Destination
          </span>
          {verifiedName && (
            <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400 text-[11px]">
              <ShieldCheck className="h-3.5 w-3.5" /> Verified on Paystack
            </span>
          )}
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500">Network</label>
            <select
              value={network}
              onChange={(e) => handleNetworkChange(e.target.value)}
              disabled={isFormLocked || busy || verifying}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-700 dark:bg-[#0d1526] dark:text-slate-100 dark:disabled:bg-slate-900/50"
            >
              <option value="MTN">MTN MoMo</option>
              <option value="TELECEL">Telecel Cash (Vodafone)</option>
              <option value="AIRTELTIGO">AirtelTigo Money</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500">MoMo Number</label>
            <div className="relative">
              <input
                value={momoNumber}
                onChange={(e) => handleMomoNumberChange(e.target.value)}
                placeholder="024XXXXXXX"
                inputMode="tel"
                maxLength={10}
                required
                disabled={isFormLocked || busy || verifying}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 pr-20 text-sm text-slate-900 placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-700 dark:bg-transparent dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:bg-slate-900/50 font-mono font-semibold"
              />
              {!verifiedName && isNumberComplete && !isFormLocked && (
                <button
                  type="button"
                  onClick={handleVerifyAccount}
                  disabled={verifying}
                  className="absolute right-1 top-1 bottom-1 rounded-md bg-brand-600 px-2.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-500 disabled:opacity-50 transition-colors flex items-center gap-1"
                >
                  {verifying ? <RefreshCw className="h-3 w-3 animate-spin" /> : "Verify"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Verification Status Banner */}
        {verifying && (
          <div className="flex items-center gap-2 rounded-lg bg-sky-50 border border-sky-200 px-3 py-2 text-xs text-sky-800 dark:bg-sky-500/10 dark:border-sky-500/20 dark:text-sky-300">
            <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0 text-sky-600" />
            <span>Resolving registered name with {network} via Paystack…</span>
          </div>
        )}

        {verifiedName && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <div className="flex-1">
              <span className="text-slate-500 dark:text-slate-400">Registered Name: </span>
              <strong className="uppercase font-bold text-emerald-950 dark:text-emerald-100">{verifiedName}</strong>
            </div>
          </div>
        )}

        {verifyError && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            <span>{verifyError}</span>
          </div>
        )}
      </div>

      {/* Step 2: Amount (Unlocked only after MoMo verification) */}
      <div className={`space-y-3 rounded-xl border p-3.5 transition-all ${
        verifiedName
          ? "border-slate-200 bg-white dark:border-slate-800 dark:bg-transparent"
          : "border-slate-100 bg-slate-50/50 opacity-60 dark:border-slate-800/40 dark:bg-white/[0.01]"
      }`}>
        <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
          <span className="flex items-center gap-1.5">
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white ${
              verifiedName ? "bg-brand-600" : "bg-slate-400"
            }`}>2</span>
            Withdrawal Amount
          </span>
          {!verifiedName && (
            <span className="text-[11px] text-slate-400 italic">Verify MoMo number to unlock</span>
          )}
        </div>

        <div>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount (GHS) — min 50.00"
            inputMode="decimal"
            required
            disabled={!verifiedName || isFormLocked || busy}
            className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed dark:border-slate-700 dark:bg-transparent dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:bg-slate-900/50 font-semibold"
          />
        </div>

        {/* Dynamic breakdown */}
        {verifiedName && numAmount > 0 && (
          <div className="rounded-lg bg-slate-50 p-3 text-xs dark:bg-white/5 border border-slate-200 dark:border-slate-800 space-y-1">
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>Gross requested:</span>
              <span className="font-medium text-slate-700 dark:text-slate-300">GHS {numAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>Withdrawal fee:</span>
              <span className="font-medium text-red-500">- GHS {feeGHS.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1.5 font-bold text-slate-900 dark:border-slate-700 dark:text-white">
              <span>Net payout to {verifiedName}:</span>
              <span className="text-emerald-600 dark:text-emerald-400 text-sm">
                GHS {netPayout.toFixed(2)}
              </span>
            </div>
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={busy || isFormLocked || !verifiedName || numAmount < 50}
        className={`flex items-center justify-center gap-2 h-11 w-full rounded-xl px-5 text-sm font-bold transition-all shadow-sm ${
          pending
            ? "bg-amber-100 text-amber-800 border border-amber-300 cursor-not-allowed dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30"
            : disabled || !verifiedName || numAmount < 50
            ? "bg-slate-200 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-500 shadow-none"
            : "bg-brand-600 text-white hover:bg-brand-500 hover:shadow-brand-500/20"
        }`}
      >
        {pending ? (
          <>
            <Lock className="h-4 w-4" />
            <span>Withdrawals Locked (Pending Request in Review)</span>
          </>
        ) : busy ? (
          <>
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Processing Withdrawal…</span>
          </>
        ) : !verifiedName ? (
          <span>Verify Mobile Money Number to Proceed</span>
        ) : numAmount < 50 ? (
          <span>Enter Amount (Min GHS 50.00)</span>
        ) : (
          <span>Withdraw GHS {netPayout.toFixed(2)} to {verifiedName}</span>
        )}
      </button>
    </form>
  );
}
