"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import {
  Receipt,
  Calendar,
  RefreshCw,
  TrendingDown,
  Layers,
  Database,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  User,
  Clock,
  FileText,
  Copy,
  AlertCircle,
} from "lucide-react";

interface BillingOrderEntry {
  id?: number | string;
  number?: string;
  allocationGB?: number;
  allocationGb?: number;
  cost?: number;
  status?: string;
}

interface BillingOrder {
  id: string;
  date?: string;
  time?: string;
  timestamp?: number;
  totalCount?: number;
  totalData?: number;
  status?: string;
  cost?: number;
  estimatedCost?: number;
  entries?: BillingOrderEntry[];
}

interface BillingRefund {
  id: number | string;
  orderId: string;
  amount: number;
  reason: string;
  refundedAt: string;
}

interface BillingResponse {
  success: boolean;
  date: string;
  user?: {
    id?: number | string;
    name?: string;
    email?: string;
  } | null;
  totalAmount: number;
  totalRefunds: number;
  netAmount: number;
  totalDataGb: number;
  ordersCount: number;
  refundsCount: number;
  orders: BillingOrder[];
  refunds: BillingRefund[];
  raw?: unknown;
  error?: string;
}

export function ClickyfiedBillingChecker({ className = "" }: { className?: string }) {
  const { toast } = useToast();

  const getTodayStr = () => new Date().toISOString().slice(0, 10);
  const getYesterdayStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  };
  const getDaysAgoStr = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  };

  const [date, setDate] = React.useState<string>(getTodayStr());
  const [loading, setLoading] = React.useState<boolean>(false);
  const [data, setData] = React.useState<BillingResponse | null>(null);
  const [activeTab, setActiveTab] = React.useState<"orders" | "refunds" | "raw">("orders");
  const [expandedOrders, setExpandedOrders] = React.useState<Record<string, boolean>>({});

  const fetchBilling = async (targetDate = date) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/provider-apis/clickyfied-billing?date=${encodeURIComponent(targetDate)}`
      );
      const json: BillingResponse = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Failed to fetch billing for ${targetDate}`);
      }
      setData(json);
      // Default to orders tab, or refunds tab if no orders but refunds exist
      if ((json.orders?.length ?? 0) === 0 && (json.refunds?.length ?? 0) > 0) {
        setActiveTab("refunds");
      } else {
        setActiveTab("orders");
      }
      toast(
        `Loaded Clickyfied bill for ${targetDate}: GHS ${json.netAmount.toFixed(2)}`,
        "success"
      );
    } catch (err: any) {
      toast(err.message || "Failed to query Clickyfied billing", "error");
    } finally {
      setLoading(false);
    }
  };

  const toggleOrderExpand = (orderId: string) => {
    setExpandedOrders((prev) => ({
      ...prev,
      [orderId]: !prev[orderId],
    }));
  };

  const copyJson = () => {
    if (!data?.raw) return;
    navigator.clipboard.writeText(JSON.stringify(data.raw, null, 2));
    toast("Billing JSON copied to clipboard", "info");
  };

  const avgCostPerGb =
    data && data.totalDataGb > 0
      ? (data.netAmount / data.totalDataGb).toFixed(2)
      : null;

  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-5 ${className}`}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
            <Receipt className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Action 8: Daily Billing & Bill Inquiry
              </h3>
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300">
                Clickyfied API
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Query Clickyfied&apos;s <code className="px-1 bg-slate-100 dark:bg-slate-800 rounded font-mono text-[11px]">GET /api/public/v1/billing/current?date=YYYY-MM-DD</code> endpoint to inspect total data, orders, and total cost billed for any specific day.
            </p>
          </div>
        </div>
      </div>

      {/* Date Controls & Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 bg-slate-50/70 p-3 sm:p-3.5 rounded-xl border border-slate-200/70 dark:bg-slate-800/40 dark:border-white/5">
        <div className="space-y-1.5 flex-1 min-w-0">
          <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            Select Billing Date
          </Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 font-mono text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10 w-full"
          />
        </div>

        {/* Quick Presets */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              const d = getTodayStr();
              setDate(d);
              fetchBilling(d);
            }}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition shrink-0 ${
              date === getTodayStr()
                ? "bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/60 dark:border-indigo-800 dark:text-indigo-300"
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:border-white/10 dark:text-slate-300"
            }`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => {
              const d = getYesterdayStr();
              setDate(d);
              fetchBilling(d);
            }}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition shrink-0 ${
              date === getYesterdayStr()
                ? "bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/60 dark:border-indigo-800 dark:text-indigo-300"
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:border-white/10 dark:text-slate-300"
            }`}
          >
            Yesterday
          </button>
          <button
            type="button"
            onClick={() => {
              const d = getDaysAgoStr(2);
              setDate(d);
              fetchBilling(d);
            }}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition shrink-0 ${
              date === getDaysAgoStr(2)
                ? "bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/60 dark:border-indigo-800 dark:text-indigo-300"
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:border-white/10 dark:text-slate-300"
            }`}
          >
            2 Days Ago
          </button>
        </div>

        <Button
          type="button"
          onClick={() => fetchBilling(date)}
          disabled={loading || !date}
          className="w-full sm:w-auto h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Fetching Bill…" : "Check Bill for Date"}
        </Button>
      </div>

      {/* Results View */}
      {data && (
        <div className="space-y-4 pt-1 animate-in fade-in duration-200">
          {/* Top Summary Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            {/* Net Amount */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 sm:p-4 dark:border-emerald-900/60 dark:bg-emerald-950/30">
              <div className="flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-400 font-medium">
                <span>Net Total Bill</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              </div>
              <div className="mt-1.5 sm:mt-2 text-lg sm:text-2xl font-bold font-mono text-emerald-900 dark:text-emerald-200 truncate">
                GHS {data.netAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="mt-1 text-[10px] sm:text-[11px] text-emerald-700/80 dark:text-emerald-400/80 truncate">
                Payable after refunds ({data.date})
              </p>
            </div>

            {/* Total Data Volume */}
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 sm:p-4 dark:border-indigo-900/60 dark:bg-indigo-950/30">
              <div className="flex items-center justify-between text-xs text-indigo-800 dark:text-indigo-400 font-medium">
                <span>Total Data Volume</span>
                <Database className="h-4 w-4 text-indigo-600 shrink-0" />
              </div>
              <div className="mt-1.5 sm:mt-2 text-lg sm:text-2xl font-bold font-mono text-indigo-900 dark:text-indigo-200 truncate">
                {data.totalDataGb.toLocaleString()} <span className="text-xs sm:text-sm font-normal text-indigo-600">GB</span>
              </div>
              <p className="mt-1 text-[10px] sm:text-[11px] text-indigo-700/80 dark:text-indigo-400/80 truncate">
                {data.ordersCount} batch order{data.ordersCount === 1 ? "" : "s"} submitted
              </p>
            </div>

            {/* Gross Cost */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4 dark:border-white/10 dark:bg-slate-800/40">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
                <span>Gross Order Cost</span>
                <Layers className="h-4 w-4 text-slate-400 shrink-0" />
              </div>
              <div className="mt-1.5 sm:mt-2 text-lg sm:text-2xl font-bold font-mono text-slate-900 dark:text-white truncate">
                GHS {data.totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="mt-1 text-[10px] sm:text-[11px] text-slate-500 truncate">
                {avgCostPerGb ? `~GHS ${avgCostPerGb} / GB avg` : "Total orders cost"}
              </p>
            </div>

            {/* Total Refunds */}
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 sm:p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
              <div className="flex items-center justify-between text-xs text-amber-800 dark:text-amber-400 font-medium">
                <span>Total Refunds</span>
                <TrendingDown className="h-4 w-4 text-amber-600 shrink-0" />
              </div>
              <div className="mt-1.5 sm:mt-2 text-lg sm:text-2xl font-bold font-mono text-amber-900 dark:text-amber-200 truncate">
                GHS {data.totalRefunds.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="mt-1 text-[10px] sm:text-[11px] text-amber-700/80 dark:text-amber-400/80 truncate">
                {data.refundsCount} refund transaction{data.refundsCount === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          {/* Account Details Banner */}
          {data.user && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-100/70 border border-slate-200 text-xs text-slate-600 dark:bg-slate-800/50 dark:border-white/10 dark:text-slate-300">
              <div className="flex items-center gap-2 min-w-0">
                <User className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                <span className="truncate">
                  Account: <strong>{data.user.name || "Client"}</strong> ({data.user.email})
                </span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                Billing Date: <span className="font-mono font-medium">{data.date}</span>
              </div>
            </div>
          )}

          {/* Breakdown Tabs */}
          <div className="border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-slate-800/40 px-2.5 sm:px-3 py-2 gap-2 overflow-x-auto">
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveTab("orders")}
                  className={`px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                    activeTab === "orders"
                      ? "bg-white shadow-sm text-slate-900 dark:bg-slate-800 dark:text-white"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  Orders ({data.ordersCount})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("refunds")}
                  className={`px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                    activeTab === "refunds"
                      ? "bg-white shadow-sm text-slate-900 dark:bg-slate-800 dark:text-white"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  Refunds ({data.refundsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("raw")}
                  className={`px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                    activeTab === "raw"
                      ? "bg-white shadow-sm text-slate-900 dark:bg-slate-800 dark:text-white"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  Raw API JSON
                </button>
              </div>

              {activeTab === "raw" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copyJson}
                  className="h-7 text-xs shrink-0"
                >
                  <Copy className="h-3.5 w-3.5 mr-1" />
                  Copy JSON
                </Button>
              )}
            </div>

            {/* Tab 1: Orders Table */}
            {activeTab === "orders" && (
              <div className="divide-y divide-slate-100 dark:divide-white/5 max-h-[460px] overflow-y-auto">
                {data.orders.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    No orders billed on {data.date}.
                  </div>
                ) : (
                  data.orders.map((ord) => {
                    const isExpanded = !!expandedOrders[ord.id];
                    const entriesCount = ord.entries?.length || ord.totalCount || 0;
                    return (
                      <div key={ord.id} className="text-xs">
                        <div
                          onClick={() => toggleOrderExpand(ord.id)}
                          className="p-3 cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition"
                        >
                          {/* Top Row: Chevron + Order ID + Status Badge + Cost */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                              <span className="text-slate-400 shrink-0">
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </span>
                              <span className="font-mono font-semibold text-slate-900 dark:text-white text-xs truncate max-w-[140px] xs:max-w-[180px] sm:max-w-none">
                                {ord.id}
                              </span>
                              {ord.status && (
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${
                                    ord.status === "processed"
                                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                      : "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
                                  }`}
                                >
                                  {ord.status.toUpperCase()}
                                </span>
                              )}
                            </div>

                            {/* Cost on Right */}
                            <div className="font-bold font-mono text-slate-900 dark:text-white text-xs sm:text-sm shrink-0">
                              GHS {(ord.cost ?? ord.estimatedCost ?? 0).toFixed(2)}
                            </div>
                          </div>

                          {/* Sub Row: Indented Time + Entries Count + GB Volume */}
                          <div className="flex items-center justify-between mt-1 pl-5 sm:pl-6 text-[11px] text-slate-500 dark:text-slate-400">
                            <div className="flex items-center gap-2">
                              {ord.time && (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3 shrink-0 text-slate-400" />
                                  <span>{ord.time}</span>
                                </span>
                              )}
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                {entriesCount} {entriesCount === 1 ? "entry" : "entries"}
                              </span>
                            </div>

                            {/* GB volume on Right */}
                            <div className="font-semibold font-mono text-indigo-600 dark:text-indigo-400 shrink-0">
                              {ord.totalData ?? 0} GB
                            </div>
                          </div>
                        </div>

                        {/* Expanded Recipient Entries */}
                        {isExpanded && ord.entries && ord.entries.length > 0 && (
                          <div className="bg-slate-50/80 dark:bg-slate-900/80 px-3 sm:px-4 py-2.5 border-t border-slate-100 dark:border-white/5 space-y-1.5">
                            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 pb-1">
                              Recipient Breakdown ({ord.entries.length}):
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                              {ord.entries.map((e, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-white/5 text-[11px]"
                                >
                                  <div className="font-mono text-slate-800 dark:text-slate-200">
                                    {e.number}
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                                      {e.allocationGB ?? e.allocationGb} GB
                                    </span>
                                    {e.cost !== undefined && (
                                      <span className="text-slate-500 font-mono text-[10px]">
                                        GHS {e.cost.toFixed(2)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Tab 2: Refunds Table */}
            {activeTab === "refunds" && (
              <div className="divide-y divide-slate-100 dark:divide-white/5 max-h-[460px] overflow-y-auto">
                {data.refunds.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    No refunds recorded on {data.date}.
                  </div>
                ) : (
                  data.refunds.map((ref) => (
                    <div
                      key={ref.id}
                      className="flex items-start justify-between gap-3 p-3 text-xs hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono font-semibold text-slate-900 dark:text-white">
                            Refund #{ref.id}
                          </span>
                          <span className="font-mono text-[11px] text-slate-500 truncate max-w-[180px] sm:max-w-none">
                            ({ref.orderId})
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 break-words">
                          {ref.reason}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {ref.refundedAt}
                        </p>
                      </div>

                      <div className="font-bold font-mono text-amber-600 dark:text-amber-400 text-sm shrink-0">
                        - GHS {ref.amount.toFixed(2)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Tab 3: Raw JSON */}
            {activeTab === "raw" && (
              <div className="p-3 bg-slate-950 text-slate-100 font-mono text-[11px] max-h-[420px] overflow-auto">
                <pre>{JSON.stringify(data.raw, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
