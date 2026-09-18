"use client";

import * as React from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export type DateFilterMode = "today" | "yesterday" | "custom" | "all";

export interface DateFilterValue {
  from: string | null; // ISO string
  to: string | null;   // ISO string
  mode: DateFilterMode;
  label: string;
  selectedDate?: Date | null;
}

export function getDayRange(date: Date): { from: string; to: string } {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  return {
    from: start.toISOString(),
    to: end.toISOString(),
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
    selectedDate: today,
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
    selectedDate: yesterday,
  };
}

export function getAllTimeRange(): DateFilterValue {
  return {
    from: null,
    to: null,
    mode: "all",
    label: "All Time",
    selectedDate: null,
  };
}

export function getCustomDateRange(date: Date): DateFilterValue {
  const range = getDayRange(date);
  const formatted = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return {
    from: range.from,
    to: range.to,
    mode: "custom",
    label: formatted,
    selectedDate: date,
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
    return currentValue.selectedDate ? new Date(currentValue.selectedDate) : new Date();
  });

  // Sync internal state with prop if controlled
  React.useEffect(() => {
    if (value) {
      setCurrentValue(value);
      if (value.selectedDate) {
        setViewDate(new Date(value.selectedDate));
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

  const handleSelectToday = () => {
    const next = getTodayRange();
    setCurrentValue(next);
    setViewDate(new Date());
    onChange(next);
    setIsOpen(false);
  };

  const handleSelectYesterday = () => {
    const next = getYesterdayRange();
    setCurrentValue(next);
    if (next.selectedDate) setViewDate(new Date(next.selectedDate));
    onChange(next);
    setIsOpen(false);
  };

  const handleSelectAllTime = () => {
    const next = getAllTimeRange();
    setCurrentValue(next);
    onChange(next);
    setIsOpen(false);
  };

  const handleSelectDate = (date: Date) => {
    const today = new Date();
    const isToday =
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const isYesterday =
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear();

    let next: DateFilterValue;
    if (isToday) {
      next = getTodayRange();
    } else if (isYesterday) {
      next = getYesterdayRange();
    } else {
      next = getCustomDateRange(date);
    }

    setCurrentValue(next);
    setViewDate(new Date(date));
    onChange(next);
    setIsOpen(false);
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

  return (
    <div ref={containerRef} className={cn("relative flex flex-wrap items-center gap-1.5", className)}>
      {/* Quick Presets (Optional) */}
      {showPresets && (
        <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5 text-xs dark:border-white/10 dark:bg-white/5">
          <button
            type="button"
            onClick={handleSelectToday}
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
            onClick={handleSelectYesterday}
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
            onClick={handleSelectAllTime}
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

      {/* Main Calendar Picker Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition cursor-pointer",
          isOpen || currentValue.mode === "custom"
            ? "border-brand-500 bg-brand-50/50 text-brand-700 shadow-xs dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-300"
            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-[#0d1526] dark:text-slate-200 dark:hover:bg-white/5"
        )}
        title="Select date via calendar"
      >
        <CalendarIcon className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
        <span>{currentValue.label}</span>
      </button>

      {/* Clear filter button if not all time */}
      {currentValue.mode !== "all" && (
        <button
          type="button"
          onClick={handleSelectAllTime}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200 cursor-pointer"
          title="Reset to All Time"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Calendar Popover Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 z-50 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl dark:border-white/10 dark:bg-[#0d1526] animate-in fade-in zoom-in-95 duration-100">
          {/* Header Month / Year & Prev/Next */}
          <div className="mb-3 flex items-center justify-between">
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

          {/* Calendar Day Grid */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDayOfMonth }).map((_, idx) => (
              <div key={`empty-${idx}`} className="h-8 w-8" />
            ))}
            {days.map((d) => {
              const isToday =
                d.getDate() === today.getDate() &&
                d.getMonth() === today.getMonth() &&
                d.getFullYear() === today.getFullYear();

              const isSelected =
                currentValue.selectedDate &&
                d.getDate() === currentValue.selectedDate.getDate() &&
                d.getMonth() === currentValue.selectedDate.getMonth() &&
                d.getFullYear() === currentValue.selectedDate.getFullYear();

              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => handleSelectDate(d)}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium transition cursor-pointer",
                    isSelected
                      ? "bg-brand-600 text-white font-bold shadow-xs dark:bg-brand-500"
                      : isToday
                      ? "border border-brand-500 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/10 font-bold"
                      : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10"
                  )}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          {/* Popover Footer Shortcuts */}
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs dark:border-white/10">
            <button
              type="button"
              onClick={handleSelectToday}
              className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400 cursor-pointer"
            >
              Today
            </button>
            <button
              type="button"
              onClick={handleSelectYesterday}
              className="text-xs font-medium text-slate-500 hover:underline dark:text-slate-400 cursor-pointer"
            >
              Yesterday
            </button>
            <button
              type="button"
              onClick={handleSelectAllTime}
              className="text-xs font-medium text-slate-400 hover:underline dark:text-slate-500 cursor-pointer"
            >
              All Time
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
