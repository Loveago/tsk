"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/shared";
import { formatGHS } from "@/lib/types";
import { Copy, Check, Smartphone, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";

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

  // Form states
  const [reference, setReference] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [network, setNetwork] = React.useState("MTN");
  const [senderPhone, setSenderPhone] = React.useState("");
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
          if (d.settings.network) setNetwork(d.settings.network);
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

    const amt = Number(amount);
    if (!amt || amt <= 0) {
      setErrorMessage("Please enter a valid amount sent");
      return;
    }
    if (!reference.trim()) {
      setErrorMessage("Please enter the transaction reference / ID");
      return;
    }

    setClaiming(true);
    setClaimStatusText("Checking payment... Matching transaction...");

    try {
      const res = await fetch("/api/wallet/send-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionReference: reference.trim(),
          amount: amt,
          network,
          senderPhone: senderPhone.trim() || undefined,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setErrorMessage(
          json.error ??
            "We couldn't find a matching Mobile Money transaction. Make sure the transaction ID, network, and amount are correct."
        );
        return;
      }

      setClaimResult(json.claim);
      toast("Payment verified and credited!", "success");
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
                "Send money to the Mobile Money number below, then enter your transaction details to claim the funds."}
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
              {settings?.accountName ?? "Clickyfied"}
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
                ✓ Payment Verified
              </h4>
              <p className="text-xs text-emerald-700 dark:text-emerald-300">
                {formatGHS(claimResult.amount)} has been added to your Clickyfied wallet.
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-emerald-200 pt-3 text-xs sm:grid-cols-4 dark:border-emerald-500/20">
            <div>
              <span className="text-slate-500 dark:text-slate-400">Amount:</span>
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
              setAmount("");
              setSenderPhone("");
            }}
          >
            Claim Another Payment <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Claim Form */}
      {!claimResult && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-[#0d1526]">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
            After sending the money, enter the transaction details below.
          </h4>

          {errorMessage && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleClaim} className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="txRef">Transaction ID / Reference *</Label>
                <Input
                  id="txRef"
                  placeholder="e.g. 12345678901"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="font-mono text-sm uppercase"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="txAmount">Amount Sent (GHS) *</Label>
                <Input
                  id="txAmount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="e.g. 50.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="txNetwork">MoMo Network *</Label>
                <Select
                  id="txNetwork"
                  value={network}
                  onChange={(e) => setNetwork(e.target.value)}
                >
                  <option value="MTN">MTN</option>
                  <option value="TELECEL">Telecel</option>
                  <option value="AIRTELTIGO">AirtelTigo</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="senderPhone">Sender Phone Number (Optional)</Label>
                <Input
                  id="senderPhone"
                  placeholder="e.g. 0241234567"
                  value={senderPhone}
                  onChange={(e) => setSenderPhone(e.target.value)}
                />
              </div>
            </div>

            <Button type="submit" className="w-full sm:w-auto px-8" disabled={claiming}>
              {claiming ? (
                <>
                  <Spinner /> {claimStatusText || "Checking payment..."}
                </>
              ) : (
                "Claim Money"
              )}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

