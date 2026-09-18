"use client";

import * as React from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type DateFilterMode = "today" | "yesterday" | "last7" | "last30" | "month" | "custom" | "all";

export interface DateFilterValue {
  from: string | null; // ISO string
  to: string | null;   // ISO string
  mode: DateFilterMode;
  label: string;
  startDate?: Date | null;
  endDate?: Date | null;
}

export function getDayRange(date: Date): { from: string; to: string } {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  return {
    from: start.toISOString(),
    to: end.toISOString(),
  };
}

export function getDateRange(startDate: Date, endDate: Date): { from: string; to: string } {
  const s = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0, 0);
  const e = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999);
  return {
    from: s.toISOString(),
    to: e.toISOString(),
  };
}

export function getTodayRange(): DateFilterValue {
  const today = new Date();
  const range = getDayRange(today);
  const formatted = today.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return {
    from: range.from,
    to: range.to,
    mode: "today",
    label: `Today (${formatted})`,
    startDate: today,
    endDate: today,
  };
}

export function getYesterdayRange(): DateFilterValue {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const range = getDayRange(yesterday);
  const formatted = yesterday.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return {
    from: range.from,
    to: range.to,
    mode: "yesterday",
    label: `Yesterday (${formatted})`,
    startDate: yesterday,
    endDate: yesterday,
  };
}

export function getLast7DaysRange(): DateFilterValue {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 6);
  const range = getDateRange(start, today);
  return {
    from: range.from,
    to: range.to,
    mode: "last7",
    label: "Last 7 Days",
    startDate: start,
    endDate: today,
  };
}

export function getLast30DaysRange(): DateFilterValue {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 29);
  const range = getDateRange(start, today);
  return {
    from: range.from,
    to: range.to,
    mode: "last30",
    label: "Last 30 Days",
    startDate: start,
    endDate: today,
  };
}

export function getThisMonthRange(): DateFilterValue {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const range = getDateRange(start, today);
  return {
    from: range.from,
    to: range.to,
    mode: "month",
    label: "This Month",
    startDate: start,
    endDate: today,
  };
}

export function getAllTimeRange(): DateFilterValue {
  return {
    from: null,
    to: null,
    mode: "all",
    label: "All Time",
    startDate: null,
    endDate: null,
  };
}

export function formatRangeLabel(start: Date, end: Date): string {
  const isSameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();

  if (isSameDay) {
    return start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  const sStr = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const eStr = end.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: start.getFullYear() !== end.getFullYear() ? "numeric" : undefined,
  });
  return `${sStr} – ${eStr}`;
}

export function getCustomRangeValue(startDate: Date, endDate: Date): DateFilterValue {
  const range = getDateRange(startDate, endDate);
  const label = formatRangeLabel(startDate, endDate);
  return {
    from: range.from,
    to: range.to,
    mode: "custom",
    label,
    startDate,
    endDate,
  };
}

interface OrderDateFilterProps {
  value?: DateFilterValue;
  onChange: (val: DateFilterValue) => void;
  className?: string;
  showPresets?: boolean;
}

