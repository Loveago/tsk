"use client";

import * as React from "react";
import {
  CheckCircle2,
  Clock,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/components/toast";
import { formatGHS, formatDateTime } from "@/lib/types";

interface CashoutRow {
  id: number;
  phone: string;
  amount: number;
  status: string;
  reportText: string | null;
  transactionReference: string | null;
  createdAt: string;
  settledAt: string | null;
}

export function CashoutCard({ onSuccess }: { onSuccess?: () => void }) {
  const { toast } = useToast();
  const [phone, setPhone] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [minAmount, setMinAmount] = React.useState(1);
  const [maxAmount, setMaxAmount] = React.useState(5000);
  const [submitting, setSubmitting] = React.useState(false);

  const [activeRequest, setActiveRequest] = React.useState<CashoutRow | null>(null);
  const [history, setHistory] = React.useState<CashoutRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [claimTxId, setClaimTxId] = React.useState("");
  const [claiming, setClaiming] = React.useState(false);

  const loadCashouts = React.useCallback(async () => {
    try {
      const res = await fetch("/api/billing/cashout");
      const data = await res.json();
      if (res.ok) {
        setMinAmount(data.minAmount ?? 1);
        setMaxAmount(data.maxAmount ?? 5000);
        const rows: CashoutRow[] = data.requests || [];
        setHistory(rows);
        const inFlight = rows.find((r) =>
          ["QUEUED", "PULLED", "AWAITING_SETTLEMENT"].includes(r.status)
        );
        if (inFlight) {
          setActiveRequest(inFlight);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadCashouts();
  }, [loadCashouts]);

  // Poll active Cash-Out request every 3 seconds until settled/failed
  React.useEffect(() => {
    if (
      !activeRequest ||
      !["QUEUED", "PULLED", "AWAITING_SETTLEMENT"].includes(activeRequest.status)
    ) {
      return;
    }

    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/billing/cashout/${activeRequest.id}`);
        if (!res.ok) return;
        const data = await res.json();
        const updated: CashoutRow | undefined = data.request;
        if (!updated) return;

        setActiveRequest(updated);
        if (updated.status === "SETTLED") {
          toast(
            `Cash-Out confirmed! GHS ${updated.amount.toFixed(2)} credited (Tx ID: ${
              updated.transactionReference || "Settled"
            }).`,
            "success"
          );
          if (updated.transactionReference) {
            setClaimTxId(updated.transactionReference);
          }
          onSuccess?.();
          loadCashouts();
        } else if (updated.status === "FAILED") {
          toast(updated.reportText || "Cash-Out initiation failed.", "error");
          loadCashouts();
        }
      } catch {
        // ignore transient polling errors
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [activeRequest, toast, onSuccess, loadCashouts]);

  const handleInitiate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim() || !amount.trim()) {
      toast("Enter your MoMo number and deposit amount.", "error");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/billing/cashout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), amount: Number(amount) }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Failed to initiate Cash-Out", "error");
        return;
      }

      setActiveRequest(data.request);
      toast(
        "Cash-Out queued! Keep your phone ready to approve the MoMo Cash-Out prompt.",
        "success"
      );
      loadCashouts();
    } catch {
      toast("Error initiating Cash-Out deposit.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimTxId.trim()) {
      toast("Enter the Transaction ID from your MoMo prompt/SMS.", "error");
      return;
    }

    try {
      setClaiming(true);
      const res = await fetch("/api/billing/cashout/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: claimTxId.trim(),
          cashoutId: activeRequest?.id,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast(data.message || data.error || "Could not verify Transaction ID yet.", "error");
        return;
      }

      toast(data.message, "success");
      setClaimTxId("");
      onSuccess?.();
      loadCashouts();
    } catch {
      toast("Error claiming Cash-Out Transaction ID.", "error");
    } finally {
      setClaiming(false);
    }
  };

  const handleCancelQueued = async (id: number) => {
    try {
      const res = await fetch(`/api/billing/cashout/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast("Cash-Out request cancelled.", "success");
        setActiveRequest(null);
        loadCashouts();
      }
    } catch {
      // ignore
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Left Column: Initiate + Claim */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-[#0d1526] space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-brand-600" />
              <span>Cash-Out MoMo Deposit</span>
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              1. Dial <strong className="font-mono">*170#</strong> on your phone and select{" "}
              <strong>Allow Cash Out</strong>.<br />
              2. Enter your MoMo number and amount below, then click the button to receive the
              Cash-Out prompt.
            </p>
          </div>

          <form onSubmit={handleInitiate} className="space-y-3">
            <div className="space-y-1.5">
              <Label>MoMo Number</Label>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0241234567"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>
                Amount (GHS {minAmount} – {maxAmount})
              </Label>
              <Input
                type="number"
                step="0.01"
                min={minAmount}
                max={maxAmount}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="50.00"
                required
              />
            </div>

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting
                ? "Queuing Cash-Out..."
                : "I Have Allowed Cash-Out — Request Deposit"}
            </Button>
          </form>

          {activeRequest && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs space-y-2 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  Request #{activeRequest.id} • {formatGHS(activeRequest.amount)}
                </span>
                <StatusBadge status={activeRequest.status} />
              </div>

              {activeRequest.status === "QUEUED" && (
                <div className="flex items-center justify-between gap-2 text-slate-600 dark:text-slate-300">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-amber-500 animate-pulse" />
                    Queued — sending to Cash-Out app...
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCancelQueued(activeRequest.id)}
                    className="text-[11px] text-rose-600 hover:underline font-medium"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {activeRequest.status === "PULLED" && (
                <p className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Processing — initiating Cash-Out prompt...
                </p>
              )}

              {activeRequest.status === "AWAITING_SETTLEMENT" && (
                <p className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-300 font-medium">
                  <Smartphone className="h-3.5 w-3.5" />
                  Prompt sent to {activeRequest.phone}! Approve it on your phone to complete.
                </p>
              )}

              {activeRequest.status === "SETTLED" && (
                <div className="space-y-1 text-emerald-700 dark:text-emerald-300">
                  <p className="inline-flex items-center gap-1.5 font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Deposit Completed &amp; Credited!
                  </p>
                  {activeRequest.transactionReference && (
                    <p className="font-mono text-[11px]">
                      Transaction ID: <strong>{activeRequest.transactionReference}</strong>
                    </p>
                  )}
                </div>
              )}

              {activeRequest.status === "FAILED" && (
                <p className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                  <XCircle className="h-3.5 w-3.5" />
                  {activeRequest.reportText || "Cash-Out initiation failed."}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Claim by Transaction ID */}
        <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-[#0d1526] space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>Claim Cash-Out Transaction ID</span>
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              After approving the Cash-Out prompt, enter the Transaction ID shown to verify and
              claim your deposit.
            </p>
          </div>
          <form onSubmit={handleClaim} className="space-y-2.5">
            <Input
              type="text"
              value={claimTxId}
              onChange={(e) => setClaimTxId(e.target.value)}
              placeholder="e.g. 90659976372"
              className="font-mono"
            />
            <Button
              type="submit"
              variant="outline"
              disabled={claiming || !claimTxId.trim()}
              className="w-full"
            >
              {claiming ? "Verifying Transaction ID..." : "Verify & Claim Deposit"}
            </Button>
          </form>
        </div>
      </div>

      {/* Right Column: Recent Cash-Out History */}
      <div className="rounded-2xl border border-slate-200/70 bg-white shadow-sm dark:border-white/5 dark:bg-[#0d1526] lg:col-span-2">
        <div className="border-b border-slate-100 px-5 py-4 dark:border-white/5 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recent Cash-Out Requests</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={loadCashouts}
            className="h-7 text-xs gap-1"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Refresh</span>
          </Button>
        </div>
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading Cash-Out history...</div>
        ) : history.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No Cash-Out deposit requests yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 text-[11px] uppercase tracking-wider text-slate-500 dark:border-white/5">
                <tr>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">MoMo Number</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Transaction ID</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {history.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-mono font-semibold">#{r.id}</td>
                    <td className="px-4 py-3 font-mono">{r.phone}</td>
                    <td className="px-4 py-3 font-semibold">{formatGHS(r.amount)}</td>
                    <td className="px-4 py-3 font-mono text-[11px]">
                      {r.transactionReference || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {formatDateTime(r.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
