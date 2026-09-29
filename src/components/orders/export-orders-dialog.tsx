"use client";

import * as React from "react";
import {
  FileSpreadsheet,
  Calendar,
  Clock,
  Filter,
  Check,
  RotateCcw,
  Download,
  AlertCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  X,
  Layers,
  Search,
  CheckSquare,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/shared";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";

export interface ExportOrdersDialogProps {
  open: boolean;
  onClose: () => void;
  initialNetwork?: string;
  initialStatus?: string;
  initialQ?: string;
  initialFrom?: string | null;
  initialTo?: string | null;
  initialBatchId?: string | null;
  initialBatchCode?: string | null;
}

type PresetMode =
  | "today"
  | "yesterday"
  | "last24h"
  | "last7"
  | "last30"
  | "month"
  | "all"
  | "custom";

const AVAILABLE_COLUMNS = [
  { key: "id", label: "Order ID" },
  { key: "date", label: "Date & Time" },
  { key: "phone", label: "Phone Number" },
  { key: "network", label: "Network" },
  { key: "gb", label: "Data Size (GB)" },
  { key: "amount", label: "Amount (GHS)" },
  { key: "status", label: "Order Status" },
  { key: "batchCode", label: "Batch Code" },
  { key: "source", label: "Order Source" },
  { key: "completedAt", label: "Delivered Time" },
  { key: "failureReason", label: "Failure / Refund Note" },
];

const NETWORKS = [
  { key: "MTN", label: "MTN", dotColor: "bg-amber-400" },
  { key: "TELECEL", label: "Telecel", dotColor: "bg-red-500" },
  { key: "AIRTELTIGO", label: "AT iShare", dotColor: "bg-blue-500" },
  { key: "AIRTELTIGO_BIGTIME", label: "AT Big Time", dotColor: "bg-indigo-500" },
];

const STATUSES = [
  { key: "SUCCESS", label: "Delivered / Success", dotColor: "bg-emerald-500" },
  { key: "PROCESSING", label: "Processing", dotColor: "bg-blue-500" },
  { key: "PENDING", label: "Pending", dotColor: "bg-amber-500" },
  { key: "REFUNDED", label: "Refunded", dotColor: "bg-purple-500" },
  { key: "FAILED", label: "Failed", dotColor: "bg-rose-500" },
];

const SOURCES = [
  { key: "ALL", label: "All Sources" },
  { key: "WEB", label: "Web Portal" },
  { key: "API", label: "API Integration" },
  { key: "STOREFRONT", label: "Storefront Orders" },
];

const GB_PRESETS = [
  { label: "Any Size", min: "", max: "" },
  { label: "1 – 5 GB", min: "1", max: "5" },
  { label: "5 – 15 GB", min: "5", max: "15" },
  { label: "15 – 50 GB", min: "15", max: "50" },
  { label: "50+ GB", min: "50", max: "" },
];

function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatLocalTime(d: Date): string {
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function toIsoTimestamp(
  dateStr: string,
  timeStr: string,
  endOfDayIfNoTime = false
): string | null {
  if (!dateStr) return null;
  const time =
    timeStr || (endOfDayIfNoTime ? "23:59:59" : "00:00:00");
  const formattedTime =
    time.length === 5 ? (endOfDayIfNoTime ? `${time}:59` : `${time}:00`) : time;
  const localDate = new Date(`${dateStr}T${formattedTime}`);
  if (isNaN(localDate.getTime())) return null;
  return localDate.toISOString();
}

export function ExportOrdersDialog({
  open,
  onClose,
  initialNetwork,
  initialStatus,
  initialQ,
  initialFrom,
  initialTo,
  initialBatchId,
  initialBatchCode,
}: ExportOrdersDialogProps) {
  const { toast } = useToast();

  // Date & Time states
  const [preset, setPreset] = React.useState<PresetMode>("today");
  const [startDate, setStartDate] = React.useState("");
  const [startTime, setStartTime] = React.useState("00:00");
  const [endDate, setEndDate] = React.useState("");
  const [endTime, setEndTime] = React.useState("23:59");

  // Filter states
  const [selectedNetworks, setSelectedNetworks] = React.useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = React.useState<string[]>([]);
  const [source, setSource] = React.useState("ALL");
  const [minGb, setMinGb] = React.useState("");
  const [maxGb, setMaxGb] = React.useState("");
  const [minAmount, setMinAmount] = React.useState("");
  const [maxAmount, setMaxAmount] = React.useState("");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [batchId, setBatchId] = React.useState("");

  // Options
  const [format, setFormat] = React.useState<"xlsx" | "csv">("xlsx");
  const [includeSummary, setIncludeSummary] = React.useState(true);
  const [selectedColumns, setSelectedColumns] = React.useState<string[]>(() =>
    AVAILABLE_COLUMNS.map((c) => c.key)
  );
  const [showColumnsSection, setShowColumnsSection] = React.useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = React.useState(false);

  // Live preview & Exporting state
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [previewData, setPreviewData] = React.useState<{
    count: number;
    totalGb: number;
    totalAmount: number;
  } | null>(null);
  const [exporting, setExporting] = React.useState(false);

  // Apply preset helper
  const applyPreset = React.useCallback((mode: PresetMode) => {
    setPreset(mode);
    const now = new Date();
    if (mode === "today") {
      const todayStr = formatLocalDate(now);
      setStartDate(todayStr);
      setStartTime("00:00");
      setEndDate(todayStr);
      setEndTime("23:59");
    } else if (mode === "yesterday") {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yStr = formatLocalDate(y);
      setStartDate(yStr);
      setStartTime("00:00");
      setEndDate(yStr);
      setEndTime("23:59");
    } else if (mode === "last24h") {
      const past24 = new Date(Date.now() - 24 * 3600 * 1000);
      setStartDate(formatLocalDate(past24));
      setStartTime(formatLocalTime(past24));
      setEndDate(formatLocalDate(now));
      setEndTime(formatLocalTime(now));
    } else if (mode === "last7") {
      const past7 = new Date(now);
      past7.setDate(past7.getDate() - 6);
      setStartDate(formatLocalDate(past7));
      setStartTime("00:00");
      setEndDate(formatLocalDate(now));
      setEndTime("23:59");
    } else if (mode === "last30") {
      const past30 = new Date(now);
      past30.setDate(past30.getDate() - 29);
      setStartDate(formatLocalDate(past30));
      setStartTime("00:00");
      setEndDate(formatLocalDate(now));
      setEndTime("23:59");
    } else if (mode === "month") {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(formatLocalDate(firstDay));
      setStartTime("00:00");
      setEndDate(formatLocalDate(now));
      setEndTime("23:59");
    } else if (mode === "all") {
      setStartDate("");
      setStartTime("");
      setEndDate("");
      setEndTime("");
    }
  }, []);

  // Initialize or reset when dialog opens
  React.useEffect(() => {
    if (!open) return;

    // Reset default options
    setFormat("xlsx");
    setIncludeSummary(true);
    setSelectedColumns(AVAILABLE_COLUMNS.map((c) => c.key));
    setShowColumnsSection(false);
    setShowAdvancedFilters(false);
    setMinGb("");
    setMaxGb("");
    setMinAmount("");
    setMaxAmount("");

    // Prefill network
    if (initialNetwork) {
      setSelectedNetworks([initialNetwork]);
    } else {
      setSelectedNetworks([]);
    }

    // Prefill status
    if (initialStatus) {
      setSelectedStatuses([initialStatus]);
    } else {
      setSelectedStatuses([]);
    }

    // Prefill search query
    setSearchQuery(initialQ || "");

    // Prefill batch ID
    setBatchId(initialBatchId || "");

    // Prefill date if provided
    if (initialFrom || initialTo) {
      setPreset("custom");
      if (initialFrom) {
        const d = new Date(initialFrom);
        setStartDate(formatLocalDate(d));
        setStartTime(formatLocalTime(d));
      } else {
        setStartDate("");
        setStartTime("");
      }
      if (initialTo) {
        const d = new Date(initialTo);
        setEndDate(formatLocalDate(d));
        setEndTime(formatLocalTime(d));
      } else {
        setEndDate("");
        setEndTime("");
      }
    } else {
      applyPreset("today");
    }
  }, [
    open,
    initialNetwork,
    initialStatus,
    initialQ,
    initialFrom,
    initialTo,
    initialBatchId,
    applyPreset,
  ]);

  // Handle escape key
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  // Construct query parameters for preview or export
  const buildParams = React.useCallback(
    (isPreview = false) => {
      const params = new URLSearchParams();
      if (isPreview) {
        params.set("preview", "true");
      } else {
        params.set("format", format);
        if (includeSummary && format === "xlsx") {
          params.set("includeSummary", "true");
        }
        if (selectedColumns.length < AVAILABLE_COLUMNS.length) {
          params.set("columns", selectedColumns.join(","));
        }
      }

      if (batchId) {
        params.set("batchId", batchId);
      }

      if (selectedNetworks.length > 0) {
        params.set("network", selectedNetworks.join(","));
      }

      if (selectedStatuses.length > 0) {
        params.set("status", selectedStatuses.join(","));
      }

      if (source !== "ALL") {
        params.set("source", source);
      }

      if (searchQuery.trim()) {
        params.set("q", searchQuery.trim());
      }

      const isoFrom = toIsoTimestamp(startDate, startTime, false);
      const isoTo = toIsoTimestamp(endDate, endTime, true);

      if (isoFrom) params.set("from", isoFrom);
      if (isoTo) params.set("to", isoTo);

      if (minGb.trim()) params.set("minGb", minGb.trim());
      if (maxGb.trim()) params.set("maxGb", maxGb.trim());

      if (minAmount.trim()) params.set("minAmount", minAmount.trim());
      if (maxAmount.trim()) params.set("maxAmount", maxAmount.trim());

      return params;
    },
    [
      format,
      includeSummary,
      selectedColumns,
      batchId,
      selectedNetworks,
      selectedStatuses,
      source,
      searchQuery,
      startDate,
      startTime,
      endDate,
      endTime,
      minGb,
      maxGb,
      minAmount,
      maxAmount,
    ]
  );

  // Debounced live preview fetch
  React.useEffect(() => {
    if (!open) return;
    let active = true;
    setPreviewLoading(true);

    const timer = setTimeout(() => {
      const params = buildParams(true);
      fetch(`/api/orders/export?${params.toString()}`)
        .then((r) => r.json())
        .then((res) => {
          if (active && res && typeof res.count === "number") {
            setPreviewData({
              count: res.count,
              totalGb: res.totalGb ?? 0,
              totalAmount: res.totalAmount ?? 0,
            });
          }
        })
        .catch(() => {})
        .finally(() => {
          if (active) setPreviewLoading(false);
        });
    }, 280);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [open, buildParams]);

  // Execute export download
  const handleExport = async () => {
    try {
      setExporting(true);
      const params = buildParams(false);
      toast(
        `Preparing your ${format.toUpperCase()} export...`,
        "info"
      );

      const res = await fetch(`/api/orders/export?${params.toString()}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to generate export file");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      const dateStamp = new Date().toISOString().slice(0, 10);
      const ext = format === "csv" ? "csv" : "xlsx";
      a.download = batchId
        ? `batch-orders-${dateStamp}.${ext}`
        : `my-orders-${dateStamp}.${ext}`;

      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast("Orders spreadsheet exported successfully!", "success");
      onClose();
    } catch (err: any) {
      toast(err.message || "Export failed. Please try again.", "error");
    } finally {
      setExporting(false);
    }
  };

  // Toggle network selection
  const toggleNetwork = (net: string) => {
    setSelectedNetworks((prev) =>
      prev.includes(net) ? prev.filter((n) => n !== net) : [...prev, net]
    );
  };

  // Toggle status selection
  const toggleStatus = (st: string) => {
    setSelectedStatuses((prev) =>
      prev.includes(st) ? prev.filter((s) => s !== st) : [...prev, st]
    );
  };

  // Toggle column selection
  const toggleColumn = (colKey: string) => {
    setSelectedColumns((prev) =>
      prev.includes(colKey)
        ? prev.filter((k) => k !== colKey)
        : [...prev, colKey]
    );
  };

  const selectAllColumns = () => {
    setSelectedColumns(AVAILABLE_COLUMNS.map((c) => c.key));
  };

  const clearAllColumns = () => {
    setSelectedColumns(["id", "phone", "network", "gb", "status"]);
  };

  // Quick time setting helpers
  const setQuickTime = (type: "full" | "morning" | "afternoon" | "evening" | "now") => {
    setPreset("custom");
    if (type === "full") {
      setStartTime("00:00");
      setEndTime("23:59");
    } else if (type === "morning") {
      setStartTime("06:00");
      setEndTime("12:00");
    } else if (type === "afternoon") {
      setStartTime("12:00");
      setEndTime("18:00");
    } else if (type === "evening") {
      setStartTime("18:00");
      setEndTime("23:59");
    } else if (type === "now") {
      const now = new Date();
      setEndTime(formatLocalTime(now));
      if (!endDate) setEndDate(formatLocalDate(now));
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 md:p-6 overflow-hidden animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden
      />

      {/* Dialog container */}
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-200/90 bg-white shadow-2xl transition-all dark:border-white/10 dark:bg-[#0d1526]"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-white/5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Export Orders to Excel
                </h2>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                  Filter & Customize
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Filter orders by exact date, time, network, volume, and choose columns.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5 dark:hover:text-slate-200"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-5 text-sm">
          {/* Active Batch notice if exporting a specific batch */}
          {batchId && (
            <div className="flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50/50 p-3 text-xs text-brand-900 dark:border-brand-900/50 dark:bg-brand-950/40 dark:text-brand-300">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                <span>
                  Filtering for Batch:{" "}
                  <strong>{initialBatchCode || batchId}</strong>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setBatchId("")}
                className="text-xs font-semibold text-brand-700 underline hover:text-brand-800 dark:text-brand-300"
              >
                Clear batch lock
              </button>
            </div>
          )}

          {/* 1. Date & Time Range Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <Calendar className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
                <span>Date & Time Filter</span>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Time accurate to the minute
              </span>
            </div>

            {/* Range Presets Row */}
            <div className="flex flex-wrap gap-1.5">
              {[
                { key: "today", label: "Today" },
                { key: "yesterday", label: "Yesterday" },
                { key: "last24h", label: "Last 24 Hours" },
                { key: "last7", label: "Last 7 Days" },
                { key: "last30", label: "Last 30 Days" },
                { key: "month", label: "This Month" },
                { key: "all", label: "All Time" },
                { key: "custom", label: "Custom Date & Time" },
              ].map((p) => {
                const isSelected = preset === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => applyPreset(p.key as PresetMode)}
                    className={cn(
                      "rounded-lg px-2.5 py-1 text-xs font-medium transition",
                      isSelected
                        ? "bg-brand-600 font-semibold text-white shadow-xs"
                        : "border border-slate-200 bg-slate-50/80 text-slate-700 hover:border-brand-300 hover:bg-slate-100 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300 dark:hover:bg-white/[0.08]"
                    )}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            {/* Inputs Container */}
            {preset !== "all" && (
              <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-3.5 dark:border-white/10 dark:bg-white/[0.02]">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {/* Start Date & Time */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                      <span>From (Start)</span>
                      <span className="text-[11px] font-normal text-slate-500">
                        Date & Time
                      </span>
                    </label>
                    <div className="grid grid-cols-5 gap-2">
                      <div className="relative col-span-3">
                        <input
                          type="date"
                          value={startDate}
                          onChange={(e) => {
                            setPreset("custom");
                            setStartDate(e.target.value);
                          }}
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none transition focus:border-brand-500 dark:border-white/10 dark:bg-[#090f1d] dark:text-slate-100"
                        />
                      </div>
                      <div className="relative col-span-2">
                        <input
                          type="time"
                          value={startTime}
                          onChange={(e) => {
                            setPreset("custom");
                            setStartTime(e.target.value);
                          }}
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none transition focus:border-brand-500 dark:border-white/10 dark:bg-[#090f1d] dark:text-slate-100"
                        />
                      </div>
                    </div>
                  </div>

                  {/* End Date & Time */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                      <span>To (End)</span>
                      <span className="text-[11px] font-normal text-slate-500">
                        Date & Time
                      </span>
                    </label>
                    <div className="grid grid-cols-5 gap-2">
                      <div className="relative col-span-3">
                        <input
                          type="date"
                          value={endDate}
                          onChange={(e) => {
                            setPreset("custom");
                            setEndDate(e.target.value);
                          }}
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none transition focus:border-brand-500 dark:border-white/10 dark:bg-[#090f1d] dark:text-slate-100"
                        />
                      </div>
                      <div className="relative col-span-2">
                        <input
                          type="time"
                          value={endTime}
                          onChange={(e) => {
                            setPreset("custom");
                            setEndTime(e.target.value);
                          }}
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none transition focus:border-brand-500 dark:border-white/10 dark:bg-[#090f1d] dark:text-slate-100"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quick Time Shortcuts */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-200/60 pt-2.5 dark:border-white/5">
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1 mr-1">
                    <Clock className="h-3 w-3" /> Quick Time:
                  </span>
                  {[
                    { label: "Full Day (00:00 - 23:59)", type: "full" },
                    { label: "Morning (06:00 - 12:00)", type: "morning" },
                    { label: "Afternoon (12:00 - 18:00)", type: "afternoon" },
                    { label: "Evening (18:00 - 23:59)", type: "evening" },
                    { label: "End at Now", type: "now" },
                  ].map((t) => (
                    <button
                      key={t.type}
                      type="button"
                      onClick={() => setQuickTime(t.type as any)}
                      className="rounded-md border border-slate-200/80 bg-white px-2 py-0.5 text-[11px] text-slate-600 hover:border-brand-300 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.08]"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 2. Network Selection Filter */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Network Provider
            </label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedNetworks([])}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                  selectedNetworks.length === 0
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                    : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-white/10 dark:bg-transparent dark:text-slate-300"
                )}
              >
                All Networks
              </button>
              {NETWORKS.map((n) => {
                const isSelected = selectedNetworks.includes(n.key);
                return (
                  <button
                    key={n.key}
                    type="button"
                    onClick={() => toggleNetwork(n.key)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                      isSelected
                        ? "border-brand-600 bg-brand-50 text-brand-900 font-semibold dark:border-brand-500 dark:bg-brand-950/50 dark:text-brand-300"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-white/10 dark:bg-transparent dark:text-slate-300"
                    )}
                  >
                    <span className={cn("h-2 w-2 rounded-full", n.dotColor)} />
                    <span>{n.label}</span>
                    {isSelected && <Check className="h-3 w-3 text-brand-600 dark:text-brand-400" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Order Status Filter */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Order Status
            </label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedStatuses([])}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                  selectedStatuses.length === 0
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                    : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-white/10 dark:bg-transparent dark:text-slate-300"
                )}
              >
                All Statuses
              </button>
              {STATUSES.map((s) => {
                const isSelected = selectedStatuses.includes(s.key);
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => toggleStatus(s.key)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                      isSelected
                        ? "border-brand-600 bg-brand-50 text-brand-900 font-semibold dark:border-brand-500 dark:bg-brand-950/50 dark:text-brand-300"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-white/10 dark:bg-transparent dark:text-slate-300"
                    )}
                  >
                    <span className={cn("h-2 w-2 rounded-full", s.dotColor)} />
                    <span>{s.label}</span>
                    {isSelected && <Check className="h-3 w-3 text-brand-600 dark:text-brand-400" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Advanced / Extra Filters Toggle */}
          <div className="border-t border-slate-100 pt-3 dark:border-white/5">
            <button
              type="button"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className="flex items-center justify-between w-full py-1 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-brand-600"
            >
              <span className="flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
                Additional Filters (Volume, Amount, Source, Phone Search)
              </span>
              {showAdvancedFilters ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>

            {showAdvancedFilters && (
              <div className="mt-3 space-y-4 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5 dark:border-white/10 dark:bg-white/[0.02]">
                {/* Search query (Phone or Reference) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Recipient Phone Number or Reference
                  </label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="e.g. 0241234567 or external reference"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-800 outline-none transition focus:border-brand-500 dark:border-white/10 dark:bg-[#090f1d] dark:text-slate-100"
                    />
                  </div>
                </div>

                {/* Source Selection */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Order Source
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {SOURCES.map((src) => (
                      <button
                        key={src.key}
                        type="button"
                        onClick={() => setSource(src.key)}
                        className={cn(
                          "rounded-lg px-2.5 py-1 text-xs font-medium transition",
                          source === src.key
                            ? "bg-slate-800 text-white font-semibold dark:bg-white dark:text-slate-900"
                            : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300"
                        )}
                      >
                        {src.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Volume GB Presets & Custom */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Data Bundle Size (GB)
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {GB_PRESETS.map((p) => {
                      const isMatch = minGb === p.min && maxGb === p.max;
                      return (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => {
                            setMinGb(p.min);
                            setMaxGb(p.max);
                          }}
                          className={cn(
                            "rounded-lg px-2.5 py-1 text-xs font-medium transition",
                            isMatch
                              ? "bg-brand-600 text-white font-semibold"
                              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300"
                          )}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <input
                      type="number"
                      placeholder="Min GB"
                      value={minGb}
                      onChange={(e) => setMinGb(e.target.value)}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-[#090f1d] dark:text-slate-100"
                    />
                    <input
                      type="number"
                      placeholder="Max GB"
                      value={maxGb}
                      onChange={(e) => setMaxGb(e.target.value)}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-[#090f1d] dark:text-slate-100"
                    />
                  </div>
                </div>

                {/* Amount Filter (GHS) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Amount Range (GHS)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Min GHS (e.g. 10.00)"
                      value={minAmount}
                      onChange={(e) => setMinAmount(e.target.value)}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-[#090f1d] dark:text-slate-100"
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Max GHS (e.g. 500.00)"
                      value={maxAmount}
                      onChange={(e) => setMaxAmount(e.target.value)}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-[#090f1d] dark:text-slate-100"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 5. Column Customization Section */}
          <div className="border-t border-slate-100 pt-3 dark:border-white/5">
            <button
              type="button"
              onClick={() => setShowColumnsSection(!showColumnsSection)}
              className="flex items-center justify-between w-full py-1 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-brand-600"
            >
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                Customize Spreadsheet Columns ({selectedColumns.length} selected)
              </span>
              {showColumnsSection ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>

            {showColumnsSection && (
              <div className="mt-2.5 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5 dark:border-white/10 dark:bg-white/[0.02] space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200/60 pb-2 dark:border-white/5 text-xs">
                  <span className="text-slate-500">Pick columns to include:</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={selectAllColumns}
                      className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300 dark:text-slate-600">·</span>
                    <button
                      type="button"
                      onClick={clearAllColumns}
                      className="text-xs font-semibold text-slate-500 hover:underline dark:text-slate-400"
                    >
                      Standard
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {AVAILABLE_COLUMNS.map((col) => {
                    const isChecked = selectedColumns.includes(col.key);
                    return (
                      <label
                        key={col.key}
                        className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleColumn(col.key)}
                          className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-700"
                        />
                        <span>{col.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 6. Format & Executive Summary Toggle */}
          <div className="border-t border-slate-100 pt-3 dark:border-white/5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              {/* File format */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Export Format:
                </span>
                <div className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-white/10">
                  <button
                    type="button"
                    onClick={() => setFormat("xlsx")}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-semibold transition",
                      format === "xlsx"
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    )}
                  >
                    Excel (.xlsx)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormat("csv")}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-semibold transition",
                      format === "csv"
                        ? "bg-slate-900 text-white shadow-xs dark:bg-white dark:text-slate-900"
                        : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    )}
                  >
                    CSV (.csv)
                  </button>
                </div>
              </div>

              {/* Summary Sheet Toggle */}
              {format === "xlsx" && (
                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeSummary}
                    onChange={(e) => setIncludeSummary(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Include Summary Overview Tab</span>
                </label>
              )}
            </div>
          </div>

          {/* 7. Live Preview Card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
                Live Matching Summary
              </span>
              {previewLoading && (
                <span className="flex items-center gap-1 text-[11px] text-slate-500">
                  <Spinner className="h-3 w-3" /> Updating…
                </span>
              )}
            </div>

            <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-white p-2.5 shadow-2xs dark:bg-[#080d19] border border-slate-100 dark:border-white/5">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Matching Orders
                </div>
                <div className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                  {previewData ? previewData.count.toLocaleString() : "—"}
                </div>
              </div>
              <div className="rounded-lg bg-white p-2.5 shadow-2xs dark:bg-[#080d19] border border-slate-100 dark:border-white/5">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Total Volume
                </div>
                <div className="text-base font-bold text-brand-600 dark:text-brand-400 mt-0.5">
                  {previewData ? `${previewData.totalGb.toFixed(1)} GB` : "—"}
                </div>
              </div>
              <div className="rounded-lg bg-white p-2.5 shadow-2xs dark:bg-[#080d19] border border-slate-100 dark:border-white/5">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Total Value
                </div>
                <div className="text-base font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {previewData
                    ? `GHS ${previewData.totalAmount.toFixed(2)}`
                    : "—"}
                </div>
              </div>
            </div>

            {previewData && previewData.count === 0 && (
              <div className="mt-2.5 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>
                  No orders match this specific filter criteria. Adjust your date range or filters.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex shrink-0 items-center justify-between border-t border-slate-100 px-5 py-3.5 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02]">
          <button
            type="button"
            onClick={() => {
              applyPreset("today");
              setSelectedNetworks([]);
              setSelectedStatuses([]);
              setSource("ALL");
              setMinGb("");
              setMaxGb("");
              setMinAmount("");
              setMaxAmount("");
              setSearchQuery("");
            }}
            className="flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset Filters</span>
          </button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={exporting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleExport}
              disabled={
                exporting || (previewData !== null && previewData.count === 0)
              }
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs"
            >
              {exporting ? (
                <>
                  <Spinner className="h-3.5 w-3.5" />
                  <span>Exporting…</span>
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  <span>
                    Download {format === "csv" ? "CSV" : "Excel"}
                    {previewData && previewData.count > 0
                      ? ` (${previewData.count})`
                      : ""}
                  </span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
