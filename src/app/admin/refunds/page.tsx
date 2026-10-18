"use client";

import * as React from "react";
import Link from "next/link";
import {
  RotateCcw,
  Search,
  Copy,
  Check,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowRight,
  ClipboardList,
  Sparkles,
  Trash2,
  RefreshCw,
  Wallet,
  Store,
  FileSpreadsheet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/toast";
import { PageHeader, StatCard } from "@/components/shared";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";

interface MatchedOrder {
  orderId: number;
  orderCode: string;
  createdAt: string;
  phoneNumber: string;
  network: string;
  gbAmount: number;
  amount: number;
  status: string;
  source: string;
  isStorefront: boolean;
  storefrontReference: string | null;
  storefrontName: string | null;
  storefrontSlug: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  userName: string | null;
  userEmail: string | null;
  matchedInputLine: string;
  alreadyRefunded: boolean;
  eligibleForRefund: boolean;
}

interface UnmatchedEntry {
  originalLine: string;
  phone: string;
  gbAmount: number;
  reason: string;
}

interface ScanSummary {
  totalPasted: number;
  totalMatched: number;
  totalEligible: number;
  totalStorefront: number;
  totalDirect: number;
  totalAlreadyRefunded: number;
  totalUnmatched: number;
  totalAmountGhs: number;
}

function getTodayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getYesterdayString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const SAMPLE_TEXT = `053308873 2gb
0535308873 and the gig, so 5 attached to it
0241234567, 10GB
0509876543 plus 2GB
0551122334 1`;

export default function AdminRefundsPage() {
  const { toast } = useToast();

  const [date, setDate] = React.useState<string>(getTodayString);
  const [inputText, setInputText] = React.useState<string>("");
  const [statusFilter, setStatusFilter] = React.useState<string>("DEFAULT"); // DEFAULT | ALL
  const [scanning, setScanning] = React.useState<boolean>(false);
  const [executing, setExecuting] = React.useState<boolean>(false);

  // Scanned results
  const [scannedDate, setScannedDate] = React.useState<string | null>(null);
  const [summary, setSummary] = React.useState<ScanSummary | null>(null);
  const [matchedOrders, setMatchedOrders] = React.useState<MatchedOrder[]>([]);
  const [storefrontIds, setStorefrontIds] = React.useState<string[]>([]);
  const [unmatchedEntries, setUnmatchedEntries] = React.useState<UnmatchedEntry[]>([]);

  // Selection
  const [selectedIds, setSelectedIds] = React.useState<number[]>([]);

  // Modals & UI states
  const [confirmOpen, setConfirmOpen] = React.useState<boolean>(false);
  const [refundReason, setRefundReason] = React.useState<string>("Bulk refund scanner");
  const [copiedAll, setCopiedAll] = React.useState<boolean>(false);
  const [copiedRef, setCopiedRef] = React.useState<string | null>(null);

  // Handle Scanning
  const handleScan = async () => {
    if (!inputText.trim()) {
      toast("Please paste the phone numbers and GB sizes to scan.", "error");
      return;
    }

    setScanning(true);
    try {
      const res = await fetch("/api/admin/refunds/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: inputText,
          date,
          statusFilter:
            statusFilter === "DEFAULT" ? ["PROCESSING", "SUCCESS", "PENDING"] : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to scan database for orders.");
      }

      setScannedDate(data.scannedDate);
      setSummary(data.summary);
      setMatchedOrders(data.matchedOrders || []);
      setStorefrontIds(data.storefrontIds || []);
      setUnmatchedEntries(data.unmatchedEntries || []);

      // Auto-select all eligible orders by default
      const eligibleIds = (data.matchedOrders || [])
        .filter((o: MatchedOrder) => o.eligibleForRefund)
        .map((o: MatchedOrder) => o.orderId);
      setSelectedIds(eligibleIds);

      toast(
        `Found ${data.summary.totalMatched} matching order(s) (${data.summary.totalStorefront} storefront, ${data.summary.totalDirect} direct).`,
        "success"
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to scan orders.", "error");
    } finally {
      setScanning(false);
    }
  };

  // Toggle selection
  const handleToggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    const eligible = matchedOrders.filter((o) => o.eligibleForRefund).map((o) => o.orderId);
    if (selectedIds.length === eligible.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(eligible);
    }
  };

  // Copy Storefront IDs
  const handleCopyStorefrontIds = (format: "lines" | "csv" = "lines") => {
    if (storefrontIds.length === 0) return;
    const textToCopy = format === "csv" ? storefrontIds.join(", ") : storefrontIds.join("\n");
    navigator.clipboard.writeText(textToCopy);
    setCopiedAll(true);
    toast(
      `Copied ${storefrontIds.length} Paystack storefront reference(s) to clipboard.`,
      "success"
    );
    setTimeout(() => setCopiedAll(false), 3000);
  };

  const handleCopySingleRef = (ref: string) => {
    navigator.clipboard.writeText(ref);
    setCopiedRef(ref);
    toast(`Copied ${ref} to clipboard.`, "success");
    setTimeout(() => setCopiedRef(null), 2500);
  };

  // Execute Refund
  const handleExecuteRefund = async () => {
    if (selectedIds.length === 0) {
      toast("Please select at least one order to refund.", "error");
      return;
    }

    setExecuting(true);
    try {
      const res = await fetch("/api/admin/refunds/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: selectedIds,
          reason: refundReason,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to process refunds.");
      }

      toast(
        `${data.refundedCount} order(s) successfully marked as REFUNDED.`,
        "success"
      );

      // Update local state to show REFUNDED
      const refundedSet = new Set<number>(data.refundedOrderIds || selectedIds);
      setMatchedOrders((prev) =>
        prev.map((o) =>
          refundedSet.has(o.orderId)
            ? { ...o, status: "REFUNDED", alreadyRefunded: true, eligibleForRefund: false }
            : o
        )
      );

      // Deselect refunded orders
      setSelectedIds((prev) => prev.filter((id) => !refundedSet.has(id)));
      setConfirmOpen(false);

      // Update summary counts
      if (summary) {
        setSummary({
          ...summary,
          totalAlreadyRefunded: summary.totalAlreadyRefunded + data.refundedCount,
          totalEligible: Math.max(0, summary.totalEligible - data.refundedCount),
        });
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to execute refunds.", "error");
    } finally {
      setExecuting(false);
    }
  };

  // Selected orders breakdown
  const selectedOrdersList = matchedOrders.filter((o) => selectedIds.includes(o.orderId));
  const selectedStorefrontCount = selectedOrdersList.filter((o) => o.isStorefront).length;
  const selectedDirectCount = selectedOrdersList.filter((o) => !o.isStorefront).length;
  const selectedTotalAmount = selectedOrdersList.reduce((acc, o) => acc + o.amount, 0);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <PageHeader
        title={
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500/20 via-orange-500/20 to-red-500/20 text-amber-600 dark:text-amber-400">
              <RotateCcw className="h-5 w-5" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight">Bulk Refund Scanner</span>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-normal">
                <span>Smart phone &amp; GB scanner with Paystack storefront ID extractor</span>
              </div>
            </div>
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <Link href="/admin/orders">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <ClipboardList className="h-3.5 w-3.5" />
                <span>Orders Table</span>
              </Button>
            </Link>
            <a
              href="https://dashboard.paystack.com/#/refunds"
              target="_blank"
              rel="noreferrer"
              className="inline-flex"
            >
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <span>Paystack Refunds</span>
                <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
              </Button>
            </a>
          </div>
        }
      />

      {/* Input & Scanner Panel */}
      <Card className="p-5 shadow-xs">
        <div className="space-y-4">
          {/* Controls Bar: Date Picker, Quick Buttons & Filter */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <Calendar className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
                <span>Orders Date:</span>
              </span>

              {/* Date Input */}
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-8.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 shadow-2xs outline-none transition focus:border-brand-500 dark:border-white/10 dark:bg-[#0d1526] dark:text-slate-200"
              />

              {/* Quick Date Presets */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setDate(getTodayString())}
                  className={cn(
                    "h-8 rounded-md px-2.5 text-xs font-medium transition cursor-pointer",
                    date === getTodayString()
                      ? "bg-brand-600 text-white shadow-2xs dark:bg-brand-500"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                  )}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setDate(getYesterdayString())}
                  className={cn(
                    "h-8 rounded-md px-2.5 text-xs font-medium transition cursor-pointer",
                    date === getYesterdayString()
                      ? "bg-brand-600 text-white shadow-2xs dark:bg-brand-500"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                  )}
                >
                  Yesterday
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">Match Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-8.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 outline-none transition focus:border-brand-500 dark:border-white/10 dark:bg-[#0d1526] dark:text-slate-200"
              >
                <option value="DEFAULT">Processing &amp; Completed (Default)</option>
                <option value="ALL">All Statuses</option>
              </select>
            </div>
          </div>

          {/* Text Area */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label
                htmlFor="refund-input"
                className="text-xs font-bold text-slate-800 dark:text-slate-200"
              >
                Paste Numbers &amp; Gigabyte Amounts
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setInputText(SAMPLE_TEXT)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 cursor-pointer"
                >
                  <Sparkles className="h-3 w-3" />
                  <span>Load Sample</span>
                </button>
                {inputText && (
                  <button
                    type="button"
                    onClick={() => setInputText("")}
                    className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                  >
                    <Trash2 className="h-3 w-3" />
                    <span>Clear</span>
                  </button>
                )}
              </div>
            </div>

            <textarea
              id="refund-input"
              rows={6}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`Paste any list of numbers and GBs (e.g.):\n053308873 2gb\n0535308873 and the gig, so 5\n0241234567, 10GB\n0509876543 plus 2GB\n(Excel columns, WhatsApp texts, comma separated, or one per line)`}
              className="w-full font-mono text-xs leading-relaxed rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              💡 <strong className="font-medium text-slate-700 dark:text-slate-300">Smart Parser:</strong> Automatically recognizes phone numbers with or without leading zeros (+233/053/53...), spaces, commas, words like &quot;plus 2gb&quot;, &quot;5&quot;, &quot;five&quot;, or Excel copy-paste.
            </p>
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {inputText.trim() ? `${inputText.trim().split(/\r?\n/).length} lines entered` : "Ready to scan"}
            </span>
            <Button
              type="button"
              onClick={handleScan}
              disabled={scanning || !inputText.trim()}
              className="gap-2 px-5 font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20"
            >
              {scanning ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Scanning Database…</span>
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  <span>Scan Orders for {date}</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>

      {/* Results Section */}
      {summary && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Summary Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard
              title="Scanned Numbers"
              value={summary.totalPasted}
              hint="Parsed from text"
            />
            <StatCard
              title="Matched Orders"
              value={summary.totalMatched}
              hint={`Found on ${scannedDate}`}
            />
            <StatCard
              title="Storefront Orders"
              value={summary.totalStorefront}
              hint="Paystack checkouts"
              className="border-violet-200/80 bg-violet-50/30 dark:border-violet-500/20 dark:bg-violet-950/10"
            />
            <StatCard
              title="Direct Orders"
              value={summary.totalDirect}
              hint="Reseller / user wallet"
              className="border-blue-200/80 bg-blue-50/30 dark:border-blue-500/20 dark:bg-blue-950/10"
            />
            <StatCard
              title="Refund Value"
              value={`GHS ${summary.totalAmountGhs.toFixed(2)}`}
              hint="Eligible for refund"
              className="border-emerald-200/80 bg-emerald-50/30 dark:border-emerald-500/20 dark:bg-emerald-950/10"
            />
            <StatCard
              title="Unmatched"
              value={summary.totalUnmatched}
              hint={summary.totalUnmatched > 0 ? "Not found in DB" : "100% matched"}
              className={cn(
                summary.totalUnmatched > 0 &&
                  "border-amber-200/80 bg-amber-50/30 dark:border-amber-500/20 dark:bg-amber-950/10"
              )}
            />
          </div>

          {/* STOREFRONT PAYSTACK REFUND EXTRACTOR CARD */}
          {storefrontIds.length > 0 && (
            <Card className="p-5 border-violet-300/80 bg-gradient-to-br from-violet-500/5 via-fuchsia-500/5 to-transparent dark:border-violet-500/30 dark:bg-[#121024]">
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-md shadow-violet-500/25">
                      <Store className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span>Storefront Paystack IDs ({storefrontIds.length})</span>
                        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-extrabold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                          Ready to Copy
                        </span>
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                        These {storefrontIds.length} orders were paid on customer storefronts via Paystack. Copy these IDs to process their reversals on your Paystack dashboard.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleCopyStorefrontIds("lines")}
                      className="gap-1.5 font-bold bg-violet-600 text-white hover:bg-violet-700 shadow-sm shadow-violet-600/30 cursor-pointer"
                    >
                      {copiedAll ? (
                        <>
                          <Check className="h-4 w-4" />
                          <span>Copied All IDs!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" />
                          <span>Copy All {storefrontIds.length} IDs</span>
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyStorefrontIds("csv")}
                      className="gap-1.5 text-xs cursor-pointer"
                    >
                      <span>Comma-Separated</span>
                    </Button>
                    <a
                      href="https://dashboard.paystack.com/#/refunds"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-xs text-violet-700 hover:text-violet-800 dark:text-violet-300 cursor-pointer"
                      >
                        <span>Open Paystack</span>
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </a>
                  </div>
                </div>

                {/* Chips of Storefront IDs */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {storefrontIds.map((ref) => {
                    const isCopied = copiedRef === ref;
                    return (
                      <button
                        key={ref}
                        type="button"
                        onClick={() => handleCopySingleRef(ref)}
                        className={cn(
                          "group inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-mono font-semibold transition cursor-pointer",
                          isCopied
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-950/30 dark:text-emerald-300"
                            : "border-violet-200 bg-white text-violet-900 hover:border-violet-400 hover:bg-violet-50 dark:border-violet-500/30 dark:bg-[#1a1633] dark:text-violet-200 dark:hover:border-violet-400"
                        )}
                        title="Click to copy ID"
                      >
                        <span>{ref}</span>
                        {isCopied ? (
                          <Check className="h-3 w-3 text-emerald-600" />
                        ) : (
                          <Copy className="h-3 w-3 text-violet-400 group-hover:text-violet-700 dark:group-hover:text-violet-200" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Card>
          )}

          {/* Matched Orders Table Card */}
          <Card className="overflow-hidden shadow-xs">
            {/* Table Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/50 p-4 dark:border-white/10 dark:bg-[#0c1322]">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="select-all-orders"
                  checked={
                    matchedOrders.filter((o) => o.eligibleForRefund).length > 0 &&
                    selectedIds.length === matchedOrders.filter((o) => o.eligibleForRefund).length
                  }
                  onChange={handleSelectAll}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <label
                  htmlFor="select-all-orders"
                  className="text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer"
                >
                  Matched Orders ({matchedOrders.length})
                </label>
                {selectedIds.length > 0 && (
                  <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                    {selectedIds.length} selected (GHS {selectedTotalAmount.toFixed(2)})
                  </span>
                )}
              </div>

              {/* One-Click Bulk Refund Button */}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmOpen(true)}
                  disabled={selectedIds.length === 0 || executing}
                  className="gap-2 font-bold shadow-xs cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Refund {selectedIds.length} Selected Orders</span>
                </Button>
              </div>
            </div>

            {/* Table */}
            {matchedOrders.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                No orders matched for the provided numbers on {scannedDate}.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-white/5 dark:bg-white/5 dark:text-slate-400">
                    <tr>
                      <th className="w-10 px-4 py-3 text-center">
                        <span className="sr-only">Select</span>
                      </th>
                      <th className="px-3 py-3">Order Code</th>
                      <th className="px-3 py-3">Recipient Phone</th>
                      <th className="px-3 py-3">Network</th>
                      <th className="px-3 py-3">Size (GB)</th>
                      <th className="px-3 py-3">Amount</th>
                      <th className="px-3 py-3">Order Type</th>
                      <th className="px-3 py-3">Storefront / Paystack ID</th>
                      <th className="px-3 py-3">User / Customer</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {matchedOrders.map((order) => {
                      const isSelected = selectedIds.includes(order.orderId);
                      const isCopied = copiedRef === order.storefrontReference;

                      return (
                        <tr
                          key={order.orderId}
                          className={cn(
                            "transition-colors hover:bg-slate-50/70 dark:hover:bg-white/5",
                            order.alreadyRefunded && "opacity-60 bg-slate-50/30 dark:bg-white/[0.02]"
                          )}
                        >
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={!order.eligibleForRefund}
                              onChange={() => handleToggleSelect(order.orderId)}
                              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 disabled:opacity-30"
                            />
                          </td>

                          <td className="px-3 py-3 font-mono font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                            <Link
                              href={`/admin/orders?q=${order.orderId}`}
                              className="hover:underline hover:text-brand-600 dark:hover:text-brand-400"
                            >
                              {order.orderCode}
                            </Link>
                          </td>

                          <td className="px-3 py-3 font-mono font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                            {order.phoneNumber}
                          </td>

                          <td className="px-3 py-3 whitespace-nowrap">
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-white/10 dark:text-slate-300">
                              {order.network}
                            </span>
                          </td>

                          <td className="px-3 py-3 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                            {order.gbAmount} GB
                          </td>

                          <td className="px-3 py-3 font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                            GHS {order.amount.toFixed(2)}
                          </td>

                          <td className="px-3 py-3 whitespace-nowrap">
                            {order.isStorefront ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800 dark:bg-violet-900/30 dark:text-violet-300">
                                <Store className="h-3 w-3" />
                                <span>Storefront</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                <Wallet className="h-3 w-3" />
                                <span>Direct Wallet</span>
                              </span>
                            )}
                          </td>

                          <td className="px-3 py-3 whitespace-nowrap">
                            {order.storefrontReference ? (
                              <div className="flex items-center gap-1">
                                <span className="font-mono text-[11px] font-bold text-violet-900 dark:text-violet-200">
                                  {order.storefrontReference}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleCopySingleRef(order.storefrontReference as string)
                                  }
                                  className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200 cursor-pointer"
                                  title="Copy Paystack ID"
                                >
                                  {isCopied ? (
                                    <Check className="h-3 w-3 text-emerald-500" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500">—</span>
                            )}
                          </td>

                          <td className="px-3 py-3 text-slate-600 dark:text-slate-400 max-w-[150px] truncate">
                            {order.isStorefront
                              ? order.storefrontName || "Customer Store"
                              : order.userName || order.userEmail || "System"}
                          </td>

                          <td className="px-3 py-3 whitespace-nowrap">
                            <StatusBadge status={order.status} />
                          </td>

                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {order.alreadyRefunded ? (
                              <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                                Refunded
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedIds([order.orderId]);
                                  setConfirmOpen(true);
                                }}
                                className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline dark:text-rose-400 cursor-pointer"
                              >
                                Refund
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Unmatched / Not Found Entries Card */}
          {unmatchedEntries.length > 0 && (
            <Card className="p-5 border-amber-300/80 bg-amber-50/30 dark:border-amber-500/30 dark:bg-amber-950/10">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <h3 className="text-xs font-bold text-amber-900 dark:text-amber-300">
                    Unmatched Entries ({unmatchedEntries.length})
                  </h3>
                  <span className="text-[11px] text-amber-800 dark:text-amber-400">
                    These items were pasted but could not be located in the database on {scannedDate}.
                  </span>
                </div>

                <div className="overflow-x-auto rounded-lg border border-amber-200/80 bg-white dark:border-amber-500/20 dark:bg-[#0c1322]">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-semibold uppercase text-slate-500 dark:border-white/5 dark:bg-white/5 dark:text-slate-400">
                      <tr>
                        <th className="px-3 py-2">Phone Number</th>
                        <th className="px-3 py-2">Bundle Size</th>
                        <th className="px-3 py-2">Raw Pasted Line</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-mono text-[11px]">
                      {unmatchedEntries.map((item, idx) => (
                        <tr key={idx} className="text-slate-700 dark:text-slate-300">
                          <td className="px-3 py-2 font-bold text-slate-900 dark:text-white">
                            {item.phone}
                          </td>
                          <td className="px-3 py-2">{item.gbAmount} GB</td>
                          <td className="px-3 py-2 text-slate-500 dark:text-slate-400 truncate max-w-[250px]">
                            {item.originalLine}
                          </td>
                          <td className="px-3 py-2 text-amber-600 dark:text-amber-400 font-sans font-medium">
                            {item.reason}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Confirmation Dialog for 1-Click Refund */}
      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirm Bulk Order Refund"
        className="max-w-md"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4 text-xs text-rose-900 dark:border-rose-500/30 dark:bg-rose-950/20 dark:text-rose-200">
            <p className="font-bold text-sm mb-1">
              Are you sure you want to refund {selectedIds.length} order(s)?
            </p>
            <p className="leading-relaxed">
              This action will mark the selected orders as <strong className="font-bold">REFUNDED</strong> in the database.
            </p>
          </div>

          {/* Refund Breakdown Details */}
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-white/10 dark:bg-white/5">
            <div className="flex justify-between py-0.5">
              <span className="text-slate-500 dark:text-slate-400">Total Selected Orders:</span>
              <span className="font-bold text-slate-900 dark:text-white">{selectedIds.length}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-slate-500 dark:text-slate-400">Direct / Reseller Orders:</span>
              <span className="font-semibold text-blue-600 dark:text-blue-400">
                {selectedDirectCount} (Wallet balance will be credited)
              </span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-slate-500 dark:text-slate-400">Storefront Orders:</span>
              <span className="font-semibold text-violet-600 dark:text-violet-400">
                {selectedStorefrontCount} (Reseller commission reversed)
              </span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1.5 dark:border-white/10">
              <span className="font-semibold text-slate-700 dark:text-slate-300">Total Amount:</span>
              <span className="font-bold text-slate-900 dark:text-white">
                GHS {selectedTotalAmount.toFixed(2)}
              </span>
            </div>
          </div>

          {selectedStorefrontCount > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
              ⚠️ <strong>Paystack Note:</strong> {selectedStorefrontCount} storefront orders will be marked as REFUNDED in the database. Remember to copy their storefront IDs and execute their reversals on Paystack!
            </div>
          )}

          <div>
            <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
              Refund Reason / Admin Note:
            </label>
            <input
              type="text"
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              className="mt-1 h-8.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-[#0d1526] dark:text-white"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmOpen(false)}
              disabled={executing}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleExecuteRefund}
              disabled={executing}
              className="gap-1.5 font-bold"
            >
              {executing ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Processing Refunds…</span>
                </>
              ) : (
                <>
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Confirm &amp; Refund All</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
