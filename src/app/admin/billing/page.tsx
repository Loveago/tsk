"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeader, EmptyState, Spinner } from "@/components/shared";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { ExportButtons } from "@/components/admin/export-buttons";
import { Select, Label, Input } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { formatGHS, formatDateTime } from "@/lib/types";
import { IncomingMomoTable } from "@/components/admin/incoming-momo-table";
import { ClaimsTable } from "@/components/admin/claims-table";
import { MomoSettingsCard } from "@/components/admin/momo-settings-card";
import { ManualCreditDialog } from "@/components/admin/manual-credit-dialog";
import {
  Wallet,
  Check,
  X,
  Smartphone,
  Receipt,
  Settings,
  PlusCircle,
  RefreshCw,
  ArrowLeftRight,
  Search,
} from "lucide-react";

interface Tx {
  id: string;
  type: string;
  amount: number;
  status: string;
  reference: string | null;
  note: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string; balance: number };
}

type BillingTab = "transactions" | "incoming-momo" | "claims" | "settings";

export default function AdminBillingPage() {
  const { toast } = useToast();
  const [tab, setTab] = React.useState<BillingTab>("transactions");
  const [data, setData] = React.useState<Tx[]>([]);
  const [total, setTotal] = React.useState(0);
  const [pages, setPages] = React.useState(1);
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState("PENDING");
  const [type, setType] = React.useState("");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  // Manual Credit / Debit dialog state
  const [manualCreditOpen, setManualCreditOpen] = React.useState(false);
  const [selectedUserForCredit, setSelectedUserForCredit] = React.useState<{
    id: string;
    name: string;
    email: string;
    balance: number;
  } | null>(null);

  const openAdjustWallet = (
    targetUser?: { id: string; name: string; email: string; balance: number } | null
  ) => {
    setSelectedUserForCredit(targetUser ?? null);
    setManualCreditOpen(true);
  };

  const load = React.useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (status) params.set("status", status);
    if (type) params.set("type", type);
    if (searchQuery) params.set("q", searchQuery);
    const res = await fetch(`/api/admin/billing?${params}`);
    const json = await res.json();
    setData(json.data ?? []);
    setTotal(json.total ?? 0);
    setPages(json.pages ?? 1);
    setLoading(false);
  }, [page, status, type, searchQuery]);

  React.useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  // Read URL query tab
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab");
    if (tabParam === "momo" || tabParam === "incoming") setTab("incoming-momo");
    else if (tabParam === "claims") setTab("claims");
    else if (tabParam === "settings") setTab("settings");
  }, []);

  const decide = async (id: string, decision: "APPROVED" | "REJECTED") => {
    const note =
      decision === "REJECTED" ? prompt("Rejection reason (optional)") ?? undefined : undefined;
    setBusyId(id);
    try {
      const res = await fetch("/api/admin/billing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision, note }),
      });
      const json = await res.json();
      if (!res.ok) return toast(json.error ?? "Action failed", "error");
      toast(
        decision === "APPROVED" ? "Top-up approved — balance credited" : "Top-up rejected",
        decision === "APPROVED" ? "success" : "info"
      );
      load();
    } finally {
      setBusyId(null);
    }
  };

  const verifyPaystack = async (id: string, reference: string) => {
    setBusyId(id);
    try {
      const res = await fetch("/api/billing/paystack/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: id, reference }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? "Paystack check failed", "error");
        return;
      }
      if (json.settled) {
        toast("Top-up verified with Paystack and approved!", "success");
        load();
      } else {
        toast(json.reason ?? `Paystack status: ${json.status}`, "info");
      }
    } catch {
      toast("Failed to verify transaction with Paystack", "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing &amp; MoMo Management"
        description="Monitor wallet transactions, incoming Mobile Money SMS, user claims, and top-up settings"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => openAdjustWallet(null)}
              className="bg-brand-600 hover:bg-brand-700 text-white shadow-xs cursor-pointer"
            >
              <ArrowLeftRight className="h-4 w-4" /> Credit / Debit Wallet
            </Button>
            {tab === "transactions" && (
              <ExportButtons type="transactions" params={status ? `status=${status}` : ""} />
            )}
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-white/10 text-sm font-medium gap-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setTab("transactions")}
          className={`flex items-center gap-2 pb-3 px-3 transition-colors border-b-2 font-semibold whitespace-nowrap ${
            tab === "transactions"
              ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <Receipt className="h-4 w-4" /> Transactions
        </button>
        <button
          type="button"
          onClick={() => setTab("incoming-momo")}
          className={`flex items-center gap-2 pb-3 px-3 transition-colors border-b-2 font-semibold whitespace-nowrap ${
            tab === "incoming-momo"
              ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <Smartphone className="h-4 w-4" /> Incoming MoMo
        </button>
        <button
          type="button"
          onClick={() => setTab("claims")}
          className={`flex items-center gap-2 pb-3 px-3 transition-colors border-b-2 font-semibold whitespace-nowrap ${
            tab === "claims"
              ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <Check className="h-4 w-4" /> User Claims
        </button>
        <button
          type="button"
          onClick={() => setTab("settings")}
          className={`flex items-center gap-2 pb-3 px-3 transition-colors border-b-2 font-semibold whitespace-nowrap ${
            tab === "settings"
              ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <Settings className="h-4 w-4" /> Send &amp; Claim Settings
        </button>
      </div>

      {/* Tab 1: Ledger Transactions */}
      {tab === "transactions" && (
        <div className="space-y-4">
          {/* Quick User Wallet Action Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50/70 via-white to-emerald-50/50 p-4 dark:border-brand-500/20 dark:from-brand-950/30 dark:via-slate-900 dark:to-emerald-950/20">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-brand-600/10 p-2.5 text-brand-600 dark:bg-brand-400/10 dark:text-brand-400 shrink-0">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  User Wallet Management
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Search any user by name or email to inspect balance, credit deposits, or deduct funds.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link
                href="/admin/wallets"
                className="inline-flex items-center rounded-xl border border-brand-200 bg-white px-3 py-2 text-xs font-semibold text-brand-700 shadow-xs hover:bg-brand-50 dark:border-brand-500/30 dark:bg-slate-800 dark:text-brand-300 dark:hover:bg-slate-700 transition"
              >
                <Wallet className="h-3.5 w-3.5 mr-1.5 text-brand-600 dark:text-brand-400" />
                Open User Wallets Hub
              </Link>
              <Button
                type="button"
                onClick={() => openAdjustWallet(null)}
                className="bg-brand-600 hover:bg-brand-700 text-white shrink-0 text-xs h-9 shadow-xs cursor-pointer"
              >
                <Search className="h-3.5 w-3.5 mr-1.5" />
                Adjust Balance
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="w-44 space-y-1.5">
              <Label>Filter by status</Label>
              <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
                <option value="PENDING">Pending approval</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="">All Statuses</option>
              </Select>
            </div>

            <div className="w-52 space-y-1.5">
              <Label>Transaction type</Label>
              <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
                <option value="">All Types</option>
                <option value="SIGNUP_FEE">Registration Fees (SIGNUP_FEE)</option>
                <option value="TOPUP">Top-ups (TOPUP)</option>
                <option value="DEBIT">Debits (DEBIT)</option>
                <option value="ADJUSTMENT">Adjustments (ADJUSTMENT)</option>
                <option value="REFUND">Refunds (REFUND)</option>
              </Select>
            </div>

            <div className="w-72 space-y-1.5">
              <Label>Search reference / user</Label>
              <Input
                placeholder="Search reference (REG-…), user name, email"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                className="h-10 text-xs"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
            {loading ? (
              <div className="flex justify-center py-12">
                <Spinner className="h-6 w-6 text-brand-600" />
              </div>
            ) : data.length === 0 ? (
              <EmptyState icon={Wallet} title="Nothing here" description="No transactions match this filter." />
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex flex-wrap items-center gap-3 px-4 py-4 text-sm sm:px-5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{formatGHS(tx.amount)}</p>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {tx.type}
                        </span>
                        <StatusBadge status={tx.status} />
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="truncate">
                          {tx.user.name} · {tx.user.email} · balance{" "}
                          <span className="font-semibold text-slate-700 dark:text-slate-200">
                            {formatGHS(tx.user.balance)}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => openAdjustWallet(tx.user)}
                          className="inline-flex items-center gap-1 rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-medium text-brand-700 hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-400 dark:hover:bg-brand-500/20 cursor-pointer transition"
                          title={`Credit or debit ${tx.user.name}'s wallet`}
                        >
                          <ArrowLeftRight className="h-3 w-3" /> Adjust wallet
                        </button>
                      </div>
                      {tx.reference && (
                        <p className="text-xs text-slate-400">Ref: {tx.reference}</p>
                      )}
                      {tx.note && (
                        <p className="text-xs text-slate-400">Note: {tx.note}</p>
                      )}
                      <p className="text-xs text-slate-400">{formatDateTime(tx.createdAt)}</p>
                    </div>
                    {tx.status === "PENDING" && (
                      <div className="flex flex-wrap gap-2">
                        {tx.reference?.startsWith("PSK-") && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === tx.id}
                            onClick={() => verifyPaystack(tx.id, tx.reference!)}
                            className="border-brand-500/40 text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/10"
                          >
                            <RefreshCw className="h-3.5 w-3.5" /> Verify Paystack
                          </Button>
                        )}
                        <Button
                          size="sm"
                          disabled={busyId === tx.id}
                          onClick={() => decide(tx.id, "APPROVED")}
                        >
                          <Check className="h-3.5 w-3.5" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === tx.id}
                          onClick={() => decide(tx.id, "REJECTED")}
                        >
                          <X className="h-3.5 w-3.5" /> Reject
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {pages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm dark:border-slate-800">
                <span className="text-slate-500">Page {page} of {pages}</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Incoming MoMo */}
      {tab === "incoming-momo" && (
        <IncomingMomoTable />
      )}

      {/* Tab 3: Claims */}
      {tab === "claims" && (
        <ClaimsTable />
      )}

      {/* Tab 4: Send & Claim Settings */}
      {tab === "settings" && (
        <MomoSettingsCard />
      )}

      {/* Manual Credit / Debit Dialog */}
      {manualCreditOpen && (
        <ManualCreditDialog
          open={manualCreditOpen}
          onClose={() => {
            setManualCreditOpen(false);
            setSelectedUserForCredit(null);
          }}
          user={selectedUserForCredit}
          onCredited={load}
          onAdjusted={load}
        />
      )}
    </div>
  );
}
