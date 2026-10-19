"use client";

import * as React from "react";
import Link from "next/link";
import {
  RotateCcw,
  Search,
  Copy,
  Check,
  ExternalLink,
  Store,
  Wallet,
  Globe,
  Code2,
  Calendar,
  RefreshCw,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/toast";
import { EmptyState, Spinner } from "@/components/shared";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";

export interface RefundedOrder {
  id: number;
  orderCode: string;
  phoneNumber: string;
  network: string;
  gbAmount: number;
  amount: number;
  status: string;
  source: string;
  isStorefront: boolean;
  createdAt: string;
  updatedAt: string;
  failureReason: string | null;
  providerReference: string | null;
  externalReference: string | null;
  paystackReference: string | null;
  storefrontCode: string | null;
  storefront: {
    id: string;
    name: string;
    slug: string;
  } | null;
  storefrontOrder: {
    seq: number;
    sellingPriceGhs: number;
    commissionGhs: number;
    customerPhone: string;
    customerEmail: string | null;
    commissionState: string;
    paidAt: string | null;
  } | null;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  latestHistoryNote: string | null;
  refundedBy: string | null;
  refundedAt: string;
}

export interface RefundedStats {
  totalRefunded: number;
  storefrontRefunded: number;
  directRefunded: number;
  totalAmountGhs: number;
  storefrontAmountGhs: number;
}

const NETWORK_CLS: Record<string, string> = {
  MTN: "bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300",
  TELECEL: "bg-red-100 text-red-800 border border-red-300 dark:bg-red-500/20 dark:text-red-300",
  AIRTELTIGO: "bg-blue-100 text-blue-800 border border-blue-300 dark:bg-blue-500/20 dark:text-blue-300",
};

function formatGhs(amount: number): string {
  return `GHS ${amount.toFixed(2)}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GH", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function RefundedOrdersTab({
  initialSource = "ALL",
}: {
  initialSource?: string;
}) {
  const { toast } = useToast();

  // Filters state
  const [sourceFilter, setSourceFilter] = React.useState<string>(initialSource);
  const [networkFilter, setNetworkFilter] = React.useState<string>("ALL");
  const [searchQuery, setSearchQuery] = React.useState<string>("");
  const [datePreset, setDatePreset] = React.useState<string>("all");
  const [startDate, setStartDate] = React.useState<string>("");
  const [endDate, setEndDate] = React.useState<string>("");
  const [page, setPage] = React.useState<number>(1);
  const [limit] = React.useState<number>(50);

  // Data state
  const [loading, setLoading] = React.useState<boolean>(true);
  const [orders, setOrders] = React.useState<RefundedOrder[]>([]);
  const [filteredStorefrontRefs, setFilteredStorefrontRefs] = React.useState<string[]>([]);
  const [stats, setStats] = React.useState<RefundedStats>({
    totalRefunded: 0,
    storefrontRefunded: 0,
    directRefunded: 0,
    totalAmountGhs: 0,
    storefrontAmountGhs: 0,
  });
  const [totalPages, setTotalPages] = React.useState<number>(1);
  const [totalCount, setTotalCount] = React.useState<number>(0);

  // Copy feedback state
  const [copiedRef, setCopiedRef] = React.useState<string | null>(null);
  const [copiedAllRef, setCopiedAllRef] = React.useState<boolean>(false);

  // Fetch refunded orders
  const fetchRefundedOrders = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (sourceFilter !== "ALL") params.set("source", sourceFilter);
      if (networkFilter !== "ALL") params.set("network", networkFilter);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());

      // Date preset logic
      if (datePreset === "today") {
        const today = new Date().toISOString().split("T")[0];
        params.set("startDate", today);
        params.set("endDate", today);
      } else if (datePreset === "7days") {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        params.set("startDate", d.toISOString().split("T")[0]);
      } else if (datePreset === "30days") {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        params.set("startDate", d.toISOString().split("T")[0]);
      } else if (datePreset === "custom") {
        if (startDate) params.set("startDate", startDate);
        if (endDate) params.set("endDate", endDate);
      }

      params.set("page", String(page));
      params.set("limit", String(limit));

      const res = await fetch(`/api/admin/refunds?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch refunded orders");
      }

      setOrders(data.orders || []);
      setFilteredStorefrontRefs(data.filteredStorefrontRefs || []);
      if (data.stats) setStats(data.stats);
      if (data.pagination) {
        setTotalPages(data.pagination.totalPages || 1);
        setTotalCount(data.pagination.totalCount || 0);
      }
    } catch (err: any) {
      toast(err?.message || "Failed to load refunded orders", "error");
    } finally {
      setLoading(false);
    }
  }, [sourceFilter, networkFilter, searchQuery, datePreset, startDate, endDate, page, limit, toast]);

  React.useEffect(() => {
    fetchRefundedOrders();
  }, [fetchRefundedOrders]);

  // Handle single copy
  const handleCopySingle = (ref: string) => {
    navigator.clipboard.writeText(ref);
    setCopiedRef(ref);
    toast(`Copied Paystack reference: ${ref}`, "success");
    setTimeout(() => setCopiedRef(null), 2500);
  };

  // Handle bulk copy of all storefront refs
  const handleCopyAllRefs = () => {
    if (filteredStorefrontRefs.length === 0) {
      toast("No Paystack references available to copy.", "error");
      return;
    }
    navigator.clipboard.writeText(filteredStorefrontRefs.join("\n"));
    setCopiedAllRef(true);
    toast(
      `Copied ${filteredStorefrontRefs.length} Paystack reference(s) to clipboard.`,
      "success"
    );
    setTimeout(() => setCopiedAllRef(false), 3000);
  };

  return (
    <div className="space-y-5">
      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Refunded */}
        <Card className="p-4 shadow-xs border-violet-200/60 dark:border-violet-500/20 bg-gradient-to-br from-violet-50/50 via-white to-white dark:from-violet-950/20 dark:via-[#0c1322] dark:to-[#0c1322]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-violet-900 dark:text-violet-300">
              Total Refunded Orders
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
              <RotateCcw className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {stats.totalRefunded}
            </span>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              ({formatGhs(stats.totalAmountGhs)})
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Across Storefront, Direct Web &amp; API orders
          </p>
        </Card>

        {/* Storefront Orders */}
        <Card
          onClick={() => {
            setSourceFilter("STOREFRONT");
            setPage(1);
          }}
          className={cn(
            "p-4 shadow-xs cursor-pointer transition border-amber-200/80 dark:border-amber-500/20 bg-gradient-to-br from-amber-50/50 via-white to-white dark:from-amber-950/20 dark:via-[#0c1322] dark:to-[#0c1322]",
            sourceFilter === "STOREFRONT"
              ? "ring-2 ring-amber-500 dark:ring-amber-400 shadow-md"
              : "hover:border-amber-300 dark:hover:border-amber-500/40"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
              <Store className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              <span>Storefront Orders</span>
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
              <span className="text-xs font-bold">PS</span>
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {stats.storefrontRefunded}
            </span>
            <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
              ({formatGhs(stats.storefrontAmountGhs)})
            </span>
          </div>
          <p className="mt-1 text-[11px] font-medium text-amber-800 dark:text-amber-300">
            ⚠️ Paystack manual refund required
          </p>
        </Card>

        {/* Direct / User Wallet Orders */}
        <Card
          onClick={() => {
            setSourceFilter("WEB");
            setPage(1);
          }}
          className={cn(
            "p-4 shadow-xs cursor-pointer transition border-emerald-200/80 dark:border-emerald-500/20 bg-gradient-to-br from-emerald-50/50 via-white to-white dark:from-emerald-950/20 dark:via-[#0c1322] dark:to-[#0c1322]",
            sourceFilter === "WEB"
              ? "ring-2 ring-emerald-500 dark:ring-emerald-400 shadow-md"
              : "hover:border-emerald-300 dark:hover:border-emerald-500/40"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Direct Web Orders</span>
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
              <Globe className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {stats.directRefunded}
            </span>
          </div>
          <p className="mt-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
            ✓ Auto-refunded to customer wallet
          </p>
        </Card>

        {/* Paystack Quick Action Card */}
        <Card className="p-4 shadow-xs border-blue-200/80 dark:border-blue-500/20 bg-gradient-to-br from-blue-50/50 via-white to-white dark:from-blue-950/20 dark:via-[#0c1322] dark:to-[#0c1322] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-900 dark:text-blue-300">
              Paystack Portal
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300">
              <ExternalLink className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
              Copy customer Paystack references then execute refund on the Paystack dashboard.
            </p>
          </div>
          <div className="mt-3">
            <a
              href="https://dashboard.paystack.com/#/transactions"
              target="_blank"
              rel="noreferrer"
              className="w-full inline-block"
            >
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs gap-1.5 font-medium border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-500/30 dark:text-blue-300 dark:hover:bg-blue-950/40"
              >
                <span>Go to Paystack Dashboard</span>
                <ExternalLink className="h-3 w-3" />
              </Button>
            </a>
          </div>
        </Card>
      </div>

      {/* Main Filter & Action Bar */}
      <Card className="p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Source Filter Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setSourceFilter("ALL");
                setPage(1);
              }}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5",
                sourceFilter === "ALL"
                  ? "bg-brand-600 text-white shadow-xs dark:bg-brand-500"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              )}
            >
              <span>All Sources</span>
              <span className="rounded-full bg-black/10 px-1.5 py-0.2 text-[10px] font-bold dark:bg-white/20">
                {stats.totalRefunded}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSourceFilter("STOREFRONT");
                setPage(1);
              }}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5",
                sourceFilter === "STOREFRONT"
                  ? "bg-amber-600 text-white shadow-xs dark:bg-amber-500"
                  : "bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30"
              )}
            >
              <Store className="h-3.5 w-3.5" />
              <span>Storefront Only</span>
              <span className="rounded-full bg-amber-200/70 dark:bg-amber-400/20 px-1.5 py-0.2 text-[10px] font-bold text-amber-900 dark:text-amber-200">
                {stats.storefrontRefunded}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSourceFilter("WEB");
                setPage(1);
              }}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5",
                sourceFilter === "WEB"
                  ? "bg-emerald-600 text-white shadow-xs dark:bg-emerald-500"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              )}
            >
              <Globe className="h-3.5 w-3.5" />
              <span>Direct Web</span>
              <span className="rounded-full bg-black/10 px-1.5 py-0.2 text-[10px] font-bold dark:bg-white/20">
                {stats.directRefunded}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSourceFilter("API");
                setPage(1);
              }}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5",
                sourceFilter === "API"
                  ? "bg-purple-600 text-white shadow-xs dark:bg-purple-500"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              )}
            >
              <Code2 className="h-3.5 w-3.5" />
              <span>API Orders</span>
            </button>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Copy All Storefront Paystack References */}
            {filteredStorefrontRefs.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyAllRefs}
                className={cn(
                  "gap-1.5 text-xs font-semibold transition",
                  copiedAllRef
                    ? "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300"
                    : "border-amber-300 bg-amber-50/60 text-amber-800 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
                )}
              >
                {copiedAllRef ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Copied {filteredStorefrontRefs.length} References!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" />
                    <span>Copy All Storefront Refs ({filteredStorefrontRefs.length})</span>
                  </>
                )}
              </Button>
            )}

            {/* Refresh Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchRefundedOrders()}
              disabled={loading}
              className="gap-1.5 text-xs"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              <span>Refresh</span>
            </Button>
          </div>
        </div>

        {/* Secondary Filters: Network, Date & Search */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
          {/* Search Box */}
          <div className="lg:col-span-5 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search phone, Paystack ref, order ID, email, storefront name..."
              className="h-8.5 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs outline-none transition focus:border-brand-500 dark:border-white/10 dark:bg-[#0d1526] dark:text-slate-200"
            />
          </div>

          {/* Network Filter */}
          <div className="lg:col-span-2">
            <select
              value={networkFilter}
              onChange={(e) => {
                setNetworkFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by Network"
              className="h-8.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none transition focus:border-brand-500 dark:border-white/10 dark:bg-[#0d1526] dark:text-slate-200"
            >
              <option value="ALL">All Networks</option>
              <option value="MTN">MTN</option>
              <option value="TELECEL">Telecel</option>
              <option value="AIRTELTIGO">AirtelTigo</option>
            </select>
          </div>

          {/* Date Presets */}
          <div className="lg:col-span-2">
            <select
              value={datePreset}
              onChange={(e) => {
                setDatePreset(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by Date"
              className="h-8.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none transition focus:border-brand-500 dark:border-white/10 dark:bg-[#0d1526] dark:text-slate-200"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="7days">Past 7 Days</option>
              <option value="30days">Past 30 Days</option>
              <option value="custom">Custom Date Range</option>
            </select>
          </div>

          {/* Custom Date Inputs */}
          {datePreset === "custom" && (
            <div className="lg:col-span-3 flex items-center gap-1.5">
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPage(1);
                }}
                className="h-8.5 w-1/2 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-medium outline-none dark:border-white/10 dark:bg-[#0d1526] dark:text-slate-200"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPage(1);
                }}
                className="h-8.5 w-1/2 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-medium outline-none dark:border-white/10 dark:bg-[#0d1526] dark:text-slate-200"
              />
            </div>
          )}
        </div>
      </Card>

      {/* Main Table Card */}
      <Card className="shadow-xs overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Spinner className="h-6 w-6 text-brand-600" />
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Loading refunded orders registry…
            </span>
          </div>
        ) : orders.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={RotateCcw}
              title="No refunded orders found"
              description={
                sourceFilter === "STOREFRONT"
                  ? "There are currently no refunded storefront orders matching your filters."
                  : "No orders with REFUNDED status matched your current filter criteria."
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-white/5 dark:bg-white/5 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Order ID &amp; Date</th>
                  <th className="px-4 py-3">Source / Store</th>
                  <th className="px-4 py-3">Recipient &amp; Customer</th>
                  <th className="px-4 py-3">Package</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">
                    <span className="flex items-center gap-1">
                      <span>Paystack Reference</span>
                      <span className="rounded bg-amber-100 px-1 py-0.2 text-[9px] font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                        STOREFRONT
                      </span>
                    </span>
                  </th>
                  <th className="px-4 py-3">Refund Reason / Feedback</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {orders.map((o) => {
                  const isCopied = copiedRef === o.paystackReference;

                  return (
                    <tr
                      key={o.id}
                      className={cn(
                        "transition hover:bg-slate-50/80 dark:hover:bg-white/5",
                        o.isStorefront && "bg-amber-50/20 dark:bg-amber-500/5"
                      )}
                    >
                      {/* Order ID & Date */}
                      <td className="px-4 py-3 font-medium">
                        <div className="flex flex-col">
                          <Link
                            href={`/admin/orders?search=${o.id}`}
                            className="font-bold text-brand-600 hover:underline dark:text-brand-400"
                          >
                            {o.orderCode}
                          </Link>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">
                            {formatDate(o.createdAt)}
                          </span>
                        </div>
                      </td>

                      {/* Source & Storefront details */}
                      <td className="px-4 py-3">
                        {o.isStorefront ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-900/40 dark:text-amber-300 w-fit">
                              <Store className="h-3 w-3" />
                              <span>Storefront</span>
                            </span>
                            {o.storefront && (
                              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[150px]">
                                {o.storefront.name}
                              </span>
                            )}
                            {o.storefrontCode && (
                              <span className="text-[10px] text-slate-400 font-mono">
                                {o.storefrontCode}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300 w-fit">
                            <Globe className="h-3 w-3" />
                            <span>{o.source || "WEB"}</span>
                          </span>
                        )}
                      </td>

                      {/* Recipient & Customer */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-900 dark:text-white font-mono">
                            {o.phoneNumber}
                          </span>
                          {o.isStorefront && o.storefrontOrder?.customerEmail && (
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[180px]">
                              {o.storefrontOrder.customerEmail}
                            </span>
                          )}
                          {!o.isStorefront && o.user?.name && (
                            <span className="text-[10px] text-slate-500 dark:text-slate-400">
                              {o.user.name} ({o.user.email})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Network & Size */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                              NETWORK_CLS[o.network] || "bg-slate-100 text-slate-700"
                            )}
                          >
                            {o.network}
                          </span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {o.gbAmount} GB
                          </span>
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                        {formatGhs(o.amount)}
                      </td>

                      {/* Paystack Reference (Storefront) */}
                      <td className="px-4 py-3">
                        {o.isStorefront && o.paystackReference ? (
                          <div className="flex items-center gap-1.5">
                            <div className="flex items-center gap-1 rounded-md border border-amber-300/80 bg-amber-50 px-2 py-1 font-mono text-xs font-bold text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200">
                              <span>{o.paystackReference}</span>
                            </div>

                            {/* 1-Click Copy Reference Button */}
                            <button
                              type="button"
                              onClick={() => handleCopySingle(o.paystackReference!)}
                              title="Copy Paystack Reference"
                              className={cn(
                                "flex h-7 w-7 items-center justify-center rounded-md border transition cursor-pointer shrink-0",
                                isCopied
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300"
                                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:bg-[#0c1322] dark:text-slate-300 dark:hover:bg-white/10"
                              )}
                            >
                              {isCopied ? (
                                <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>

                            {/* Link to Paystack Search */}
                            <a
                              href={`https://dashboard.paystack.com/#/transactions?q=${encodeURIComponent(
                                o.paystackReference
                              )}`}
                              target="_blank"
                              rel="noreferrer"
                              title="Search this transaction on Paystack"
                              className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:bg-[#0c1322] dark:text-slate-300 dark:hover:bg-white/10 shrink-0"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                            <Wallet className="h-3.5 w-3.5 shrink-0" />
                            <span>Wallet Auto-Refund</span>
                          </span>
                        )}
                      </td>

                      {/* Refund Reason / API Feedback */}
                      <td className="px-4 py-3 max-w-[220px]">
                        <div className="flex flex-col">
                          <span
                            className="text-[11px] text-slate-700 dark:text-slate-300 truncate"
                            title={o.failureReason || o.latestHistoryNote || "Refunded"}
                          >
                            {o.failureReason || o.latestHistoryNote || "Refunded"}
                          </span>
                          {o.providerReference && (
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono truncate">
                              {o.providerReference}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        {o.isStorefront && o.paystackReference ? (
                          <div className="flex items-center justify-end gap-1">
                            <a
                              href={`https://dashboard.paystack.com/#/transactions?q=${encodeURIComponent(
                                o.paystackReference
                              )}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[11px] gap-1 text-amber-800 border-amber-300 hover:bg-amber-50 dark:text-amber-300 dark:border-amber-500/30"
                              >
                                <span>Refund on Paystack</span>
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                            </a>
                          </div>
                        ) : (
                          <Link href={`/admin/orders?search=${o.id}`}>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]">
                              View Order
                            </Button>
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-4 py-3 text-xs dark:border-white/5 dark:bg-white/5">
            <span className="text-slate-500 dark:text-slate-400">
              Showing {(page - 1) * limit + 1} to {Math.min(page * limit, totalCount)} of{" "}
              <strong>{totalCount}</strong> refunded order{totalCount === 1 ? "" : "s"}
            </span>

            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="h-8 gap-1 text-xs"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Previous</span>
              </Button>

              <span className="px-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                Page {page} of {totalPages}
              </span>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="h-8 gap-1 text-xs"
              >
                <span>Next</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
