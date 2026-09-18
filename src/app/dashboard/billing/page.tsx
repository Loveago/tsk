"use client";

import * as React from "react";
import { PageHeader, EmptyState, Spinner } from "@/components/shared";
import { StatCard } from "@/components/shared";
import { TopupForm } from "@/components/billing/topup-form";
import { SendClaimCard } from "@/components/billing/send-claim-card";
import { ClaimHistory } from "@/components/billing/claim-history";
import { useToast } from "@/components/toast";
import { formatGHS, formatDateTime } from "@/lib/types";
import { Wallet, ArrowDownLeft, ArrowUpRight, Receipt, Smartphone, History } from "lucide-react";

interface Tx {
  id: string;
  type: string;
  amount: number;
  status: string;
  reference: string | null;
  note: string | null;
  createdAt: string;
}

function txBadge(status: string) {
  const styles: Record<string, string> = {
    PENDING: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
    APPROVED: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
    REJECTED: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${styles[status] ?? ""}`}>
      {status}
    </span>
  );
}

type Tab = "overview" | "send-claim" | "claim-history";

export default function BillingPage() {
  const { toast } = useToast();
  const [tab, setTab] = React.useState<Tab>("overview");
  const [data, setData] = React.useState<Tx[]>([]);
  const [balance, setBalance] = React.useState(0);
  const [summary, setSummary] = React.useState({ topups: 0, spend: 0 });
  const [sendClaimEnabled, setSendClaimEnabled] = React.useState(true);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    const res = await fetch("/api/billing?pageSize=25");
    const json = await res.json();
    setData(json.data ?? []);
    setBalance(json.balance ?? 0);
    setSummary(json.summary ?? { topups: 0, spend: 0 });
    if (json.sendClaimEnabled !== undefined) {
      setSendClaimEnabled(json.sendClaimEnabled);
      if (!json.sendClaimEnabled && (tab === "send-claim" || tab === "claim-history")) {
        setTab("overview");
      }
    }
    setLoading(false);
  }, [tab]);

  React.useEffect(() => {
    load();
  }, [load]);

  // URL tab query param synchronization
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab");
    if (tabParam === "send-claim" && sendClaimEnabled) setTab("send-claim");
    else if ((tabParam === "history" || tabParam === "claims") && sendClaimEnabled) setTab("claim-history");
  }, [sendClaimEnabled]);

  // Paystack redirect-back result
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paystack = params.get("paystack");
    if (!paystack) return;
    if (paystack === "success") {
      toast("Paystack payment successful — your wallet has been credited", "success");
    } else {
      toast("Paystack payment was not completed. If you were debited, contact support.", "error");
    }
    window.history.replaceState(null, "", window.location.pathname);
  }, [toast]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing"
        description={
          sendClaimEnabled
            ? "Your wallet balance, Send & Claim, and transactions"
            : "Your wallet balance and transaction history"
        }
      />

      {/* Balance Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard title="Current Balance" value={formatGHS(balance)} icon={Wallet} />
        <StatCard title="Total Top-ups" value={formatGHS(summary.topups)} icon={ArrowDownLeft} />
        <StatCard title="Total Spending" value={formatGHS(summary.spend)} icon={ArrowUpRight} />
      </div>

      {/* Tab Navigation — scrollable on mobile */}
      <div className="overflow-x-auto">
        <div className="flex min-w-max border-b border-slate-200 dark:border-white/10 text-sm font-medium gap-1">
          <button
            type="button"
            onClick={() => setTab("overview")}
            className={`flex items-center gap-1.5 whitespace-nowrap pb-3 px-3 transition-colors border-b-2 font-semibold ${
              tab === "overview"
                ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <Wallet className="h-3.5 w-3.5 shrink-0" />
            <span>Wallet & Top-up</span>
          </button>
          {sendClaimEnabled && (
            <>
              <button
                type="button"
                onClick={() => setTab("send-claim")}
                className={`flex items-center gap-1.5 whitespace-nowrap pb-3 px-3 transition-colors border-b-2 font-semibold ${
                  tab === "send-claim"
                    ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <Smartphone className="h-3.5 w-3.5 shrink-0" />
                <span>Send & Claim</span>
              </button>
              <button
                type="button"
                onClick={() => setTab("claim-history")}
                className={`flex items-center gap-1.5 whitespace-nowrap pb-3 px-3 transition-colors border-b-2 font-semibold ${
                  tab === "claim-history"
                    ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <History className="h-3.5 w-3.5 shrink-0" />
                <span>Claim History</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tab 1: Overview & Instant Top-up */}
      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-[#0d1526]">
            <h2 className="text-sm font-semibold">Request a top-up</h2>
            <div className="mt-4">
              <TopupForm onSuccess={load} />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/70 bg-white shadow-sm dark:border-white/5 dark:bg-[#0d1526] lg:col-span-2">
            <div className="border-b border-slate-100 px-5 py-4 dark:border-white/5">
              <h2 className="text-sm font-semibold">Wallet Ledger Transactions</h2>
            </div>
            {loading ? (
              <div className="flex justify-center py-12">
                <Spinner className="h-6 w-6 text-brand-600" />
              </div>
            ) : data.length === 0 ? (
              <EmptyState icon={Receipt} title="No transactions yet" description="Top up to get started." />
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-white/5">
                {data.map((t) => (
                  <div key={t.id} className="flex items-start gap-3 px-4 py-3 text-sm sm:items-center sm:px-5">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        t.type === "TOPUP"
                          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                          : "bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400"
                      }`}
                    >
                      {t.type === "TOPUP" ? (
                        <ArrowDownLeft className="h-4 w-4" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{t.type}</p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {formatDateTime(t.createdAt)}
                        {t.reference ? ` · ref ${t.reference}` : ""}
                        {t.note ? ` · ${t.note}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold">{formatGHS(t.amount)}</p>
                      {txBadge(t.status)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Send & Claim */}
      {tab === "send-claim" && (
        <SendClaimCard onSuccess={load} />
      )}

      {/* Tab 3: Claim History */}
      {tab === "claim-history" && (
        <ClaimHistory />
      )}
    </div>
  );
}
