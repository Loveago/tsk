"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Banknote,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Copy,
  Check,
  AlertCircle,
  Filter,
  RefreshCw,
  ExternalLink,
  Store,
  DollarSign,
  ArrowDownToLine,
  Phone,
  User,
} from "lucide-react";
import { EmptyState, Spinner } from "@/components/shared";

export interface WithdrawalItem {
  id: string;
  seq: number;
  reference: string;
  userId: string;
  userName: string;
  userEmail: string;
  storefrontSlug: string | null;
  storefrontName: string | null;
  storefrontStatus: string | null;
  amount: number; // pesewas
  fee: number; // pesewas
  netAmount: number; // pesewas
  amountGHS: number;
  feeGHS: number;
  netAmountGHS: number;
  network: string;
  momoNumber: string;
  accountName: string;
  status: string;
  note: string | null;
  adminNote: string | null;
  processedBy: string | null;
  requestedAt: string;
  processedAt: string | null;
}

export interface WithdrawalStats {
  pendingCount: number;
  pendingAmountGHS: number;
  pendingNetAmountGHS: number;
  approvedCount: number;
  approvedAmountGHS: number;
  approvedNetAmountGHS: number;
  rejectedCount: number;
  totalFeeCollectedGHS: number;
}

const NETWORK_BADGES: Record<string, string> = {
  MTN: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
  TELECEL: "bg-red-100 text-red-900 border-red-300 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",
  AIRTELTIGO: "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30",
};

