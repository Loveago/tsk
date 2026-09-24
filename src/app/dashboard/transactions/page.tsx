"use client";

import * as React from "react";
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
  Filter,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Receipt,
  Banknote,
  RotateCcw,
  Sliders,
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
}

interface Summary {
  totalCredits: number;
  totalDebits: number;
  transactionCount: number;
}

type FilterType = "ALL" | "CREDIT" | "DEBIT";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTypeConfig(type: string, amount: number) {
  switch (type) {
    case "TOPUP":
      return {
        label: "Top-up",
        icon: ArrowUpRight,
        colorClass: "text-emerald-600 dark:text-emerald-400",
        bgClass: "bg-emerald-50 dark:bg-emerald-500/10",
        isCredit: true,
      };
    case "REFUND":
      return {
        label: "Refund",
        icon: RotateCcw,
        colorClass: "text-sky-600 dark:text-sky-400",
        bgClass: "bg-sky-50 dark:bg-sky-500/10",
        isCredit: true,
      };
    case "DEBIT":
      return {
        label: "Order Debit",
        icon: ArrowDownLeft,
        colorClass: "text-rose-600 dark:text-rose-400",
        bgClass: "bg-rose-50 dark:bg-rose-500/10",
        isCredit: false,
      };
    case "SIGNUP_FEE":
      return {
        label: "Signup Fee",
        icon: Receipt,
        colorClass: "text-rose-600 dark:text-rose-400",
        bgClass: "bg-rose-50 dark:bg-rose-500/10",
        isCredit: false,
      };
    case "ADJUSTMENT":
      return amount >= 0
        ? {
            label: "Credit Adjustment",
            icon: TrendingUp,
            colorClass: "text-violet-600 dark:text-violet-400",
            bgClass: "bg-violet-50 dark:bg-violet-500/10",
            isCredit: true,
          }
        : {
            label: "Debit Adjustment",
            icon: TrendingDown,
            colorClass: "text-orange-600 dark:text-orange-400",
            bgClass: "bg-orange-50 dark:bg-orange-500/10",
            isCredit: false,
          };
    default:
      return {
        label: type,
        icon: Banknote,
        colorClass: "text-slate-600 dark:text-slate-400",
        bgClass: "bg-slate-50 dark:bg-slate-500/10",
        isCredit: false,
      };
  }
}

function StatusBadge({ status }: { status: string }) {
  if (status === "APPROVED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
        <CheckCircle2 className="h-2.5 w-2.5" />
        Approved
      </span>
    );
  }
  if (status === "PENDING") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
        <Clock className="h-2.5 w-2.5" />
        Pending
      </span>
    );
  }
  if (status === "REJECTED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700 dark:bg-red-500/10 dark:text-red-400">
        <XCircle className="h-2.5 w-2.5" />
        Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-500/10 dark:text-slate-400">
      <AlertCircle className="h-2.5 w-2.5" />
      {status}
    </span>
  );
}

// ─── Transaction Card ─────────────────────────────────────────────────────────