export function OrderDateFilter({
  value,
  onChange,
  className,
  showPresets = true,
}: OrderDateFilterProps) {
  const [currentValue, setCurrentValue] = React.useState<DateFilterValue>(() => value ?? getTodayRange());
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Month navigation in calendar popover
  const [viewDate, setViewDate] = React.useState<Date>(() => {
    return currentValue.startDate ? new Date(currentValue.startDate) : new Date();
  });

  // Range selection staging states
  const [rangeStart, setRangeStart] = React.useState<Date | null>(currentValue.startDate ?? null);
  const [rangeEnd, setRangeEnd] = React.useState<Date | null>(currentValue.endDate ?? null);
  const [hoverDate, setHoverDate] = React.useState<Date | null>(null);

  // Sync internal state with prop if controlled
  React.useEffect(() => {
    if (value) {
      setCurrentValue(value);
      setRangeStart(value.startDate ?? null);
      setRangeEnd(value.endDate ?? null);
      if (value.startDate) {
        setViewDate(new Date(value.startDate));
      }
    }
  }, [value]);

  // Close calendar popover on click outside
  React.useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const applyRange = (start: Date, end: Date) => {
    const sortedStart = start <= end ? start : end;
    const sortedEnd = start <= end ? end : start;

    const today = new Date();
    const isTodaySingle =
      sortedStart.getTime() === sortedEnd.getTime() &&
      sortedStart.getDate() === today.getDate() &&
      sortedStart.getMonth() === today.getMonth() &&
      sortedStart.getFullYear() === today.getFullYear();

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const isYesterdaySingle =
      sortedStart.getTime() === sortedEnd.getTime() &&
      sortedStart.getDate() === yesterday.getDate() &&
      sortedStart.getMonth() === yesterday.getMonth() &&
      sortedStart.getFullYear() === yesterday.getFullYear();

    let next: DateFilterValue;
    if (isTodaySingle) {
      next = getTodayRange();
    } else if (isYesterdaySingle) {
      next = getYesterdayRange();
    } else {
      next = getCustomRangeValue(sortedStart, sortedEnd);
    }

    setCurrentValue(next);
    setRangeStart(sortedStart);
    setRangeEnd(sortedEnd);
    onChange(next);
    setIsOpen(false);
  };

  const handleSelectPreset = (presetFn: () => DateFilterValue) => {
    const next = presetFn();
    setCurrentValue(next);
    setRangeStart(next.startDate ?? null);
    setRangeEnd(next.endDate ?? null);
    if (next.startDate) setViewDate(new Date(next.startDate));
    onChange(next);
    setIsOpen(false);
  };

  const handleDayClick = (clickedDate: Date) => {
    if (!rangeStart || (rangeStart && rangeEnd)) {
      // First click: start new range
      setRangeStart(clickedDate);
      setRangeEnd(null);
    } else {
      // Second click: complete range
      applyRange(rangeStart, clickedDate);
    }
  };

  // Calendar calculations
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const days: Date[] = [];
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(new Date(year, month, i));
  }

  const today = new Date();

  // Helper to format Date for input[type="date"]
  const toDateInputVal = (d: Date | null | undefined) => {
    if (!d) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const fromDateInputVal = (val: string): Date | null => {
    if (!val) return null;
    const parts = val.split("-").map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      return new Date(parts[0], parts[1] - 1, parts[2]);
    }
    return null;
  };

  return (
    <div ref={containerRef} className={cn("relative flex flex-wrap items-center gap-1.5", className)}>
      {/* Quick Presets Pills */}
      {showPresets && (
        <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5 text-xs dark:border-white/10 dark:bg-white/5">
          <button
            type="button"
            onClick={() => handleSelectPreset(getTodayRange)}
            className={cn(
              "rounded-md px-2.5 py-1 font-medium transition cursor-pointer",
              currentValue.mode === "today"
                ? "bg-brand-600 text-white shadow-xs dark:bg-brand-500"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
            )}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => handleSelectPreset(getYesterdayRange)}
            className={cn(
              "rounded-md px-2.5 py-1 font-medium transition cursor-pointer",
              currentValue.mode === "yesterday"
                ? "bg-brand-600 text-white shadow-xs dark:bg-brand-500"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
            )}
          >
            Yesterday
          </button>
          <button
            type="button"
            onClick={() => handleSelectPreset(getLast7DaysRange)}
            className={cn(
              "hidden sm:inline-block rounded-md px-2.5 py-1 font-medium transition cursor-pointer",
              currentValue.mode === "last7"
                ? "bg-brand-600 text-white shadow-xs dark:bg-brand-500"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
            )}
          >
            7 Days
          </button>
          <button
            type="button"
            onClick={() => handleSelectPreset(getAllTimeRange)}
            className={cn(
              "rounded-md px-2.5 py-1 font-medium transition cursor-pointer",
              currentValue.mode === "all"
                ? "bg-brand-600 text-white shadow-xs dark:bg-brand-500"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
            )}
          >
            All Time
          </button>
        </div>
      )}

      {/* Main Calendar Range Trigger Button */}
      <button
        type="button"
        onClick={() => {
          if (!isOpen) {
            setRangeStart(currentValue.startDate ?? null);
            setRangeEnd(currentValue.endDate ?? null);
            if (currentValue.startDate) setViewDate(new Date(currentValue.startDate));
          }
          setIsOpen((prev) => !prev);
        }}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition cursor-pointer",
          isOpen || currentValue.mode === "custom" || currentValue.mode === "last7" || currentValue.mode === "last30" || currentValue.mode === "month"
            ? "border-brand-500 bg-brand-50/50 text-brand-700 shadow-xs dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-300"
            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-[#0d1526] dark:text-slate-200 dark:hover:bg-white/5"
        )}
        title="Select date or range via calendar"
      >
        <CalendarIcon className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400 shrink-0" />
        <span className="truncate max-w-[200px]">{currentValue.label}</span>
      </button>

      {/* Clear filter button if not all time */}
      {currentValue.mode !== "all" && (
        <button
          type="button"
          onClick={() => handleSelectPreset(getAllTimeRange)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200 cursor-pointer"
          title="Reset to All Time"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Calendar Range Popover Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 sm:left-auto sm:right-0 z-50 mt-2 w-[310px] rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xl dark:border-white/10 dark:bg-[#0d1526] animate-in fade-in zoom-in-95 duration-100">
          {/* Quick Presets Grid in Popover */}
          <div className="mb-3 grid grid-cols-3 gap-1 border-b border-slate-100 pb-2.5 dark:border-white/10">
            <button
              type="button"
              onClick={() => handleSelectPreset(getTodayRange)}
              className={cn(
                "rounded-lg px-2 py-1 text-xs font-medium transition cursor-pointer",
                currentValue.mode === "today"
                  ? "bg-brand-600 text-white"
                  : "bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              )}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => handleSelectPreset(getYesterdayRange)}
              className={cn(
                "rounded-lg px-2 py-1 text-xs font-medium transition cursor-pointer",
                currentValue.mode === "yesterday"
                  ? "bg-brand-600 text-white"
                  : "bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              )}
            >
              Yesterday
            </button>
            <button
              type="button"
              onClick={() => handleSelectPreset(getLast7DaysRange)}
              className={cn(
                "rounded-lg px-2 py-1 text-xs font-medium transition cursor-pointer",
                currentValue.mode === "last7"
                  ? "bg-brand-600 text-white"
                  : "bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              )}
            >
              Last 7 Days
            </button>
            <button
              type="button"
              onClick={() => handleSelectPreset(getLast30DaysRange)}
              className={cn(
                "rounded-lg px-2 py-1 text-xs font-medium transition cursor-pointer",
                currentValue.mode === "last30"
                  ? "bg-brand-600 text-white"
                  : "bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              )}
            >
              Last 30 Days
            </button>
            <button
              type="button"
              onClick={() => handleSelectPreset(getThisMonthRange)}
              className={cn(
                "rounded-lg px-2 py-1 text-xs font-medium transition cursor-pointer",
                currentValue.mode === "month"
                  ? "bg-brand-600 text-white"
                  : "bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              )}
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => handleSelectPreset(getAllTimeRange)}
              className={cn(
                "rounded-lg px-2 py-1 text-xs font-medium transition cursor-pointer",
                currentValue.mode === "all"
                  ? "bg-brand-600 text-white"
                  : "bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              )}
            >
              All Time
            </button>
          </div>

          {/* Month & Year Navigation Header */}
          <div className="mb-2.5 flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">
              {viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </h4>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={prevMonth}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10 cursor-pointer"
                title="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={nextMonth}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10 cursor-pointer"
                title="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Days of Week Header */}
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-slate-400 dark:text-slate-500 mb-1">
            <span>Su</span>
            <span>Mo</span>
            <span>Tu</span>
            <span>We</span>
            <span>Th</span>
            <span>Fr</span>
            <span>Sa</span>
          </div>

          {/* Calendar Day Grid with Range Highlighting */}
          <div className="grid grid-cols-7 gap-1" onMouseLeave={() => setHoverDate(null)}>
            {Array.from({ length: firstDayOfMonth }).map((_, idx) => (
              <div key={`empty-${idx}`} className="h-8 w-8" />
            ))}
            {days.map((d) => {
              const dTime = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
              const todayTime = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
              const isToday = dTime === todayTime;

              const activeStart = rangeStart ? new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate()).getTime() : null;
              const activeEnd = rangeEnd
                ? new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate()).getTime()
                : (rangeStart && hoverDate ? new Date(hoverDate.getFullYear(), hoverDate.getMonth(), hoverDate.getDate()).getTime() : null);

              const effectiveStart = activeStart && activeEnd ? Math.min(activeStart, activeEnd) : activeStart;
              const effectiveEnd = activeStart && activeEnd ? Math.max(activeStart, activeEnd) : activeStart;

              const isStart = activeStart !== null && dTime === activeStart;
              const isEnd = activeEnd !== null && dTime === activeEnd;
              const isInRange = effectiveStart !== null && effectiveEnd !== null && dTime >= effectiveStart && dTime <= effectiveEnd;

              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => handleDayClick(d)}
                  onMouseEnter={() => {
                    if (rangeStart && !rangeEnd) {
                      setHoverDate(d);
                    }
                  }}
                  className={cn(
                    "relative flex h-8 w-8 items-center justify-center text-xs font-medium transition cursor-pointer",
                    isStart || isEnd
                      ? "rounded-lg bg-brand-600 text-white font-bold shadow-xs z-10 dark:bg-brand-500"
                      : isInRange
                      ? "bg-brand-50 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300 rounded-none first:rounded-l-lg last:rounded-r-lg"
                      : isToday
                      ? "rounded-lg border border-brand-500 text-brand-600 font-bold dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/10"
                      : "rounded-lg text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10"
                  )}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          {/* Range Selection Feedback & Manual Date Inputs */}
          <div className="mt-3 border-t border-slate-100 pt-2.5 dark:border-white/10">
            <div className="mb-2 flex items-center justify-between text-[11px]">
              <span className="text-slate-500 dark:text-slate-400 font-medium">
                {rangeStart && !rangeEnd ? (
                  <span className="text-brand-600 dark:text-brand-400 font-semibold animate-pulse">
                    Select end date...
                  </span>
                ) : (
                  "Selected range:"
                )}
              </span>
              {rangeStart && (
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {rangeEnd ? formatRangeLabel(rangeStart, rangeEnd) : rangeStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              )}
            </div>

            {/* Custom From / To Input Fields */}
            <div className="flex items-center gap-1.5 mb-2.5">
              <input
                type="date"
                value={toDateInputVal(rangeStart)}
                onChange={(e) => {
                  const d = fromDateInputVal(e.target.value);
                  if (d) {
                    setRangeStart(d);
                    if (!rangeEnd) setRangeEnd(d);
                  }
                }}
                className="h-7 w-full rounded border border-slate-200 bg-slate-50 px-1.5 text-[11px] text-slate-700 outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-300 cursor-pointer"
                title="Start date"
              />
              <ArrowRight className="h-3 w-3 text-slate-400 shrink-0" />
              <input
                type="date"
                value={toDateInputVal(rangeEnd || rangeStart)}
                onChange={(e) => {
                  const d = fromDateInputVal(e.target.value);
                  if (d) {
                    setRangeEnd(d);
                    if (!rangeStart) setRangeStart(d);
                  }
                }}
                className="h-7 w-full rounded border border-slate-200 bg-slate-50 px-1.5 text-[11px] text-slate-700 outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-300 cursor-pointer"
                title="End date"
              />
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => handleSelectPreset(getAllTimeRange)}
                className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white cursor-pointer"
              >
                Clear / All Time
              </button>
              {rangeStart && (
                <button
                  type="button"
                  onClick={() => applyRange(rangeStart, rangeEnd || rangeStart)}
                  className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-semibold text-white shadow-xs hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600 cursor-pointer"
                >
                  Apply Range
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