export function AdminWithdrawalsView({
  initialWithdrawals,
  initialStats,
}: {
  initialWithdrawals: WithdrawalItem[];
  initialStats: WithdrawalStats;
}) {
  const router = useRouter();
  const [withdrawals, setWithdrawals] = React.useState<WithdrawalItem[]>(initialWithdrawals);
  const [stats, setStats] = React.useState<WithdrawalStats>(initialStats);
  const [loading, setLoading] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("ALL");
  const [networkFilter, setNetworkFilter] = React.useState<string>("ALL");
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [totalCount, setTotalCount] = React.useState(initialWithdrawals.length);

  // Modal states for action
  const [selectedWithdrawal, setSelectedWithdrawal] = React.useState<WithdrawalItem | null>(null);
  const [actionType, setActionType] = React.useState<"APPROVE" | "REJECT" | null>(null);
  const [actionNote, setActionNote] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [feedbackMsg, setFeedbackMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Copy tracking
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  }

  const fetchWithdrawals = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (networkFilter !== "ALL") params.set("network", networkFilter);
      if (search) params.set("search", search);
      params.set("page", String(page));
      params.set("pageSize", "20");

      const res = await fetch(`/api/admin/storefront-withdrawals?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setWithdrawals(data.withdrawals || []);
        if (data.stats) setStats(data.stats);
        if (data.pagination) {
          setTotalPages(data.pagination.totalPages || 1);
          setTotalCount(data.pagination.total || 0);
        }
      }
    } catch (err) {
      console.error("Failed to load storefront withdrawals:", err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, networkFilter, search, page]);

  // Reset page to 1 when filters or search change
  React.useEffect(() => {
    setPage(1);
  }, [statusFilter, networkFilter, search]);

  React.useEffect(() => {
    fetchWithdrawals();
  }, [fetchWithdrawals]);

  async function handleReviewSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedWithdrawal || !actionType) return;
    setSubmitting(true);
    setFeedbackMsg(null);

    try {
      const res = await fetch("/api/admin/storefront-withdrawals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedWithdrawal.id,
          action: actionType,
          adminNote: actionNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to ${actionType.toLowerCase()} withdrawal`);

      setFeedbackMsg({
        kind: "ok",
        text: `Withdrawal ${selectedWithdrawal.reference} successfully ${
          actionType === "APPROVE" ? "approved & debited" : "rejected"
        }!`,
      });
      setSelectedWithdrawal(null);
      setActionType(null);
      setActionNote("");

      // Trigger global badge update
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("nav-counts-update"));
      }

      await fetchWithdrawals();
      router.refresh();
    } catch (err: any) {
      setFeedbackMsg({ kind: "err", text: err?.message || "An error occurred" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Alert Banner when pending withdrawals exist */}
      {stats.pendingCount > 0 && (
        <div className="relative overflow-hidden rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-200 text-amber-900 dark:bg-amber-500/20 dark:text-amber-300">
                <AlertCircle className="h-5 w-5 animate-pulse" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                  {stats.pendingCount} Pending Storefront Withdrawal{stats.pendingCount === 1 ? "" : "s"} Awaiting Payout
                </h3>
                <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
                  Total payout to disburse: <span className="font-semibold text-amber-900 dark:text-amber-100">GHS {stats.pendingNetAmountGHS.toFixed(2)}</span> (after GHS 1.00 fee deduction per withdrawal).
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setStatusFilter("PENDING");
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow hover:bg-amber-500 transition-colors"
            >
              Filter Pending ({stats.pendingCount})
            </button>
          </div>
        </div>
      )}

      {/* Feedback Toast */}
      {feedbackMsg && (
        <div
          className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm ${
            feedbackMsg.kind === "ok"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20"
              : "bg-red-50 text-red-800 border border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/20"
          }`}
        >
          <span>{feedbackMsg.text}</span>
          <button
            onClick={() => setFeedbackMsg(null)}
            className="text-xs font-bold uppercase hover:opacity-75"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm dark:border-amber-500/20 dark:bg-[#0d1526]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-amber-700 dark:text-amber-400">Pending Requests</span>
            <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <p className="mt-2 text-2xl font-black text-amber-700 dark:text-amber-400">{stats.pendingCount}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Net payout: GHS {stats.pendingNetAmountGHS.toFixed(2)}
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm dark:border-emerald-500/20 dark:bg-[#0d1526]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-400">Paid Out</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="mt-2 text-2xl font-black text-emerald-700 dark:text-emerald-400">{stats.approvedCount}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Disbursed: GHS {stats.approvedNetAmountGHS.toFixed(2)}
          </p>
        </div>

        <div className="rounded-2xl border border-violet-200 bg-white p-4 shadow-sm dark:border-violet-500/20 dark:bg-[#0d1526]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-violet-700 dark:text-violet-400">Platform Fees (GHS 1/wd)</span>
            <DollarSign className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          </div>
          <p className="mt-2 text-2xl font-black text-violet-700 dark:text-violet-400">
            GHS {stats.totalFeeCollectedGHS.toFixed(2)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Earned from completed payouts</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#0d1526]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-500">Rejected Requests</span>
            <XCircle className="h-4 w-4 text-slate-400" />
          </div>
          <p className="mt-2 text-2xl font-black text-slate-800 dark:text-slate-200">{stats.rejectedCount}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Rejected or cancelled</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#0d1526]">
        {/* Status Filters */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(["ALL", "PENDING", "APPROVED", "REJECTED"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === s
                  ? s === "PENDING"
                    ? "bg-amber-600 text-white"
                    : s === "APPROVED"
                    ? "bg-emerald-600 text-white"
                    : s === "REJECTED"
                    ? "bg-red-600 text-white"
                    : "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {s === "ALL" ? "All Requests" : s}
              {s === "PENDING" && stats.pendingCount > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-200 px-1.5 py-0.2 text-[10px] font-bold text-amber-900">
                  {stats.pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search and Network Filter */}
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          <select
            value={networkFilter}
            onChange={(e) => setNetworkFilter(e.target.value)}
            className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            <option value="ALL">All Networks</option>
            <option value="MTN">MTN MoMo</option>
            <option value="TELECEL">Telecel Cash</option>
            <option value="AIRTELTIGO">AirtelTigo Money</option>
          </select>

          <div className="relative min-w-48 flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search user, MoMo, ref..."
              className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
            />
          </div>

          <button
            type="button"
            onClick={() => fetchWithdrawals()}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            title="Refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#0d1526]">
        {loading && withdrawals.length === 0 ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-6 w-6 text-brand-600" />
          </div>
        ) : withdrawals.length === 0 ? (
          <EmptyState
            icon={Banknote}
            title="No withdrawals found"
            description={
              statusFilter !== "ALL" || search
                ? "No withdrawal requests match your search or filters."
                : "Reseller withdrawal requests will appear here when submitted."
            }
          />
        ) : (
          <div>
            {/* Mobile Cards View (md:hidden) */}
            <div className="divide-y divide-slate-100 dark:divide-slate-800/60 md:hidden">
              {withdrawals.map((w) => {
                const netGHSStr = w.netAmountGHS.toFixed(2);
                const isPending = w.status === "PENDING";
                const isApproved = w.status === "APPROVED";
                const isRejected = w.status === "REJECTED";

                return (
                  <div key={w.id} className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-mono font-bold text-xs text-slate-900 dark:text-white">
                        <span>{w.reference}</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(w.reference, `ref-${w.id}`)}
                          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          {copiedKey === `ref-${w.id}` ? (
                            <Check className="h-3 w-3 text-emerald-500" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          isApproved
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                            : isRejected
                            ? "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300"
                            : "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-300"
                        }`}
                      >
                        {isPending && <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping" />}
                        {w.status}
                      </span>
                    </div>

                    <div className="text-xs">
                      <p className="font-semibold text-slate-900 dark:text-white">{w.userName}</p>
                      <p className="text-[11px] text-slate-400">{w.userEmail}</p>
                      {w.storefrontSlug && (
                        <span className="mt-1 inline-block rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                          /store/{w.storefrontSlug}
                        </span>
                      )}
                      <p className="text-[10px] text-slate-400 mt-1">
                        {new Date(w.requestedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-white/[0.02] space-y-1.5 text-xs">
                      <div className="flex justify-between text-slate-500">
                        <span>Gross Requested:</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">GHS {w.amountGHS.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>Platform Fee:</span>
                        <span className="font-semibold text-red-500">- GHS {w.feeGHS.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between pt-1.5 border-t border-slate-200 dark:border-slate-800">
                        <span className="font-bold text-slate-900 dark:text-white">Net Payout to Send:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-black text-sm text-emerald-600 dark:text-emerald-400">
                            GHS {netGHSStr}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(netGHSStr, `net-${w.id}`)}
                            title="Copy exact net amount for MoMo transfer"
                            className="rounded bg-emerald-100 p-1 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300"
                          >
                            {copiedKey === `net-${w.id}` ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${NETWORK_BADGES[w.network] || "bg-slate-100"}`}>
                          {w.network}
                        </span>
                        <span className="font-mono font-bold text-slate-900 dark:text-white">{w.momoNumber}</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(w.momoNumber, `momo-${w.id}`)}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          {copiedKey === `momo-${w.id}` ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                        </button>
                      </div>
                      <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">{w.accountName}</span>
                    </div>

                    {w.adminNote && (
                      <p className="text-[11px] text-slate-500 italic dark:text-slate-400">{w.adminNote}</p>
                    )}

                    {isPending && (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedWithdrawal(w);
                            setActionType("APPROVE");
                            setActionNote("");
                          }}
                          className="flex-1 rounded-xl bg-emerald-600 py-2 text-center text-xs font-semibold text-white shadow hover:bg-emerald-500"
                        >
                          Approve &amp; Pay
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedWithdrawal(w);
                            setActionType("REJECT");
                            setActionNote("");
                          }}
                          className="rounded-xl bg-red-600 px-4 py-2 text-center text-xs font-semibold text-white shadow hover:bg-red-500"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View (hidden md:block) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-white/5 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Reference / Date</th>
                    <th className="px-4 py-3">Reseller</th>
                    <th className="px-4 py-3">Gross Requested</th>
                    <th className="px-4 py-3">Fee</th>
                    <th className="px-4 py-3">Net Payout to Send</th>
                    <th className="px-4 py-3">MoMo Recipient</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {withdrawals.map((w) => {
                    const netGHSStr = w.netAmountGHS.toFixed(2);
                    const isPending = w.status === "PENDING";
                    const isApproved = w.status === "APPROVED";
                    const isRejected = w.status === "REJECTED";

                    return (
                      <tr
                        key={w.id}
                        className={`transition-colors hover:bg-slate-50/70 dark:hover:bg-white/[0.02] ${
                          isPending ? "bg-amber-50/30 dark:bg-amber-500/[0.02]" : ""
                        }`}
                      >
                        {/* Ref & Date */}
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-center gap-1.5 font-mono font-bold text-slate-900 dark:text-white">
                            <span>{w.reference}</span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(w.reference, `ref-${w.id}`)}
                              title="Copy reference"
                              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            >
                              {copiedKey === `ref-${w.id}` ? (
                                <Check className="h-3 w-3 text-emerald-500" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                          <p className="mt-0.5 text-[11px] text-slate-400">
                            {new Date(w.requestedAt).toLocaleString("en-GB", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </p>
                        </td>

                        {/* Reseller Info */}
                        <td className="px-4 py-3 align-top">
                          <p className="font-semibold text-slate-900 dark:text-white">{w.userName}</p>
                          <p className="text-[11px] text-slate-400">{w.userEmail}</p>
                          {w.storefrontSlug && (
                            <div className="mt-1 flex items-center gap-1">
                              <span className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                                /store/{w.storefrontSlug}
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Gross Amount */}
                        <td className="px-4 py-3 align-top">
                          <span className="font-medium text-slate-600 dark:text-slate-300">
                            GHS {w.amountGHS.toFixed(2)}
                          </span>
                        </td>

                        {/* Fee */}
                        <td className="px-4 py-3 align-top">
                          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300">
                            - GHS {w.feeGHS.toFixed(2)}
                          </span>
                        </td>

                        {/* Net Payout */}
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                              GHS {netGHSStr}
                            </span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(netGHSStr, `net-${w.id}`)}
                              title="Copy exact net amount for MoMo transfer"
                              className="rounded bg-emerald-100 p-1 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:hover:bg-emerald-500/30"
                            >
                              {copiedKey === `net-${w.id}` ? (
                                <Check className="h-3 w-3 text-emerald-600" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                          <p className="text-[10px] text-slate-400">Exact transfer amount</p>
                        </td>

                        {/* MoMo Recipient */}
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${
                                NETWORK_BADGES[w.network] || "bg-slate-100 text-slate-800"
                              }`}
                            >
                              {w.network}
                            </span>
                            <span className="font-mono font-bold text-slate-900 dark:text-white">
                              {w.momoNumber}
                            </span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(w.momoNumber, `momo-${w.id}`)}
                              title="Copy MoMo number"
                              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            >
                              {copiedKey === `momo-${w.id}` ? (
                                <Check className="h-3 w-3 text-emerald-500" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                          <p className="mt-0.5 font-medium text-slate-700 dark:text-slate-300">
                            {w.accountName}
                          </p>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3 align-top">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                              isApproved
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                                : isRejected
                                ? "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300"
                                : "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-300"
                            }`}
                          >
                            {isPending && <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping" />}
                            {w.status}
                          </span>

                          {w.adminNote && (
                            <p className="mt-1 max-w-xs text-[11px] text-slate-500 dark:text-slate-400 italic">
                              {w.adminNote}
                            </p>
                          )}
                          {w.processedBy && (
                            <p className="mt-0.5 text-[10px] text-slate-400">
                              by {w.processedBy}
                              {w.processedAt && ` · ${new Date(w.processedAt).toLocaleDateString("en-GB")}`}
                            </p>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 align-top text-right">
                          {isPending ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                 setSelectedWithdrawal(w);
                                 setActionType("APPROVE");
                                 setActionNote("");
                                }}
                                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 transition-colors"
                              >
                                Approve &amp; Pay
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedWithdrawal(w);
                                  setActionType("REJECT");
                                  setActionNote("");
                                }}
                                className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-red-500 transition-colors"
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-4 dark:border-slate-800 text-xs">
                <span className="text-slate-500 dark:text-slate-400">
                  Page {page} of {totalPages} ({totalCount} total)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages || loading}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirmation & Note Modal */}
      {selectedWithdrawal && actionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#0d1526]">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {actionType === "APPROVE" ? "Confirm Payout Approval" : "Reject Withdrawal Request"}
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Reference: <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{selectedWithdrawal.reference}</span>
            </p>

            {actionType === "APPROVE" ? (
              <div className="mt-4 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 text-xs dark:border-emerald-500/20 dark:bg-emerald-500/5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Reseller:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedWithdrawal.userName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Destination:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedWithdrawal.network} · {selectedWithdrawal.momoNumber} ({selectedWithdrawal.accountName})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Gross Debited from Wallet:</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">GHS {selectedWithdrawal.amountGHS.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Platform Fee Retained:</span>
                  <span className="font-semibold text-red-500">- GHS {selectedWithdrawal.feeGHS.toFixed(2)}</span>
                </div>
                <div className="border-t border-emerald-200 pt-2 dark:border-emerald-500/20 flex justify-between text-sm font-black text-emerald-700 dark:text-emerald-300">
                  <span>Transfer to Reseller MoMo:</span>
                  <span>GHS {selectedWithdrawal.netAmountGHS.toFixed(2)}</span>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50/50 p-3.5 text-xs text-red-800 dark:border-red-500/20 dark:bg-red-500/5 dark:text-red-300">
                Rejecting will keep the funds in the reseller's wallet balance. You can provide a reason below.
              </div>
            )}

            <form onSubmit={handleReviewSubmit} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {actionType === "APPROVE" ? "Admin Note / Payment Reference (Optional)" : "Reason for Rejection"}
                </label>
                <input
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                  placeholder={
                    actionType === "APPROVE"
                      ? "e.g. Paid via MTN MoMo terminal, Trans ID: 12345"
                      : "e.g. Invalid account name or wrong MoMo number"
                  }
                  required={actionType === "REJECT"}
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setSelectedWithdrawal(null);
                    setActionType(null);
                  }}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={`rounded-xl px-5 py-2 text-xs font-semibold text-white shadow transition-colors ${
                    actionType === "APPROVE"
                      ? "bg-emerald-600 hover:bg-emerald-500"
                      : "bg-red-600 hover:bg-red-500"
                  }`}
                >
                  {submitting ? "Processing…" : actionType === "APPROVE" ? "Confirm & Mark Paid" : "Confirm Reject"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
