"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Wallet,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Receipt,
  Banknote,
  RotateCcw,
  Sliders,
  Search,
  Download,
  Calendar,
  Copy,
  Check,
  PlusCircle,
  Sparkles,
} from "lucide-react";
import { formatGHS, formatDateTime } from "@/lib/types";
import { Spinner } from "@/components/shared";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Transaction {
  id: string;
  type: string;
  amount: number;
  status: string;
  reference: string | null;
  note: string | null;
  createdAt: string;
  balanceBefore: number;
  balanceAfter: number;
  sendClaim?: {
    id: string;
    transactionReference: string;
    senderPhone: string;
    status: string;
  } | null;
}

interface PeriodStats {
  startingBalance: number;
  endingBalance: number;
  credits: number;
  debits: number;
  netChange: number;
  count: number;
}

interface Summary {
  totalCredits: number;
  totalDebits: number;
  netChange: number;
  transactionCount: number;
}

type FilterType = "ALL" | "CREDIT" | "DEBIT";
type PeriodType = "today" | "yesterday" | "7days" | "month" | "all" | "custom";

const PERIOD_LABELS: Record<PeriodType, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "7days": "Last 7 Days",
  month: "This Month",
  all: "All Time",
  custom: "Custom Date",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTypeConfig(type: string, amount: number) {
  switch (type) {
    case "TOPUP":
      return {
        label: "Wallet Top-up",
        badge: "CREDIT",
        icon: ArrowUpRight,
        colorClass: "text-emerald-600 dark:text-emerald-400",
        badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300",
        bgClass: "bg-emerald-50 dark:bg-emerald-500/10",
        isCredit: true,
      };
    case "REFUND":
      return {
        label: "Order Refund",
        badge: "CREDIT",
        icon: RotateCcw,
        colorClass: "text-sky-600 dark:text-sky-400",
        badgeClass: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300",
        bgClass: "bg-sky-50 dark:bg-sky-500/10",
        isCredit: true,
      };
    case "DEBIT":
      return {
        label: "Data Purchase",
        badge: "DEBIT",
        icon: ArrowDownLeft,
        colorClass: "text-rose-600 dark:text-rose-400",
        badgeClass: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300",
        bgClass: "bg-rose-50 dark:bg-rose-500/10",
        isCredit: false,
      };
    case "SIGNUP_FEE":
      return {
        label: "Signup Fee",
        badge: "DEBIT",
        icon: Receipt,
        colorClass: "text-rose-600 dark:text-rose-400",
        badgeClass: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300",
        bgClass: "bg-rose-50 dark:bg-rose-500/10",
        isCredit: false,
      };
    case "ADJUSTMENT":
      return amount >= 0
        ? {
            label: "Credit Adjustment",
            badge: "CREDIT",
            icon: TrendingUp,
            colorClass: "text-violet-600 dark:text-violet-400",
            badgeClass: "bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-300",
            bgClass: "bg-violet-50 dark:bg-violet-500/10",
            isCredit: true,
          }
        : {
            label: "Debit Adjustment",
            badge: "DEBIT",
            icon: TrendingDown,
            colorClass: "text-orange-600 dark:text-orange-400",
            badgeClass: "bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300",
            bgClass: "bg-orange-50 dark:bg-orange-500/10",
            isCredit: false,
          };
    default:
      return {
        label: type,
        badge: amount >= 0 ? "CREDIT" : "DEBIT",
        icon: Banknote,
        colorClass: "text-slate-600 dark:text-slate-400",
        badgeClass: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
        bgClass: "bg-slate-50 dark:bg-slate-500/10",
        isCredit: amount >= 0,
      };
  }
}

function StatusBadge({ status }: { status: string }) {
  if (status === "APPROVED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
        <CheckCircle2 className="h-3 w-3" />
        Approved
      </span>
    );
  }
  if (status === "PENDING") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
        <Clock className="h-3 w-3" />
        Pending
      </span>
    );
  }
  if (status === "REJECTED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700 dark:bg-red-500/10 dark:text-red-400">
        <XCircle className="h-3 w-3" />
        Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-500/10 dark:text-slate-400">
      <AlertCircle className="h-3 w-3" />
      {status}
    </span>
  );
}

// ─── Transaction Card ─────────────────────────────────────────────────────────

