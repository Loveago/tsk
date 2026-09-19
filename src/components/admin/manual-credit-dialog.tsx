"use client";

import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/shared";
import { formatGHS } from "@/lib/types";
import { AlertTriangle, PlusCircle, MinusCircle } from "lucide-react";

export function ManualCreditDialog({
  open,
  onClose,
  user,
  initialMode = "CREDIT",
  onCredited,
  onAdjusted,
}: {
  open: boolean;
  onClose: () => void;
  user: { id: string; name: string; email: string; balance: number } | null;
  initialMode?: "CREDIT" | "DEBIT";
  onCredited?: () => void;
  onAdjusted?: () => void;
}) {
  const { toast } = useToast();
  const [mode, setMode] = React.useState<"CREDIT" | "DEBIT">(initialMode);
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setMode(initialMode);
      setAmount("");
      setReason("");
      setReference("");
      setConfirmed(false);
    }
  }, [open, initialMode]);

  if (!user) return null;

  const parsedAmount = Number(amount) || 0;
  const isDebit = mode === "DEBIT";
  const projectedBalance = isDebit ? user.balance - parsedAmount : user.balance + parsedAmount;
  const isInsufficient = isDebit && parsedAmount > user.balance;

  const handleProceed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmed) {
      if (parsedAmount <= 0) {
        return toast(`Enter a valid ${isDebit ? "debit" : "credit"} amount`, "error");
      }
      if (isDebit && isInsufficient) {
        return toast(
          `Insufficient balance. User has ${formatGHS(user.balance)}, cannot debit ${formatGHS(parsedAmount)}`,
          "error"
        );
      }
      if (!reason.trim()) {
        return toast(`Enter a reason for this ${isDebit ? "debit" : "credit"}`, "error");
      }
      setConfirmed(true);
      return;
    }

    setSaving(true);
    try {
      const endpoint = isDebit
        ? "/api/admin/wallet/manual-debit"
        : "/api/admin/wallet/manual-credit";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          amount: parsedAmount,
          reason: reason.trim(),
          reference: reference.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? `Failed to ${isDebit ? "debit" : "credit"} wallet`, "error");
        return;
      }

      toast(
        isDebit
          ? `Successfully debited ${formatGHS(parsedAmount)} from ${user.name}`
          : `Successfully credited ${formatGHS(parsedAmount)} to ${user.name}`,
        "success"
      );
      if (onAdjusted) onAdjusted();
      else if (onCredited) onCredited();
      onClose();
    } catch {
      toast("An unexpected error occurred", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Manual Wallet ${isDebit ? "Debit" : "Credit"}: ${user.name}`}
    >
      <form onSubmit={handleProceed} className="space-y-4 text-sm">
        {/* User Card */}
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5 dark:border-white/5 dark:bg-white/5">
          <div className="flex justify-between items-center text-xs">
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-200">{user.name}</p>
              <p className="text-slate-500">{user.email}</p>
            </div>
            <div className="text-right">
              <span className="text-slate-500">Current Balance</span>
              <p className="font-bold text-slate-900 dark:text-white">{formatGHS(user.balance)}</p>
            </div>
          </div>
        </div>

        {/* Credit / Debit Segmented Selector */}
        {!confirmed && (
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 dark:bg-white/5">
            <button
              type="button"
              onClick={() => {
                setMode("CREDIT");
                setConfirmed(false);
              }}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition cursor-pointer ${
                mode === "CREDIT"
                  ? "bg-white text-emerald-700 shadow-xs dark:bg-slate-800 dark:text-emerald-400"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              <PlusCircle className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              Credit Account (+)
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("DEBIT");
                setConfirmed(false);
              }}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition cursor-pointer ${
                mode === "DEBIT"
                  ? "bg-white text-rose-700 shadow-xs dark:bg-slate-800 dark:text-rose-400"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              <MinusCircle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
              Debit Account (-)
            </button>
          </div>
        )}

        {!confirmed ? (
          <>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="adjustmentAmt">
                  {isDebit ? "Debit Amount (GHS) *" : "Credit Amount (GHS) *"}
                </Label>
                {amount && (
                  <span
                    className={`text-xs font-medium ${
                      isInsufficient
                        ? "text-rose-600 dark:text-rose-400 font-bold"
                        : "text-slate-500"
                    }`}
                  >
                    Est. New Balance: {formatGHS(projectedBalance)}
                  </span>
                )}
              </div>
              <Input
                id="adjustmentAmt"
                type="number"
                step="0.01"
                min="0.01"
                placeholder={isDebit ? "e.g. 50.00" : "e.g. 100.00"}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
              {isInsufficient && (
                <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">
                  Debit amount exceeds current user balance ({formatGHS(user.balance)}).
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="adjustmentReason">Reason / Notes *</Label>
              <Input
                id="adjustmentReason"
                placeholder={
                  isDebit
                    ? "e.g. Reversal of duplicate deposit / Administrative correction"
                    : "e.g. Telecom compensation / Manual offline deposit"
                }
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="adjustmentRef">Reference (Optional)</Label>
              <Input
                id="adjustmentRef"
                placeholder={isDebit ? "e.g. DEBIT-12345" : "e.g. REF-12345"}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                disabled={isInsufficient}
                className={`w-full text-white cursor-pointer ${
                  isDebit
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                Continue to Confirmation
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div
              className={`rounded-xl border p-4 ${
                isDebit
                  ? "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200"
                  : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200"
              }`}
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle
                  className={`h-5 w-5 shrink-0 mt-0.5 ${
                    isDebit ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400"
                  }`}
                />
                <div>
                  <p className="font-bold text-sm">
                    You are about to {isDebit ? "debit" : "credit"}{" "}
                    <span className="underline font-black">{formatGHS(parsedAmount)}</span>{" "}
                    {isDebit ? "from" : "to"} this user&apos;s wallet.
                  </p>
                  <p className="mt-1 text-xs opacity-90">Reason: {reason}</p>
                  <div className="mt-2 text-xs font-semibold">
                    <p>Current balance: {formatGHS(user.balance)}</p>
                    <p className={isDebit ? "text-rose-700 dark:text-rose-300 font-bold" : "text-emerald-700 dark:text-emerald-300 font-bold"}>
                      New balance will be: {formatGHS(projectedBalance)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 cursor-pointer"
                disabled={saving}
                onClick={() => setConfirmed(false)}
              >
                Back
              </Button>
              <Button
                type="submit"
                className={`flex-1 text-white cursor-pointer ${
                  isDebit
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-emerald-600 hover:bg-emerald-700"
                }`}
                disabled={saving}
              >
                {saving && <Spinner />}
                {isDebit ? "Confirm & Debit" : "Confirm & Credit"}
              </Button>
            </div>
          </div>
        )}
      </form>
    </Dialog>
  );
}
