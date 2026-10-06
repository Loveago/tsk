"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Wallet,
  Search,
  RefreshCw,
  Download,
  ExternalLink,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  PlusCircle,
  MinusCircle,
  Copy,
  Check,
  Store,
  Phone,
  Mail,
  User as UserIcon,
  ShoppingBag,
  SlidersHorizontal,
  ChevronRight,
  FileSpreadsheet,
} from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Dialog } from "@/components/ui/dialog";
import { Spinner, EmptyState } from "@/components/shared";

export interface StorefrontWalletRow {
  userId: string;
  userName: string;
  userEmail: string;
  userPhone: string | null;
  userStatus: string;
  userCreatedAt: string;
  storefront: {
    id: string;
    name: string;
    slug: string;
    status: string;
    isActive: boolean;
  } | null;
  walletId: string | null;
  balance: number;
  pendingBalance: number;
  balanceGHS: number;
  pendingBalanceGHS: number;
  totalWithdrawn: number;
  totalWithdrawnGHS: number;
  pendingWithdrawalsCount: number;
  pendingWithdrawalsAmount: number;
  pendingWithdrawalsAmountGHS: number;
  lifetimeEarned: number;
  lifetimeEarnedGHS: number;
  transactionsCount: number;
  walletUpdatedAt: string | null;
}

export interface StorefrontWalletsOverview {
  totalWallets: number;
  totalBalanceGHS: number;
  totalPendingBalanceGHS: number;
  totalWithdrawnGHS: number;
  totalLifetimeEarnedGHS: number;
  pendingWithdrawalsCount: number;
  pendingWithdrawalsAmountGHS: number;
}

interface DetailUserWallet {
  user: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    status: string;
    createdAt: string;
  };
  storefront: {
    id: string;
    name: string;
    slug: string;
    status: string;
    isActive: boolean;
    phone: string | null;
    whatsapp: string | null;
  } | null;
  wallet: {
    id: string | null;
    balance: number;
    pendingBalance: number;
    balanceGHS: number;
    pendingBalanceGHS: number;
    totalWithdrawn: number;
    totalWithdrawnGHS: number;
    pendingWithdrawals: number;
    pendingWithdrawalsGHS: number;
    lifetimeEarned: number;
    lifetimeEarnedGHS: number;
  };
  transactions: Array<{
    id: string;
    type: string;
    amount: number;
    amountGHS: number;
    balanceBefore: number;
    balanceAfter: number;
    balanceBeforeGHS: number;
    balanceAfterGHS: number;
    pendingBefore: number | null;
    pendingAfter: number | null;
    pendingBeforeGHS: number | null;
    pendingAfterGHS: number | null;
    reference: string | null;
    description: string | null;
    createdAt: string;
  }>;
  withdrawals: Array<{
    id: string;
    seq: number;
    reference: string;
    amount: number;
    amountGHS: number;
    fee: number;
    feeGHS: number;
    netAmount: number;
    netAmountGHS: number;
    network: string;
    momoNumber: string;
    accountName: string;
    status: string;
    note: string | null;
    adminNote: string | null;
    requestedAt: string;
    processedAt: string | null;
  }>;
  recentOrders: Array<{
    id: string;
    seq: number;
    orderCode: string;
    customerPhone: string;
    customerEmail: string | null;
    sellingPrice: number;
    sellingPriceGHS: number;
    productCost: number;
    productCostGHS: number;
    commission: number;
    commissionGHS: number;
    status: string;
    commissionState: string;
    paymentReference: string;
    packageName: string;
    network: string;
    dataAmount: number;
    createdAt: string;
  }>;
}

const TYPE_STYLES: Record<string, { label: string; badge: string }> = {
  COMMISSION: {
    label: "Commission Earned",
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300 border-amber-200 dark:border-amber-500/30",
  },
  COMMISSION_RELEASE: {
    label: "Commission Released",
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30",
  },
  COMMISSION_REVERSAL: {
    label: "Commission Reversal",
    badge: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300 border-red-200 dark:border-red-500/30",
  },
  WITHDRAWAL: {
    label: "MoMo Withdrawal",
    badge: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300 border-rose-200 dark:border-rose-500/30",
  },
  WITHDRAWAL_REVERSAL: {
    label: "Withdrawal Reversal",
    badge: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300 border-sky-200 dark:border-sky-500/30",
  },
  ADJUSTMENT: {
    label: "Admin Adjustment",
    badge: "bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-300 border-purple-200 dark:border-purple-500/30",
  },
};

