"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/shared";
import { formatGHS } from "@/lib/types";
import { Copy, Check, Smartphone, CheckCircle2, AlertCircle, ArrowRight, Hash } from "lucide-react";

interface SendClaimSettings {
  enabled: boolean;
  network: string;
  momoNumber: string;
  accountName: string;
  instructions: string | null;
  minimumAmount: number;
  maximumAmount: number;
}

interface ClaimResult {
  amount: number;
  network: string;
  transactionReference: string;
  newBalance: number;
  creditedAt: string;
}

export function SendClaimCard({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [settings, setSettings] = React.useState<SendClaimSettings | null>(null);
  const [loadingSettings, setLoadingSettings] = React.useState(true);
  const [copied, setCopied] = React.useState(false);

  // Form state: only Transaction ID is needed
  const [reference, setReference] = React.useState("");
  const [claiming, setClaiming] = React.useState(false);
  const [claimStatusText, setClaimStatusText] = React.useState<string | null>(null);
  const [claimResult, setClaimResult] = React.useState<ClaimResult | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/wallet/send-claim/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.settings) {
          setSettings(d.settings);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingSettings(false));
  }, []);

  const copyNumber = () => {
    if (!settings?.momoNumber) return;
    navigator.clipboard.writeText(settings.momoNumber);
    setCopied(true);
    toast("MoMo number copied to clipboard", "success");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setClaimResult(null);

    const cleanRef = reference.trim();
    if (!cleanRef) {
      setErrorMessage("Please enter the Transaction ID from your MoMo SMS");
      return;
    }

    setClaiming(true);
    setClaimStatusText("Verifying Transaction ID... Crediting wallet...");

    try {
      const res = await fetch("/api/wallet/send-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionReference: cleanRef,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setErrorMessage(
          json.error ??
            "We couldn't find a matching Mobile Money transaction with this Transaction ID. Please verify the ID from your confirmation SMS."
        );
        return;
      }

      setClaimResult(json.claim);
      toast("Payment verified and credited to wallet!", "success");
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("balance-update", { detail: { balance: json.claim?.newBalance } })
        );
      }
      onSuccess();
    } catch {
      setErrorMessage("An unexpected error occurred while claiming. Please try again.");
    } finally {
      setClaiming(false);
      setClaimStatusText(null);
    }
  };

  if (loadingSettings) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="h-6 w-6 text-brand-600" />
      </div>
    );
  }

  if (settings && !settings.enabled) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-500/20 dark:bg-amber-500/10">
        <AlertCircle className="mx-auto h-8 w-8 text-amber-600 dark:text-amber-400" />
        <h3 className="mt-2 text-base font-semibold text-amber-900 dark:text-amber-200">
          Send &amp; Claim is currently unavailable
        </h3>
        <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
          Mobile Money Send &amp; Claim is temporarily disabled by the administrator. Please use Paystack or contact support.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Instructions and Admin MoMo Details Card */}
      <div className="overflow-hidden rounded-2xl border border-brand-200 bg-gradient-to-br from-blue-50/50 via-indigo-50/30 to-white p-5 shadow-sm dark:border-brand-500/20 dark:bg-gradient-to-br dark:from-brand-950/40 dark:via-[#0d1526] dark:to-[#0d1526]">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-brand-600 p-2 text-white shadow-md shadow-brand-500/20">
            <Smartphone className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">SEND &amp; CLAIM</h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {settings?.instructions ||
                "Send money to the Mobile Money number below, then enter your Transaction ID below to instantly claim your funds."}
            </p>
          </div>
        </div>

        {/* Display MoMo Account details */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200/80 bg-white/80 p-3 backdrop-blur dark:border-white/5 dark:bg-white/5">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              MoMo Network
            </span>
            <p className="mt-0.5 text-sm font-bold text-slate-800 dark:text-slate-100">
              {settings?.network ?? "MTN"} MoMo
            </p>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white/80 p-3 backdrop-blur dark:border-white/5 dark:bg-white/5">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Account Name
            </span>
            <p className="mt-0.5 text-sm font-bold text-slate-800 dark:text-slate-100">
              {settings?.accountName ?? "Tskconnect"}
            </p>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-brand-300 bg-brand-50/80 p-3 backdrop-blur dark:border-brand-500/30 dark:bg-brand-500/10">
            <div>
              <span className="text-[11px] font-medium text-brand-700 dark:text-brand-300 uppercase tracking-wider">
                MoMo Number
              </span>
              <p className="font-mono text-base font-extrabold text-brand-900 dark:text-brand-200">
                {settings?.momoNumber ?? "024XXXXXXX"}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={copyNumber}
              className="border-brand-300 bg-white hover:bg-brand-50 text-brand-700 dark:border-brand-500/40 dark:bg-slate-900 dark:text-brand-300"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>

        {settings && (
          <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
            Minimum: {formatGHS(settings.minimumAmount)} · Maximum: {formatGHS(settings.maximumAmount)}
          </p>
        )}
      </div>

      {/* Verified Success Result Card */}
      {claimResult && (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50/80 p-5 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-emerald-600 p-2 text-white">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-base font-bold text-emerald-900 dark:text-emerald-200">
                ✓ Payment Verified &amp; Credited
              </h4>
              <p className="text-xs text-emerald-700 dark:text-emerald-300">
                {formatGHS(claimResult.amount)} has been added to your Tskconnect wallet.
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-emerald-200 pt-3 text-xs sm:grid-cols-4 dark:border-emerald-500/20">
            <div>
              <span className="text-slate-500 dark:text-slate-400">Amount Credited:</span>
              <p className="font-bold text-emerald-700 dark:text-emerald-300">{formatGHS(claimResult.amount)}</p>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">Network:</span>
              <p className="font-semibold text-slate-800 dark:text-slate-100">{claimResult.network}</p>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">Transaction ID:</span>
              <p className="font-mono font-semibold text-slate-800 dark:text-slate-100">{claimResult.transactionReference}</p>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">New Balance:</span>
              <p className="font-bold text-slate-900 dark:text-white">{formatGHS(claimResult.newBalance)}</p>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4 border-emerald-300 text-emerald-800 dark:border-emerald-500/40 dark:text-emerald-200"
            onClick={() => {
              setClaimResult(null);
              setReference("");
            }}
          >
            Claim Another Payment <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      )}

      {/* Claim Form: ONLY Transaction ID */}
      {!claimResult && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-white/5 dark:bg-[#0d1526]">
          <div className="flex items-center gap-2 mb-1">
            <Hash className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
              Claim Payment with Transaction ID
            </h4>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            After sending money, find the <strong>Transaction ID</strong> from your Mobile Money SMS receipt (e.g. <code>87441563372</code>) and paste it below. The amount and network are automatically verified.
          </p>

          {errorMessage && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleClaim} className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="txRef" className="text-xs font-semibold">
                Transaction ID *
              </Label>
              <div className="relative">
                <Input
                  id="txRef"
                  placeholder="e.g. 87441563372"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="font-mono text-base tracking-wider uppercase h-11 pr-4"
                  required
                  autoFocus
                />
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Enter only the transaction reference or ID from the confirmation message.
              </p>
            </div>

            <Button
              type="submit"
              className="w-full sm:w-auto px-8 h-10 font-semibold"
              disabled={claiming || !reference.trim()}
            >
              {claiming ? (
                <>
                  <Spinner className="mr-2" /> {claimStatusText || "Checking payment..."}
                </>
              ) : (
                "Claim Payment"
              )}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
