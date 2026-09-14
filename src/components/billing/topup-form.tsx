"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/shared";
import { CreditCard } from "lucide-react";

export function TopupForm({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [amount, setAmount] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast("Enter a valid amount", "error");

    setSubmitting(true);
    try {
      const res = await fetch("/api/billing/paystack/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt }),
      });
      const json = await res.json();
      if (!res.ok) return toast(json.error ?? "Failed to start Paystack payment", "error");
      toast("Redirecting to secure Paystack checkout…", "success");
      window.location.href = json.authorizationUrl;
      return;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="rounded-xl border border-brand-600/30 bg-brand-50/60 p-3.5 text-left transition dark:border-brand-500/30 dark:bg-brand-500/10">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          <p className="text-sm font-semibold text-brand-900 dark:text-brand-200">Paystack Instant Top-up</p>
        </div>
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          Instant automatic crediting via Mobile Money (MTN, Telecel, AT) or debit card.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="amount">Amount (GHS)</Label>
        <Input
          id="amount"
          type="number"
          min="1"
          step="0.01"
          placeholder="50.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting && <Spinner className="mr-2" />}
        Pay with Paystack
      </Button>
      <p className="text-center text-xs text-slate-500 dark:text-slate-400">
        You will be redirected to Paystack to complete payment. Your wallet is credited instantly on success.
      </p>
    </form>
  );
}
