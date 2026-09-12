"use client";

import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/shared";
import { formatGHS } from "@/lib/types";
import { AlertTriangle, Wallet } from "lucide-react";

export function ManualCreditDialog({
  open,
  onClose,
  user,
  onCredited,
}: {
  open: boolean;
  onClose: () => void;
  user: { id: string; name: string; email: string; balance: number } | null;
  onCredited: () => void;
}) {
  const { toast } = useToast();
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setAmount("");
      setReason("");
      setReference("");
      setConfirmed(false);
    }
  }, [open]);

  if (!user) return null;

  const parsedAmount = Number(amount) || 0;

  const handleProceed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmed) {
      if (parsedAmount <= 0) return toast("Enter a valid credit amount", "error");
      if (!reason.trim()) return toast("Enter a reason for this credit", "error");
      setConfirmed(true);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/wallet/manual-credit", {
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
        toast(json.error ?? "Failed to credit wallet", "error");
        return;
      }

      toast(`Successfully credited ${formatGHS(parsedAmount)} to ${user.name}`, "success");
      onCredited();
      onClose();
    } catch {
      toast("An unexpected error occurred", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={`Manual Wallet Credit: ${user.name}`}>
      <form onSubmit={handleProceed} className="space-y-4 text-sm">
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

        {!confirmed ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="creditAmt">Credit Amount (GHS) *</Label>
              <Input
                id="creditAmt"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="e.g. 100.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="creditReason">Reason / Notes *</Label>
              <Input
                id="creditReason"
                placeholder="e.g. Telecom compensation / Manual offline deposit"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="creditRef">Reference (Optional)</Label>
              <Input
                id="creditRef"
                placeholder="e.g. REF-12345"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>

            <div className="pt-2">
              <Button type="submit" className="w-full">
                Continue to Confirmation
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div>
                  <p className="font-bold text-sm">
                    You are about to credit {formatGHS(parsedAmount)} to this user&apos;s wallet.
                  </p>
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                    Reason: {reason}
                  </p>
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                    New balance will be: {formatGHS(user.balance + parsedAmount)}.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={saving}
                onClick={() => setConfirmed(false)}
              >
                Back
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={saving}
              >
                {saving && <Spinner />} Confirm &amp; Credit
              </Button>
            </div>
          </div>
        )}
      </form>
    </Dialog>
  );
}