function TransactionCard({ tx }: { tx: Transaction }) {
  const cfg = getTypeConfig(tx.type, tx.amount);
  const Icon = cfg.icon;
  const isApproved = tx.status === "APPROVED";
  const displayAmount = Math.abs(tx.amount);

  // Determine the label shown in the note area
  const description =
    tx.note ||
    (tx.reference ? `Ref: ${tx.reference}` : cfg.label);

  return (
    <div className="group relative flex gap-3 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm transition-all duration-200 hover:border-slate-300 hover:shadow-md dark:border-slate-700/60 dark:bg-slate-800/60 dark:hover:border-slate-600 sm:gap-4">
      {/* Type icon */}
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${cfg.bgClass} transition-transform duration-200 group-hover:scale-110`}
      >
        <Icon className={`h-5 w-5 ${cfg.colorClass}`} />
      </div>

      {/* Main content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          {/* Left: type label + description */}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {cfg.label}
            </p>
            <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
              {description}
            </p>
          </div>

          {/* Right: amount */}
          <div className="text-right">
            <p
              className={`text-base font-bold tabular-nums ${
                cfg.isCredit
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {cfg.isCredit ? "+" : "−"}
              {formatGHS(displayAmount)}
            </p>
          </div>
        </div>

        {/* Balance before → after strip */}
        {isApproved && (
          <div className="mt-2.5 flex items-center gap-1.5 rounded-xl bg-slate-50 px-3 py-1.5 dark:bg-slate-700/50">
            <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
              {formatGHS(tx.balanceBefore)}
            </span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">→</span>
            <span className="text-[11px] font-semibold tabular-nums text-slate-700 dark:text-slate-200">
              {formatGHS(tx.balanceAfter)}
            </span>
            <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500">Balance</span>
          </div>
        )}

        {/* Footer: date + status */}
        <div className="mt-2 flex items-center justify-between gap-2">
          <time className="text-[11px] text-slate-400 dark:text-slate-500">
            {formatDateTime(tx.createdAt)}
          </time>
          <StatusBadge status={tx.status} />
        </div>
      </div>
    </div>
  );
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  icon: Icon,
  colorClass,
  bgClass,
  sub,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
  bgClass: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/60">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${bgClass}`}>
          <Icon className={`h-3.5 w-3.5 ${colorClass}`} />
        </div>
      </div>
      <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">{value}</p>
      {sub && <p className="text-[11px] text-slate-400 dark:text-slate-500">{sub}</p>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TransactionsPage() {
  const [transactions, setTransactions] = React.useState<Transaction[]>([]);
  const [summary, setSummary] = React.useState<Summary>({
    totalCredits: 0,
    totalDebits: 0,
    transactionCount: 0,
  });
  const [balance, setBalance] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<FilterType>("ALL");
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const pageSize = 20;

  const fetchData = React.useCallback(
    async (f: FilterType, p: number) => {
      setLoading(true);
      const params = new URLSearchParams({ page: String(p), pageSize: String(pageSize) });
      if (f !== "ALL") params.set("type", f);
      const res = await fetch(`/api/transactions?${params}`);
      const json = await res.json();
      setTransactions(json.data ?? []);
      setSummary(json.summary ?? { totalCredits: 0, totalDebits: 0, transactionCount: 0 });
      setBalance(json.balance ?? 0);
      setTotalPages(json.pages ?? 1);
      setTotal(json.total ?? 0);
      setLoading(false);
    },
    []
  );

  React.useEffect(() => {
    fetchData(filter, page);
  }, [filter, page, fetchData]);

  const handleFilter = (f: FilterType) => {
    setFilter(f);
    setPage(1);
  };

  const netChange = summary.totalCredits - summary.totalDebits;

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-3 py-4 sm:px-4 sm:py-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Transactions</h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Your complete money movement history
          </p>
        </div>
        <button
          onClick={() => fetchData(filter, page)}
          disabled={loading}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
          aria-label="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* ── Balance Hero ── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 via-brand-700 to-indigo-700 p-5 text-white shadow-lg shadow-brand-500/20">
        {/* decorative circles */}
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-6 -left-6 h-24 w-24 rounded-full bg-white/5" />

        <div className="relative">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 opacity-80" />
            <p className="text-xs font-medium opacity-80">Current Balance</p>
          </div>
          <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight">
            {formatGHS(balance)}
          </p>
          <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 backdrop-blur-sm w-fit">
            <ArrowLeftRight className="h-3 w-3 opacity-70" />
            <span className="text-xs font-medium opacity-90">
              {total} transaction{total !== 1 ? "s" : ""} total
            </span>
          </div>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <SummaryCard
          label="Total In"
          value={formatGHS(summary.totalCredits)}
          icon={TrendingUp}
          colorClass="text-emerald-600 dark:text-emerald-400"
          bgClass="bg-emerald-50 dark:bg-emerald-500/10"
          sub="All credits"
        />
        <SummaryCard
          label="Total Out"
          value={formatGHS(summary.totalDebits)}
          icon={TrendingDown}
          colorClass="text-rose-600 dark:text-rose-400"
          bgClass="bg-rose-50 dark:bg-rose-500/10"
          sub="All debits"
        />
        <SummaryCard
          label="Net Flow"
          value={formatGHS(Math.abs(netChange))}
          icon={netChange >= 0 ? TrendingUp : TrendingDown}
          colorClass={
            netChange >= 0
              ? "text-violet-600 dark:text-violet-400"
              : "text-orange-600 dark:text-orange-400"
          }
          bgClass={
            netChange >= 0
              ? "bg-violet-50 dark:bg-violet-500/10"
              : "bg-orange-50 dark:bg-orange-500/10"
          }
          sub={netChange >= 0 ? "Net positive" : "Net negative"}
        />
      </div>

      {/* ── Filter Tabs ── */}
      <div className="flex items-center gap-1 rounded-2xl border border-slate-200/70 bg-white p-1 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/60">
        <Sliders className="ml-2 h-3.5 w-3.5 shrink-0 text-slate-400" />
        {(["ALL", "CREDIT", "DEBIT"] as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => handleFilter(f)}
            className={`flex-1 rounded-xl py-1.5 text-xs font-semibold transition-all duration-200 ${
              filter === f
                ? "bg-brand-600 text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
            }`}
          >
            {f === "ALL" ? "All" : f === "CREDIT" ? "Credits" : "Debits"}
          </button>
        ))}
      </div>

      {/* ── Transaction List ── */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner className="h-8 w-8 text-brand-500" />
        </div>
      ) : transactions.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
            <Receipt className="h-7 w-7 text-slate-400" />
          </div>
          <div>
            <p className="font-semibold text-slate-700 dark:text-slate-300">
              No transactions found
            </p>
            <p className="mt-0.5 text-sm text-slate-400">
              {filter !== "ALL"
                ? "Try a different filter"
                : "Your transaction history will appear here"}
            </p>
          </div>
          {filter !== "ALL" && (
            <button
              onClick={() => handleFilter("ALL")}
              className="rounded-xl bg-brand-50 px-4 py-2 text-sm font-medium text-brand-600 hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-400 dark:hover:bg-brand-500/20"
            >
              Clear filter
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {transactions.map((tx) => (
            <TransactionCard key={tx.id} tx={tx} />
          ))}
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200/70 bg-white p-3 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/60">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Prev
          </button>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Page{" "}
            <span className="font-semibold text-slate-800 dark:text-slate-200">{page}</span> of{" "}
            <span className="font-semibold text-slate-800 dark:text-slate-200">{totalPages}</span>
          </p>

          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