export function AdminStorefrontWalletsTracker({
  initialWallets,
  initialOverview,
}: {
  initialWallets: StorefrontWalletRow[];
  initialOverview: StorefrontWalletsOverview;
}) {
  const router = useRouter();
  const storefrontDomain = process.env.NEXT_PUBLIC_STOREFRONT_DOMAIN || "tskdatastore.com";

  const [wallets, setWallets] = React.useState<StorefrontWalletRow[]>(initialWallets);
  const [overview, setOverview] = React.useState<StorefrontWalletsOverview>(initialOverview);
  const [loading, setLoading] = React.useState(false);

  // Filters & sorting
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<"ALL" | "HAS_BALANCE" | "HAS_PENDING" | "ZERO" | "WITHDRAWAL_PENDING">("ALL");
  const [sortBy, setSortBy] = React.useState<"balance" | "pending" | "lifetime" | "withdrawn" | "recent">("balance");
  const [sortOrder, setSortOrder] = React.useState<"asc" | "desc">("desc");

  // Detail Sheet state
  const [selectedUserId, setSelectedUserId] = React.useState<string | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [userDetail, setUserDetail] = React.useState<DetailUserWallet | null>(null);
  const [detailTab, setDetailTab] = React.useState<"ledger" | "withdrawals" | "orders">("ledger");

  // Adjustment dialog state
  const [adjustTargetUser, setAdjustTargetUser] = React.useState<{ id: string; name: string; currentBalanceGHS: number } | null>(null);
  const [adjustType, setAdjustType] = React.useState<"CREDIT" | "DEBIT">("CREDIT");
  const [adjustAmount, setAdjustAmount] = React.useState("");
  const [adjustReason, setAdjustReason] = React.useState("");
  const [adjustSubmitting, setAdjustSubmitting] = React.useState(false);

  // Copy tracking
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  // Fetch / refresh data
  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filter !== "ALL") params.set("filter", filter);
      if (sortBy) params.set("sortBy", sortBy);
      params.set("order", sortOrder);

      const res = await fetch(`/api/admin/storefront-wallets?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load storefront wallets");
      const data = await res.json();
      setWallets(data.wallets);
      setOverview(data.overview);
    } catch (err) {
      setFeedback({ kind: "err", text: err instanceof Error ? err.message : "Failed to load wallets" });
    } finally {
      setLoading(false);
    }
  }, [search, filter, sortBy, sortOrder]);

  // Load detailed wallet info
  const loadUserDetail = React.useCallback(async (userId: string) => {
    setSelectedUserId(userId);
    setDetailLoading(true);
    setDetailTab("ledger");
    try {
      const res = await fetch(`/api/admin/storefront-wallets?userId=${encodeURIComponent(userId)}`);
      if (!res.ok) throw new Error("Failed to load storefront wallet details");
      const data = await res.json();
      setUserDetail(data);
    } catch (err) {
      setFeedback({ kind: "err", text: err instanceof Error ? err.message : "Failed to load wallet details" });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // Submit manual adjustment
  async function handleAdjustSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!adjustTargetUser) return;

    const numAmount = parseFloat(adjustAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setFeedback({ kind: "err", text: "Please enter a valid positive amount." });
      return;
    }
    if (!adjustReason.trim()) {
      setFeedback({ kind: "err", text: "Please enter an audit reason for the adjustment." });
      return;
    }

    setAdjustSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/storefront-wallets/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: adjustTargetUser.id,
          type: adjustType,
          amountGHS: numAmount,
          reason: adjustReason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to adjust storefront wallet");

      setFeedback({ kind: "ok", text: data.message || "Storefront wallet adjusted successfully." });
      setAdjustTargetUser(null);
      setAdjustAmount("");
      setAdjustReason("");

      // Refresh list and detail if open
      await fetchData();
      if (selectedUserId === adjustTargetUser.id) {
        await loadUserDetail(adjustTargetUser.id);
      }
    } catch (err) {
      setFeedback({ kind: "err", text: err instanceof Error ? err.message : "Adjustment failed" });
    } finally {
      setAdjustSubmitting(false);
    }
  }

  // Export to CSV
  function exportToCsv() {
    const headers = [
      "User ID",
      "Reseller Name",
      "Email",
      "Phone",
      "Store Name",
      "Store Slug",
      "Store Status",
      "Available Balance (GHS)",
      "Pending Balance (GHS)",
      "Total Withdrawn (GHS)",
      "Lifetime Earned (GHS)",
      "Pending Withdrawals Count",
      "Pending Withdrawals Amount (GHS)",
      "Total Ledger Transactions",
    ];

    const rows = wallets.map((w) => [
      w.userId,
      `"${w.userName.replace(/"/g, '""')}"`,
      w.userEmail,
      w.userPhone || "",
      w.storefront ? `"${w.storefront.name.replace(/"/g, '""')}"` : "",
      w.storefront ? w.storefront.slug : "",
      w.storefront ? w.storefront.status : "NO_STORE",
      w.balanceGHS.toFixed(2),
      w.pendingBalanceGHS.toFixed(2),
      w.totalWithdrawnGHS.toFixed(2),
      w.lifetimeEarnedGHS.toFixed(2),
      w.pendingWithdrawalsCount,
      w.pendingWithdrawalsAmountGHS.toFixed(2),
      w.transactionsCount,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `storefront_wallets_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {feedback && (
        <div
          className={`flex items-center justify-between rounded-xl p-3.5 text-sm font-medium ${
            feedback.kind === "ok"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20"
              : "bg-red-50 text-red-800 border border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/20"
          }`}
        >
          <span>{feedback.text}</span>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs font-bold underline ml-3 opacity-80 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#0d1526]">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Available Balance</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
              <Wallet className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
            GHS {overview.totalBalanceGHS.toFixed(2)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Withdrawable by resellers</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#0d1526]">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">In-Flight Pending</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
              <Clock className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
            GHS {overview.totalPendingBalanceGHS.toFixed(2)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Awaiting order completion</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#0d1526]">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Paid Out</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300">
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            GHS {overview.totalWithdrawnGHS.toFixed(2)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Approved MoMo payouts</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#0d1526]">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Lifetime Earnings</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400">
              <ShoppingBag className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-xl font-bold tracking-tight text-violet-600 dark:text-violet-400">
            GHS {overview.totalLifetimeEarnedGHS.toFixed(2)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Cumulative reseller profit</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#0d1526] col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Storefront Wallets</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
              <Store className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            {overview.totalWallets}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {overview.pendingWithdrawalsCount > 0 ? (
              <Link
                href="/admin/storefronts/withdrawals"
                className="font-bold text-amber-600 hover:underline dark:text-amber-400"
              >
                {overview.pendingWithdrawalsCount} payout req (GHS {overview.pendingWithdrawalsAmountGHS.toFixed(2)}) →
              </Link>
            ) : (
              "0 pending payout requests"
            )}
          </p>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-[#0d1526]">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reseller by name, email, phone, or store slug…"
            className="h-9 w-full rounded-xl border border-slate-300 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900/60 dark:text-white dark:placeholder:text-slate-500"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {[
            { id: "ALL", label: "All Wallets" },
            { id: "HAS_BALANCE", label: "Has Available Balance" },
            { id: "HAS_PENDING", label: "In-Flight Pending" },
            { id: "WITHDRAWAL_PENDING", label: "Pending Payout" },
            { id: "ZERO", label: "Zero Balance" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id as typeof filter)}
              className={`rounded-lg px-2.5 py-1.5 font-medium transition ${
                filter === f.id
                  ? "bg-brand-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Sort & Actions */}
        <div className="flex items-center gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="h-9 rounded-xl border border-slate-300 px-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200"
          >
            <option value="balance">Sort: Available Balance</option>
            <option value="pending">Sort: Pending Balance</option>
            <option value="lifetime">Sort: Lifetime Earned</option>
            <option value="withdrawn">Sort: Total Withdrawn</option>
            <option value="recent">Sort: Recently Created</option>
          </select>

          <button
            onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
            title="Toggle sort direction"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={fetchData}
            disabled={loading}
            title="Refresh"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>

          <button
            onClick={exportToCsv}
            title="Export CSV"
            className="flex items-center gap-1.5 h-9 rounded-xl border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/5"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
        </div>
      </div>

      {/* Wallets Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#0d1526]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-100 bg-slate-50 font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-white/5">
              <tr>
                <th className="px-4 py-3">Storefront Reseller</th>
                <th className="px-4 py-3">Storefront Address</th>
                <th className="px-4 py-3 text-right">Available Balance</th>
                <th className="px-4 py-3 text-right">In-Flight Pending</th>
                <th className="px-4 py-3 text-right">Total Withdrawn</th>
                <th className="px-4 py-3 text-right">Lifetime Earned</th>
                <th className="px-4 py-3 text-center">Payout Alerts</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {wallets.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500">
                    <p className="font-medium">No storefront wallets found matching current filters.</p>
                  </td>
                </tr>
              )}
              {wallets.map((w) => (
                <tr
                  key={w.userId}
                  className="transition hover:bg-slate-50/70 dark:hover:bg-white/[0.02]"
                >
                  {/* Reseller Info */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 font-bold dark:bg-white/5 dark:text-slate-300">
                        {w.userName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <button
                          onClick={() => loadUserDetail(w.userId)}
                          className="font-bold text-slate-900 hover:text-brand-600 hover:underline dark:text-white dark:hover:text-brand-400 text-left truncate block"
                        >
                          {w.userName}
                        </button>
                        <p className="text-[11px] text-slate-400 truncate">{w.userEmail}</p>
                        {w.userPhone && (
                          <p className="text-[10px] text-slate-400">{w.userPhone}</p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Storefront Info */}
                  <td className="px-4 py-3.5">
                    {w.storefront ? (
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <a
                            href={`https://${storefrontDomain}/${w.storefront.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-violet-600 hover:underline dark:text-violet-400 flex items-center gap-1"
                          >
                            <span>/{w.storefront.slug}</span>
                            <ExternalLink className="h-3 w-3 opacity-70" />
                          </a>
                        </div>
                        <p className="text-[11px] text-slate-400 truncate max-w-[160px]">
                          {w.storefront.name}
                        </p>
                        <span
                          className={`inline-block rounded-full px-1.5 py-0.2 text-[9px] font-bold ${
                            w.storefront.status === "ENABLED"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                              : w.storefront.status === "SUSPENDED"
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                              : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-400"
                          }`}
                        >
                          {w.storefront.status}
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-400 italic">No storefront</span>
                    )}
                  </td>

                  {/* Available Balance */}
                  <td className="px-4 py-3.5 text-right font-mono">
                    <span
                      className={`inline-block rounded-lg px-2 py-1 font-bold ${
                        w.balanceGHS > 0
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                          : "text-slate-400"
                      }`}
                    >
                      GHS {w.balanceGHS.toFixed(2)}
                    </span>
                  </td>

                  {/* Pending Balance */}
                  <td className="px-4 py-3.5 text-right font-mono">
                    <span
                      className={`inline-block rounded-lg px-2 py-1 font-semibold ${
                        w.pendingBalanceGHS > 0
                          ? "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                          : "text-slate-400"
                      }`}
                    >
                      GHS {w.pendingBalanceGHS.toFixed(2)}
                    </span>
                  </td>

                  {/* Total Withdrawn */}
                  <td className="px-4 py-3.5 text-right font-mono text-slate-700 dark:text-slate-300">
                    GHS {w.totalWithdrawnGHS.toFixed(2)}
                  </td>

                  {/* Lifetime Earned */}
                  <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                    GHS {w.lifetimeEarnedGHS.toFixed(2)}
                  </td>

                  {/* Payout Alerts */}
                  <td className="px-4 py-3.5 text-center">
                    {w.pendingWithdrawalsCount > 0 ? (
                      <Link
                        href="/admin/storefronts/withdrawals"
                        className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 hover:bg-amber-200 dark:bg-amber-500/20 dark:text-amber-300 animate-pulse"
                      >
                        <AlertCircle className="h-3 w-3" />
                        <span>{w.pendingWithdrawalsCount} pending</span>
                      </Link>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600">—</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => loadUserDetail(w.userId)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        <Wallet className="h-3 w-3 text-brand-600 dark:text-brand-400" />
                        <span>Track</span>
                      </button>

                      <button
                        onClick={() =>
                          setAdjustTargetUser({
                            id: w.userId,
                            name: w.userName,
                            currentBalanceGHS: w.balanceGHS,
                          })
                        }
                        title="Adjust balance"
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        <span>Adjust</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Slide-Over Sheet (Inspector) */}
      <Sheet
        open={!!selectedUserId}
        onClose={() => {
          setSelectedUserId(null);
          setUserDetail(null);
        }}
        title={
          userDetail ? (
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-brand-600 dark:text-brand-400" />
              <span>{userDetail.user.name}&apos;s Storefront Wallet</span>
            </div>
          ) : (
            "Storefront Wallet Details"
          )
        }
        description={
          userDetail ? (
            <span>
              {userDetail.user.email} {userDetail.user.phone ? `· ${userDetail.user.phone}` : ""}
              {userDetail.storefront ? ` · Store: /${userDetail.storefront.slug}` : ""}
            </span>
          ) : undefined
        }
        className="max-w-3xl"
      >
        {detailLoading && (
          <div className="flex h-64 items-center justify-center">
            <Spinner className="h-8 w-8 text-brand-600" />
          </div>
        )}

        {!detailLoading && userDetail && (
          <div className="space-y-6">
            {/* Quick Balances Grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 dark:border-emerald-500/20 dark:bg-emerald-500/5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                  Available (Withdrawable)
                </span>
                <p className="mt-1 text-lg font-bold text-emerald-700 dark:text-emerald-400">
                  GHS {userDetail.wallet.balanceGHS.toFixed(2)}
                </p>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 dark:border-amber-500/20 dark:bg-amber-500/5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  In-Flight Pending
                </span>
                <p className="mt-1 text-lg font-bold text-amber-700 dark:text-amber-400">
                  GHS {userDetail.wallet.pendingBalanceGHS.toFixed(2)}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 dark:border-slate-800 dark:bg-white/5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Total Paid Out
                </span>
                <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                  GHS {userDetail.wallet.totalWithdrawnGHS.toFixed(2)}
                </p>
              </div>

              <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3.5 dark:border-violet-500/20 dark:bg-violet-500/5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">
                  Lifetime Earnings
                </span>
                <p className="mt-1 text-lg font-bold text-violet-700 dark:text-violet-400">
                  GHS {userDetail.wallet.lifetimeEarnedGHS.toFixed(2)}
                </p>
              </div>
            </div>

            {/* Store & Reseller Meta Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0d1526]/80 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Store className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    {userDetail.storefront ? userDetail.storefront.name : "No Storefront"}
                  </span>
                  {userDetail.storefront && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        userDetail.storefront.status === "ENABLED"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                      }`}
                    >
                      {userDetail.storefront.status}
                    </span>
                  )}
                </div>
                {userDetail.storefront && (
                  <p className="text-xs text-slate-500">
                    Public link:{" "}
                    <a
                      href={`https://${storefrontDomain}/${userDetail.storefront.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-violet-600 hover:underline dark:text-violet-400 inline-flex items-center gap-1"
                    >
                      {storefrontDomain}/{userDetail.storefront.slug}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    setAdjustTargetUser({
                      id: userDetail.user.id,
                      name: userDetail.user.name,
                      currentBalanceGHS: userDetail.wallet.balanceGHS,
                    })
                  }
                  className="rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-violet-500 transition"
                >
                  Adjust Balance
                </button>
              </div>
            </div>

            {/* Detail Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setDetailTab("ledger")}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-bold transition ${
                  detailTab === "ledger"
                    ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <span>Ledger Transactions</span>
                <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] text-slate-600 dark:bg-white/10 dark:text-slate-300">
                  {userDetail.transactions.length}
                </span>
              </button>

              <button
                onClick={() => setDetailTab("withdrawals")}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-bold transition ${
                  detailTab === "withdrawals"
                    ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <span>Withdrawal Requests</span>
                <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] text-slate-600 dark:bg-white/10 dark:text-slate-300">
                  {userDetail.withdrawals.length}
                </span>
              </button>

              <button
                onClick={() => setDetailTab("orders")}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-bold transition ${
                  detailTab === "orders"
                    ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <span>Recent Storefront Orders</span>
                <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] text-slate-600 dark:bg-white/10 dark:text-slate-300">
                  {userDetail.recentOrders.length}
                </span>
              </button>
            </div>

            {/* Tab 1: Ledger Transactions */}
            {detailTab === "ledger" && (
              <div className="space-y-3">
                {userDetail.transactions.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500 dark:border-slate-800">
                    No ledger transactions recorded for this storefront wallet yet.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs dark:border-slate-800 dark:bg-[#0d1526]">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:bg-white/5">
                          <tr>
                            <th className="px-3.5 py-2.5">Date &amp; Time</th>
                            <th className="px-3.5 py-2.5">Type</th>
                            <th className="px-3.5 py-2.5 text-right">Amount</th>
                            <th className="px-3.5 py-2.5 text-right">Balance After</th>
                            <th className="px-3.5 py-2.5">Reference &amp; Note</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                          {userDetail.transactions.map((t) => {
                            const isPositive = t.amount >= 0;
                            const typeMeta = TYPE_STYLES[t.type] || {
                              label: t.type,
                              badge: "bg-slate-100 text-slate-700",
                            };
                            return (
                              <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
                                <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-500">
                                  {new Date(t.createdAt).toLocaleString("en-GB", {
                                    dateStyle: "short",
                                    timeStyle: "short",
                                  })}
                                </td>
                                <td className="px-3.5 py-2.5 whitespace-nowrap">
                                  <span
                                    className={`inline-block rounded-full border px-2 py-0.5 text-[9px] font-bold ${typeMeta.badge}`}
                                  >
                                    {typeMeta.label}
                                  </span>
                                </td>
                                <td className="px-3.5 py-2.5 text-right whitespace-nowrap font-mono font-bold">
                                  <span
                                    className={
                                      isPositive
                                        ? "text-emerald-600 dark:text-emerald-400"
                                        : "text-rose-600 dark:text-rose-400"
                                    }
                                  >
                                    {isPositive ? "+" : "−"}GHS {Math.abs(t.amountGHS).toFixed(2)}
                                  </span>
                                </td>
                                <td className="px-3.5 py-2.5 text-right whitespace-nowrap font-mono text-slate-700 dark:text-slate-300">
                                  <div>GHS {t.balanceAfterGHS.toFixed(2)}</div>
                                  {t.pendingAfterGHS !== null && (
                                    <div className="text-[10px] text-amber-600 dark:text-amber-400">
                                      pending: GHS {t.pendingAfterGHS.toFixed(2)}
                                    </div>
                                  )}
                                </td>
                                <td className="px-3.5 py-2.5 text-slate-600 dark:text-slate-300">
                                  {t.description && <div>{t.description}</div>}
                                  {t.reference && (
                                    <div className="font-mono text-[10px] text-slate-400">
                                      Ref: {t.reference}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Withdrawals */}
            {detailTab === "withdrawals" && (
              <div className="space-y-3">
                {userDetail.withdrawals.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500 dark:border-slate-800">
                    No MoMo withdrawal requests submitted by this reseller.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs dark:border-slate-800 dark:bg-[#0d1526]">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:bg-white/5">
                          <tr>
                            <th className="px-3.5 py-2.5">Requested At</th>
                            <th className="px-3.5 py-2.5">Ref / Seq</th>
                            <th className="px-3.5 py-2.5">MoMo Destination</th>
                            <th className="px-3.5 py-2.5 text-right">Gross (Debited)</th>
                            <th className="px-3.5 py-2.5 text-right">Net Payout</th>
                            <th className="px-3.5 py-2.5">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                          {userDetail.withdrawals.map((w) => (
                            <tr key={w.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
                              <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-500">
                                {new Date(w.requestedAt).toLocaleString("en-GB", {
                                  dateStyle: "short",
                                  timeStyle: "short",
                                })}
                              </td>
                              <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                                {w.reference}
                              </td>
                              <td className="px-3.5 py-2.5">
                                <div className="font-semibold text-slate-800 dark:text-slate-200">
                                  {w.network} · {w.momoNumber}
                                </div>
                                <div className="text-[10px] text-slate-400">{w.accountName}</div>
                              </td>
                              <td className="px-3.5 py-2.5 text-right font-mono text-slate-800 dark:text-slate-200">
                                GHS {w.amountGHS.toFixed(2)}
                              </td>
                              <td className="px-3.5 py-2.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                GHS {w.netAmountGHS.toFixed(2)}
                              </td>
                              <td className="px-3.5 py-2.5">
                                <span
                                  className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold ${
                                    w.status === "APPROVED"
                                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                                      : w.status === "PENDING"
                                      ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                                      : "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300"
                                  }`}
                                >
                                  {w.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Storefront Orders */}
            {detailTab === "orders" && (
              <div className="space-y-3">
                {userDetail.recentOrders.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500 dark:border-slate-800">
                    No storefront customer orders recorded yet.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs dark:border-slate-800 dark:bg-[#0d1526]">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:bg-white/5">
                          <tr>
                            <th className="px-3.5 py-2.5">Order / Date</th>
                            <th className="px-3.5 py-2.5">Package</th>
                            <th className="px-3.5 py-2.5">Buyer</th>
                            <th className="px-3.5 py-2.5 text-right">Selling Price</th>
                            <th className="px-3.5 py-2.5 text-right">Reseller Profit</th>
                            <th className="px-3.5 py-2.5">Commission State</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                          {userDetail.recentOrders.map((o) => (
                            <tr key={o.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
                              <td className="px-3.5 py-2.5">
                                <div className="font-mono font-bold text-slate-800 dark:text-slate-200">
                                  {o.orderCode}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {new Date(o.createdAt).toLocaleString("en-GB", {
                                    dateStyle: "short",
                                    timeStyle: "short",
                                  })}
                                </div>
                              </td>
                              <td className="px-3.5 py-2.5">
                                <span className="font-semibold text-slate-800 dark:text-slate-200">
                                  {o.network} {o.packageName}
                                </span>
                              </td>
                              <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                                {o.customerPhone}
                              </td>
                              <td className="px-3.5 py-2.5 text-right font-mono text-slate-700 dark:text-slate-300">
                                GHS {o.sellingPriceGHS.toFixed(2)}
                              </td>
                              <td className="px-3.5 py-2.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                +GHS {o.commissionGHS.toFixed(2)}
                              </td>
                              <td className="px-3.5 py-2.5">
                                <span
                                  className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold ${
                                    o.commissionState === "AVAILABLE"
                                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                                      : o.commissionState === "PENDING"
                                      ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                                      : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-400"
                                  }`}
                                >
                                  {o.commissionState}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Sheet>

      {/* Manual Balance Adjustment Dialog */}
      <Dialog
        open={!!adjustTargetUser}
        onClose={() => {
          setAdjustTargetUser(null);
          setAdjustAmount("");
          setAdjustReason("");
        }}
        title={`Adjust Storefront Wallet — ${adjustTargetUser?.name}`}
        description="Manually credit or debit this reseller's withdrawable commission balance. This creates an auditable ADJUSTMENT transaction."
      >
        {adjustTargetUser && (
          <form onSubmit={handleAdjustSubmit} className="space-y-4 pt-1">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-white/5">
              <span className="text-slate-500">Current Available Balance:</span>{" "}
              <strong className="font-mono text-emerald-600 dark:text-emerald-400">
                GHS {adjustTargetUser.currentBalanceGHS.toFixed(2)}
              </strong>
            </div>

            {/* Credit or Debit Type Toggle */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Adjustment Type</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustType("CREDIT")}
                  className={`flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-bold transition ${
                    adjustType === "CREDIT"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                  }`}
                >
                  <PlusCircle className="h-4 w-4" />
                  <span>Credit (+ Balance)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustType("DEBIT")}
                  className={`flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-bold transition ${
                    adjustType === "DEBIT"
                      ? "border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                  }`}
                >
                  <MinusCircle className="h-4 w-4" />
                  <span>Debit (- Balance)</span>
                </button>
              </div>
            </div>

            {/* Amount input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Amount (GHS)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                placeholder="e.g. 50.00"
                className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900/60 dark:text-white"
              />
              {adjustAmount && !isNaN(parseFloat(adjustAmount)) && (
                <p className="text-[11px] text-slate-500">
                  New projected balance:{" "}
                  <strong className="font-mono text-slate-900 dark:text-white">
                    GHS{" "}
                    {Math.max(
                      0,
                      adjustTargetUser.currentBalanceGHS +
                        (adjustType === "CREDIT" ? 1 : -1) * parseFloat(adjustAmount)
                    ).toFixed(2)}
                  </strong>
                </p>
              )}
            </div>

            {/* Reason input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Audit Reason / Note</label>
              <textarea
                required
                rows={2}
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="State reason for credit/debit (e.g. promotional bonus, manual MoMo settlement, correction)"
                className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900/60 dark:text-white"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAdjustTargetUser(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={adjustSubmitting}
                className={`rounded-xl px-4 py-2 text-xs font-bold text-white shadow-sm transition disabled:opacity-50 ${
                  adjustType === "CREDIT"
                    ? "bg-emerald-600 hover:bg-emerald-500"
                    : "bg-rose-600 hover:bg-rose-500"
                }`}
              >
                {adjustSubmitting ? "Adjusting…" : `Confirm ${adjustType}`}
              </button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