function TransactionCard({ tx }: { tx: Transaction }) {
  const [copied, setCopied] = React.useState(false);
  const cfg = getTypeConfig(tx.type, tx.amount);
  const Icon = cfg.icon;
  const isApproved = tx.status === "APPROVED";
  const displayAmount = Math.abs(tx.amount);

  // Extract network and phone details from note if applicable
  const noteText = tx.note || (tx.reference ? `Ref: ${tx.reference}` : cfg.label);
  const isMtn = /MTN/i.test(noteText);
  const isTelecel = /TELECEL/i.test(noteText);
  const isAirtelTigo = /AIRTEL|AT/i.test(noteText);

  const copyRef = (text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="group relative rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs transition-all duration-200 hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/90 sm:p-5">
      <div className="flex flex-col gap-3">
        {/* Top Header: Badge, Type, Amount */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${cfg.bgClass} transition-transform duration-200 group-hover:scale-105`}
            >
              <Icon className={`h-5 w-5 ${cfg.colorClass}`} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {cfg.label}
                </span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold tracking-wider uppercase ${cfg.badgeClass}`}
                >
                  {cfg.badge}
                </span>
                {isMtn && (
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-900 dark:bg-amber-400/20 dark:text-amber-300">
                    MTN
                  </span>
                )}
                {isTelecel && (
                  <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-900 dark:bg-red-400/20 dark:text-red-300">
                    TELECEL
                  </span>
                )}
                {isAirtelTigo && (
                  <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-900 dark:bg-blue-400/20 dark:text-blue-300">
                    AT
                  </span>
                )}
              </div>
              <time className="text-[11px] text-slate-400 dark:text-slate-500">
                {formatDateTime(tx.createdAt)}
              </time>
            </div>
          </div>

          {/* Amount Display */}
          <div className="text-right">
            <p
              className={`text-base sm:text-lg font-black tabular-nums tracking-tight ${
                cfg.isCredit
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {cfg.isCredit ? "+" : "−"}
              {formatGHS(displayAmount)}
            </p>
            <StatusBadge status={tx.status} />
          </div>
        </div>

        {/* Reason for Debit / Transaction Description */}
        <div className="rounded-xl bg-slate-50/90 px-3.5 py-2.5 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
                Reason / Description
              </span>
              <p className="mt-0.5 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 break-words">
                {noteText}
              </p>
            </div>
            {tx.reference && (
              <button
                type="button"
                onClick={() => copyRef(tx.reference!)}
                title="Copy Reference"
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-mono text-slate-500 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-slate-700/60 transition"
              >
                {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                <span className="truncate max-w-[120px]">{tx.reference}</span>
              </button>
            )}
          </div>
        </div>

        {/* Balance Progression Ledger Strip: Balance Before → Balance After */}
        {isApproved && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-100/80 bg-gradient-to-r from-brand-50/40 via-slate-50/60 to-brand-50/20 px-3.5 py-2 dark:border-brand-500/10 dark:from-slate-800/50 dark:via-slate-800/30 dark:to-slate-800/50">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Ledger Impact:
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                  Before: {formatGHS(tx.balanceBefore)}
                </span>
                <span className="text-slate-400 dark:text-slate-500 font-bold">→</span>
                <span className="text-xs font-bold tabular-nums text-slate-900 dark:text-white">
                  After: {formatGHS(tx.balanceAfter)}
                </span>
              </div>
            </div>

            <div className="text-[11px] font-bold">
              <span
                className={`rounded-md px-1.5 py-0.5 ${
                  cfg.isCredit
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                    : "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300"
                }`}
              >
                {cfg.isCredit ? "+" : "−"}
                {formatGHS(displayAmount)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TransactionsPage() {
  const [transactions, setTransactions] = React.useState<Transaction[]>([]);
  const [balance, setBalance] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [period, setPeriod] = React.useState<PeriodType>("today");
  const [customStart, setCustomStart] = React.useState("");
  const [customEnd, setCustomEnd] = React.useState("");
  const [filter, setFilter] = React.useState<FilterType>("ALL");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(25);

  const [periodStats, setPeriodStats] = React.useState<PeriodStats>({
    startingBalance: 0,
    endingBalance: 0,
    credits: 0,
    debits: 0,
    netChange: 0,
    count: 0,
  });

  const [summary, setSummary] = React.useState<Summary>({
    totalCredits: 0,
    totalDebits: 0,
    netChange: 0,
    transactionCount: 0,
  });

  // Debounce search query
  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const fetchData = React.useCallback(
    async (p: PeriodType, f: FilterType, pg: number, q: string, cStart: string, cEnd: string, ps: number) => {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(pg),
        pageSize: String(ps),
        period: p,
      });
      if (f !== "ALL") params.set("type", f);
      if (q) params.set("q", q);
      if (p === "custom") {
        if (cStart) params.set("startDate", cStart);
        if (cEnd) params.set("endDate", cEnd);
      }

      try {
        const res = await fetch(`/api/transactions?${params.toString()}`);
        const json = await res.json();
        setTransactions(json.data ?? []);
        setPeriodStats(
          json.periodStats ?? {
            startingBalance: 0,
            endingBalance: 0,
            credits: 0,
            debits: 0,
            netChange: 0,
            count: 0,
          }
        );
        setSummary(
          json.summary ?? {
            totalCredits: 0,
            totalDebits: 0,
            netChange: 0,
            transactionCount: 0,
          }
        );
        setBalance(json.balance ?? 0);
        setTotalPages(json.pages ?? 1);
        setTotal(json.total ?? 0);
      } catch (err) {
        console.error("Failed to load transactions:", err);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  React.useEffect(() => {
    fetchData(period, filter, page, debouncedSearch, customStart, customEnd, pageSize);
  }, [period, filter, page, debouncedSearch, customStart, customEnd, pageSize, fetchData]);

  const handlePeriodChange = (newPeriod: PeriodType) => {
    setPeriod(newPeriod);
    setPage(1);
  };

  const handleFilterChange = (newFilter: FilterType) => {
    setFilter(newFilter);
    setPage(1);
  };

  // Export current filtered ledger view to CSV
  const exportLedgerCsv = () => {
    if (transactions.length === 0) return;
    const headers = [
      "Date",
      "Type",
      "Amount (GHS)",
      "Reason / Note",
      "Balance Before (GHS)",
      "Balance After (GHS)",
      "Reference",
      "Status",
    ];
    const rows = transactions.map((t) => [
      new Date(t.createdAt).toISOString(),
      t.type,
      t.amount.toFixed(2),
      `"${(t.note || "").replace(/"/g, '""')}"`,
      t.balanceBefore.toFixed(2),
      t.balanceAfter.toFixed(2),
      t.reference || "",
      t.status,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `tsk-ledger-${period}-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-3 py-4 sm:px-6 sm:py-8">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Receipt className="h-6 w-6 text-brand-600" />
            Wallet Ledger &amp; Transactions
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Audit trail of your wallet balance, deposits, data purchases, and refunds.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchData(period, filter, page, debouncedSearch, customStart, customEnd, pageSize)}
            disabled={loading}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-xs transition hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label="Refresh transactions"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={exportLedgerCsv}
            disabled={transactions.length === 0}
            className="inline-flex items-center gap-1.5 h-10 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            title="Export CSV Statement"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            Export CSV
          </button>
          <Link
            href="/dashboard/billing"
            className="inline-flex items-center gap-1.5 h-10 rounded-xl bg-brand-600 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-brand-700"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            Top Up
          </Link>
        </div>
      </div>

      {/* ── Balance Hero Card with Period Breakdown ── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-700 to-indigo-800 p-6 text-white shadow-xl shadow-brand-500/15">
        <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-white/10 blur-xl" />
        <div className="pointer-events-none absolute -bottom-10 -left-10 h-36 w-36 rounded-full bg-white/5 blur-lg" />

        <div className="relative space-y-6">
          {/* Top row: Current balance */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/15 pb-5">
            <div>
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 opacity-80" />
                <span className="text-xs font-semibold uppercase tracking-wider opacity-80">
                  Current Live Balance
                </span>
              </div>
              <p className="mt-1 text-3xl sm:text-4xl font-black tracking-tight tabular-nums">
                {formatGHS(balance)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur-md">
                <Sparkles className="h-3 w-3 text-amber-300" />
                Viewing: {PERIOD_LABELS[period]}
              </span>
            </div>
          </div>

          {/* Bottom row: Starting Balance, Ending Balance, Inflow, Outflow, Net */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/70 mb-2.5">
              Period Financial Breakdown ({PERIOD_LABELS[period]})
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {/* 1. Starting Balance */}
              <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/70">
                  Starting Balance
                </p>
                <p className="mt-1 text-base sm:text-lg font-bold tabular-nums">
                  {formatGHS(periodStats.startingBalance)}
                </p>
                <p className="text-[10px] text-white/60">At period start</p>
              </div>

              {/* 2. Total In (Credits) */}
              <div className="rounded-2xl bg-emerald-500/20 p-3 backdrop-blur-sm border border-emerald-400/20">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">
                  Money In (+)
                </p>
                <p className="mt-1 text-base sm:text-lg font-bold tabular-nums text-emerald-200">
                  +{formatGHS(periodStats.credits)}
                </p>
                <p className="text-[10px] text-emerald-300/70">Top-ups &amp; refunds</p>
              </div>

              {/* 3. Total Out (Debits) */}
              <div className="rounded-2xl bg-rose-500/20 p-3 backdrop-blur-sm border border-rose-400/20">
                <p className="text-[10px] font-bold uppercase tracking-wider text-rose-200">
                  Money Out (−)
                </p>
                <p className="mt-1 text-base sm:text-lg font-bold tabular-nums text-rose-200">
                  −{formatGHS(periodStats.debits)}
                </p>
                <p className="text-[10px] text-rose-300/70">Data purchases</p>
              </div>

              {/* 4. Net Flow */}
              <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/70">
                  Net Movement
                </p>
                <p
                  className={`mt-1 text-base sm:text-lg font-bold tabular-nums ${
                    periodStats.netChange >= 0 ? "text-emerald-300" : "text-amber-300"
                  }`}
                >
                  {periodStats.netChange >= 0 ? "+" : "−"}
                  {formatGHS(Math.abs(periodStats.netChange))}
                </p>
                <p className="text-[10px] text-white/60">
                  {periodStats.netChange >= 0 ? "Net growth" : "Net decrease"}
                </p>
              </div>

              {/* 5. Ending Balance */}
              <div className="col-span-2 sm:col-span-1 rounded-2xl bg-white/15 p-3 backdrop-blur-sm border border-white/20">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/90">
                  Ending Balance
                </p>
                <p className="mt-1 text-base sm:text-lg font-black tabular-nums text-white">
                  {formatGHS(periodStats.endingBalance)}
                </p>
                <p className="text-[10px] text-white/60">At period close</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Period Selector Tabs ── */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          {(
            [
              { key: "today", label: "Today" },
              { key: "yesterday", label: "Yesterday" },
              { key: "7days", label: "Last 7 Days" },
              { key: "month", label: "This Month" },
              { key: "all", label: "All Time" },
              { key: "custom", label: "Custom Date" },
            ] as const
          ).map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => handlePeriodChange(p.key)}
              className={`flex-1 min-w-[90px] rounded-xl py-2 px-3 text-xs font-bold transition-all duration-150 text-center ${
                period === p.key
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Custom Date Pickers when 'custom' is active */}
        {period === "custom" && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-brand-600" />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">From:</span>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-900 shadow-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">To:</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-900 shadow-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Search & Type Filters Bar ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by order #, phone, note, or reference..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 rounded-2xl border border-slate-200/80 bg-white pl-10 pr-4 text-xs sm:text-sm text-slate-900 shadow-xs transition placeholder:text-slate-400 focus:border-brand-500 focus:outline-hidden dark:border-slate-800 dark:bg-slate-900 dark:text-white"
          />
        </div>

        {/* Type pills: All, Credits, Debits */}
        <div className="flex items-center gap-1 rounded-2xl border border-slate-200/80 bg-white p-1 shadow-xs dark:border-slate-800 dark:bg-slate-900 shrink-0">
          {(
            [
              { key: "ALL", label: "All" },
              { key: "CREDIT", label: "Credits (+)" },
              { key: "DEBIT", label: "Debits (−)" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => handleFilterChange(t.key)}
              className={`rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
                filter === t.key
                  ? "bg-slate-900 text-white shadow-xs dark:bg-white dark:text-slate-900"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Transactions List ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Spinner className="h-8 w-8 text-brand-600" />
          <p className="text-xs font-semibold text-slate-400">Loading ledger records…</p>
        </div>
      ) : transactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white py-16 px-4 text-center dark:border-slate-800 dark:bg-slate-900/50">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400">
            <Receipt className="h-8 w-8" />
          </div>
          <p className="mt-4 text-base font-bold text-slate-800 dark:text-slate-200">
            No transactions found
          </p>
          <p className="mt-1 text-xs text-slate-500 max-w-sm">
            {period !== "all" || filter !== "ALL" || debouncedSearch
              ? "No transactions match your selected period or filters. Try adjusting your timeframe."
              : "Your wallet transactions and order debits will appear here."}
          </p>
          {(period !== "all" || filter !== "ALL" || debouncedSearch) && (
            <button
              type="button"
              onClick={() => {
                setPeriod("all");
                setFilter("ALL");
                setSearchQuery("");
              }}
              className="mt-4 rounded-xl bg-brand-50 px-4 py-2 text-xs font-bold text-brand-600 hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-400"
            >
              Reset All Filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
              Showing {transactions.length} of {total} transaction{total !== 1 ? "s" : ""}
            </p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="text-slate-400">Show:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-[#0d1526] dark:text-slate-200 dark:hover:bg-white/10 cursor-pointer"
                >
                  <option value={25}>25 / page</option>
                  <option value={50}>50 / page</option>
                  <option value={100}>100 / page</option>
                </select>
              </div>
              <p className="text-xs text-slate-400">
                Page {page} of {totalPages}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {transactions.map((tx) => (
              <TransactionCard key={tx.id} tx={tx} />
            ))}
          </div>
        </div>
      )}

      {/* ── Pagination ── */}
      {(totalPages > 1 || total > 25) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </button>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Page <span className="font-bold text-slate-900 dark:text-white">{page}</span> of{" "}
              <span className="font-bold text-slate-900 dark:text-white">{totalPages}</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-400">Show:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-[#0d1526] dark:text-slate-200 dark:hover:bg-white/10 cursor-pointer"
              >
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
