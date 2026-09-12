"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/shared";
import { CreditCard, Smartphone } from "lucide-react";

type Method = "PAYSTACK" | "MOMO";

export function TopupForm({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [method, setMethod] = React.useState<Method>("PAYSTACK");
  const [amount, setAmount] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast("Enter a valid amount", "error");

    if (method === "PAYSTACK") {
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
    }

    if (!reference.trim()) return toast("Enter the MoMo reference", "error");
    setSubmitting(true);
    try {
      const res = await fetch("/api/billing/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, reference: reference.trim() }),
      });
      const json = await res.json();
      if (!res.ok) return toast(json.error ?? "Failed to submit top-up", "error");
      toast("Top-up submitted — pending admin approval", "success");
      setAmount("");
      setReference("");
      onSuccess();
    } finally {
      setSubmitting(false);
    }
  };

  const methods: Array<{ id: Method; label: string; icon: typeof CreditCard; hint: string }> = [
    { id: "PAYSTACK", label: "Paystack", icon: CreditCard, hint: "Instant · MoMo & cards" },
    { id: "MOMO", label: "MoMo transfer", icon: Smartphone, hint: "Manual · admin approval" },
  ];

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {methods.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMethod(m.id)}
            className={`rounded-xl border p-3 text-left transition ${
              method === m.id
                ? "border-brand-600 bg-brand-50/60 dark:border-brand-500 dark:bg-brand-500/10"
                : "border-slate-200 hover:border-slate-300 dark:border-white/10 dark:hover:border-white/20"
            }`}
          >
            <m.icon className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            <p className="mt-1.5 text-sm font-semibold">{m.label}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{m.hint}</p>
          </button>
        ))}
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

      {method === "MOMO" && (
        <div className="space-y-1.5">
          <Label htmlFor="reference">MoMo transaction reference</Label>
          <Input
            id="reference"
            placeholder="e.g. 1234567890"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </div>
      )}

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting && <Spinner />}{" "}
        {method === "PAYSTACK" ? "Pay with Paystack" : "Submit top-up request"}
      </Button>
      <p className="text-center text-xs text-slate-500 dark:text-slate-400">
        {method === "PAYSTACK"
          ? "You'll be redirected to Paystack to pay with Mobile Money or card. Your wallet is credited instantly on success."
          : "Send money to our MoMo number, then submit the reference here. Admin approves and your wallet is credited."}
      </p>
    </form>
  );
}
