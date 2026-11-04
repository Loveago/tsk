"use client";

import * as React from "react";
import {
  Calendar as CalendarIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Check,
  CalendarRange,
  CalendarDays,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ReportGranularity = "hourly" | "daily" | "monthly";

export interface ReportDateFilterValue {
  id: string;
  label: string;
  subLabel?: string;
  from: Date;
  to: Date;
  granularity: ReportGranularity;
}

interface ReportDatePickerProps {
  value: ReportDateFilterValue;
  onChange: (val: ReportDateFilterValue) => void;
  className?: string;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function toInputDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromInputDate(str: string): Date | null {
  if (!str) return null;
  const parts = str.split("-").map(Number);
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  return null;
}

function formatRangeDates(start: Date, end: Date): string {
  const isSameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();

  if (isSameDay) {
    return start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  const sStr = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const isSameYear = start.getFullYear() === end.getFullYear();
  const eStr = end.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: isSameYear ? "numeric" : "numeric",
  });
  return `${sStr} – ${eStr}`;
}

export function getDefaultReportRange(): ReportDateFilterValue {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 89);
  return {
    id: "90",
    label: "Last 90 days",
    subLabel: formatRangeDates(from, today),
    from: startOfDay(from),
    to: endOfDay(today),
    granularity: "daily",
  };
}

export function ReportDatePicker({ value, onChange, className }: ReportDatePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"presets" | "month" | "year" | "custom">("presets");
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Month navigation in custom calendar
  const [calendarViewDate, setCalendarViewDate] = React.useState<Date>(() => new Date(value.from));

  // Custom range staging
  const [customStart, setCustomStart] = React.useState<Date | null>(value.from);
  const [customEnd, setCustomEnd] = React.useState<Date | null>(value.to);
  const [hoverDate, setHoverDate] = React.useState<Date | null>(null);

  // Year picker state for "Per Month" tab
  const currentYear = new Date().getFullYear();
  const [selectedMonthYear, setSelectedMonthYear] = React.useState<number>(() => value.from.getFullYear());
  const [selectedYearPickerYear, setSelectedYearPickerYear] = React.useState<number>(() => value.from.getFullYear());

  // Close when clicking outside
  React.useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Sync state when opened
  const handleOpen = () => {
    setCustomStart(value.from);
    setCustomEnd(value.to);
    setCalendarViewDate(new Date(value.from));
    setSelectedMonthYear(value.from.getFullYear());
    setSelectedYearPickerYear(value.from.getFullYear());
    setIsOpen(true);
  };

  // Preset handlers
  const handleSelectPreset = (id: string) => {
    const today = new Date();
    let next: ReportDateFilterValue;

    switch (id) {
      case "1": {
        const from = startOfDay(today);
        const to = endOfDay(today);
        next = {
          id: "1",
          label: "Daily (Today)",
          subLabel: today.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          from,
          to,
          granularity: "hourly",
        };
        break;
      }
      case "yesterday": {
        const y = new Date(today);
        y.setDate(y.getDate() - 1);
        const from = startOfDay(y);
        const to = endOfDay(y);
        next = {
          id: "yesterday",
          label: "Yesterday",
          subLabel: y.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          from,
          to,
          granularity: "hourly",
        };
        break;
      }
      case "7": {
        const from = new Date(today);
        from.setDate(from.getDate() - 6);
        next = {
          id: "7",
          label: "Last 7 days",
          subLabel: formatRangeDates(from, today),
          from: startOfDay(from),
          to: endOfDay(today),
          granularity: "daily",
        };
        break;
      }
      case "30": {
        const from = new Date(today);
        from.setDate(from.getDate() - 29);
        next = {
          id: "30",
          label: "Last 30 days",
          subLabel: formatRangeDates(from, today),
          from: startOfDay(from),
          to: endOfDay(today),
          granularity: "daily",
        };
        break;
      }
      case "90": {
        const from = new Date(today);
        from.setDate(from.getDate() - 89);
        next = {
          id: "90",
          label: "Last 90 days",
          subLabel: formatRangeDates(from, today),
          from: startOfDay(from),
          to: endOfDay(today),
          granularity: "daily",
        };
        break;
      }
      case "this-month": {
        const from = new Date(today.getFullYear(), today.getMonth(), 1);
        next = {
          id: "this-month",
          label: "This Month",
          subLabel: `${MONTH_NAMES[today.getMonth()]} ${today.getFullYear()}`,
          from: startOfDay(from),
          to: endOfDay(today),
          granularity: "daily",
        };
        break;
      }
      case "last-month": {
        const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const to = new Date(today.getFullYear(), today.getMonth(), 0);
        next = {
          id: "last-month",
          label: "Last Month",
          subLabel: `${MONTH_NAMES[from.getMonth()]} ${from.getFullYear()}`,
          from: startOfDay(from),
          to: endOfDay(to),
          granularity: "daily",
        };
        break;
      }
      case "this-year": {
        const from = new Date(today.getFullYear(), 0, 1);
        next = {
          id: "this-year",
          label: `This Year (${today.getFullYear()})`,
          subLabel: `Jan 1 – Dec 31, ${today.getFullYear()}`,
          from: startOfDay(from),
          to: endOfDay(today),
          granularity: "monthly",
        };
        break;
      }
      case "last-year": {
        const prevYear = today.getFullYear() - 1;
        const from = new Date(prevYear, 0, 1);
        const to = new Date(prevYear, 11, 31);
        next = {
          id: "last-year",
          label: `Last Year (${prevYear})`,
          subLabel: `Jan 1 – Dec 31, ${prevYear}`,
          from: startOfDay(from),
          to: endOfDay(to),
          granularity: "monthly",
        };
        break;
      }
      default:
        return;
    }

    onChange(next);
    setIsOpen(false);
  };

  // Specific Month Selection
  const handleSelectSpecificMonth = (monthIndex: number, year: number) => {
    const from = new Date(year, monthIndex, 1);
    const to = new Date(year, monthIndex + 1, 0);
    const next: ReportDateFilterValue = {
      id: `month-${year}-${monthIndex + 1}`,
      label: `${MONTH_NAMES[monthIndex]} ${year}`,
      subLabel: formatRangeDates(from, to),
      from: startOfDay(from),
      to: endOfDay(to),
      granularity: "daily",
    };
    onChange(next);
    setIsOpen(false);
  };

  // Specific Year Selection
  const handleSelectSpecificYear = (year: number) => {
    const from = new Date(year, 0, 1);
    const to = new Date(year, 11, 31);
    const next: ReportDateFilterValue = {
      id: `year-${year}`,
      label: `Year ${year}`,
      subLabel: `Jan 1 – Dec 31, ${year}`,
      from: startOfDay(from),
      to: endOfDay(to),
      granularity: "monthly",
    };
    onChange(next);
    setIsOpen(false);
  };

  // Custom Calendar Day click
  const handleDayClick = (clickedDate: Date) => {
    if (!customStart || (customStart && customEnd)) {
      setCustomStart(clickedDate);
      setCustomEnd(null);
    } else {
      const s = customStart <= clickedDate ? customStart : clickedDate;
      const e = customStart <= clickedDate ? clickedDate : customStart;
      setCustomStart(s);
      setCustomEnd(e);
    }
  };

  const applyCustomRange = () => {
    if (!customStart) return;
    const s = customStart;
    const e = customEnd || customStart;
    const sortedStart = s <= e ? s : e;
    const sortedEnd = s <= e ? e : s;

    const diffDays = Math.round((sortedEnd.getTime() - sortedStart.getTime()) / (1000 * 60 * 60 * 24));
    let granularity: ReportGranularity = "daily";
    if (diffDays <= 1) {
      granularity = "hourly";
    } else if (diffDays > 95) {
      granularity = "monthly";
    }

    const next: ReportDateFilterValue = {
      id: "custom",
      label: formatRangeDates(sortedStart, sortedEnd),
      subLabel: `${diffDays === 0 ? 1 : diffDays + 1} day${diffDays === 0 ? "" : "s"} selected`,
      from: startOfDay(sortedStart),
      to: endOfDay(sortedEnd),
      granularity,
    };

    onChange(next);
    setIsOpen(false);
  };

  // Calendar view navigation
  const calYear = calendarViewDate.getFullYear();
  const calMonth = calendarViewDate.getMonth();
  const prevMonth = () => setCalendarViewDate(new Date(calYear, calMonth - 1, 1));
  const nextMonth = () => setCalendarViewDate(new Date(calYear, calMonth + 1, 1));

  const firstDayOfWeek = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const calendarDays: Date[] = [];
  for (let i = 1; i <= daysInMonth; i++) {
    calendarDays.push(new Date(calYear, calMonth, i));
  }

  // Available years list (e.g. currentYear down to 2021)
  const availableYears: number[] = [];
  for (let y = currentYear + 1; y >= currentYear - 5; y--) {
    availableYears.push(y);
  }

  return (
    <div ref={containerRef} className={cn("relative inline-block text-left", className)}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => (isOpen ? setIsOpen(false) : handleOpen())}
        className={cn(
          "inline-flex items-center gap-2.5 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-all shadow-xs cursor-pointer select-none",
          isOpen
            ? "border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-500/20 dark:border-brand-500 dark:bg-brand-500/10 dark:text-brand-300"
            : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-600 dark:hover:bg-slate-700/80"
        )}
      >
        <CalendarIcon className="h-4 w-4 text-brand-600 dark:text-brand-400 shrink-0" />
        <span className="font-semibold">{value.label}</span>
        {value.subLabel && (
          <span className="hidden sm:inline-block text-xs font-normal text-slate-500 dark:text-slate-400">
            ({value.subLabel})
          </span>
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 text-slate-400 transition-transform duration-200 shrink-0",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[340px] sm:w-[410px] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900 animate-in fade-in zoom-in-95 duration-150">
          {/* Header Mode Navigation Tabs */}
          <div className="mb-3.5 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
            <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80 text-xs font-medium w-full">
              <button
                type="button"
                onClick={() => setActiveTab("presets")}
                className={cn(
                  "flex-1 rounded-lg py-1.5 text-center transition cursor-pointer",
                  activeTab === "presets"
                    ? "bg-white text-brand-600 font-semibold shadow-xs dark:bg-slate-700 dark:text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                )}
              >
                Presets
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("month")}
                className={cn(
                  "flex-1 rounded-lg py-1.5 text-center transition cursor-pointer",
                  activeTab === "month"
                    ? "bg-white text-brand-600 font-semibold shadow-xs dark:bg-slate-700 dark:text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                )}
              >
                Per Month
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("year")}
                className={cn(
                  "flex-1 rounded-lg py-1.5 text-center transition cursor-pointer",
                  activeTab === "year"
                    ? "bg-white text-brand-600 font-semibold shadow-xs dark:bg-slate-700 dark:text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                )}
              >
                Yearly
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("custom")}
                className={cn(
                  "flex-1 rounded-lg py-1.5 text-center transition cursor-pointer",
                  activeTab === "custom"
                    ? "bg-white text-brand-600 font-semibold shadow-xs dark:bg-slate-700 dark:text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                )}
              >
                Calendar
              </button>
            </div>
          </div>

          {/* TAB 1: QUICK PRESETS */}
          {activeTab === "presets" && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Quick Ranges
              </p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "1", label: "Daily (Today)", desc: "24-hour hourly view" },
                  { id: "yesterday", label: "Yesterday", desc: "Previous day" },
                  { id: "7", label: "Last 7 days", desc: "Past week" },
                  { id: "30", label: "Last 30 days", desc: "Past month" },
                  { id: "90", label: "Last 90 days", desc: "Past quarter" },
                  { id: "this-month", label: "This Month", desc: `${MONTH_SHORT[new Date().getMonth()]} ${new Date().getFullYear()}` },
                  { id: "last-month", label: "Last Month", desc: "Previous full month" },
                  { id: "this-year", label: `This Year (${new Date().getFullYear()})`, desc: "Year to date (monthly)" },
                  { id: "last-year", label: `Last Year (${new Date().getFullYear() - 1})`, desc: "Full prior year" },
                ].map((item) => {
                  const isSelected = value.id === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectPreset(item.id)}
                      className={cn(
                        "flex flex-col items-start justify-center rounded-xl border p-2.5 text-left transition cursor-pointer",
                        isSelected
                          ? "border-brand-500 bg-brand-50/70 text-brand-900 dark:border-brand-500/60 dark:bg-brand-500/10 dark:text-brand-200 ring-1 ring-brand-500/30"
                          : "border-slate-100 bg-slate-50/60 text-slate-700 hover:border-slate-200 hover:bg-slate-100/80 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800"
                      )}
                    >
                      <div className="flex w-full items-center justify-between">
                        <span className="text-xs font-bold leading-tight">{item.label}</span>
                        {isSelected && <Check className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400 shrink-0" />}
                      </div>
                      <span className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-full">
                        {item.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: PER MONTH FILTER */}
          {activeTab === "month" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Select a Month
                </p>
                {/* Year Switcher */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedMonthYear((y) => y - 1)}
                    className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer"
                    title="Previous year"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100 min-w-[42px] text-center">
                    {selectedMonthYear}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedMonthYear((y) => y + 1)}
                    className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer"
                    title="Next year"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* 12 Months Grid */}
              <div className="grid grid-cols-3 gap-2">
                {MONTH_NAMES.map((mName, idx) => {
                  const isCurrent =
                    value.id === `month-${selectedMonthYear}-${idx + 1}` ||
                    (value.id === "this-month" &&
                      selectedMonthYear === new Date().getFullYear() &&
                      idx === new Date().getMonth()) ||
                    (value.id === "last-month" &&
                      selectedMonthYear === new Date().getFullYear() &&
                      idx === new Date().getMonth() - 1);

                  const isThisMonth =
                    selectedMonthYear === new Date().getFullYear() && idx === new Date().getMonth();

                  return (
                    <button
                      key={mName}
                      type="button"
                      onClick={() => handleSelectSpecificMonth(idx, selectedMonthYear)}
                      className={cn(
                        "flex flex-col items-center justify-center rounded-xl border py-2.5 px-2 text-xs font-semibold transition cursor-pointer relative",
                        isCurrent
                          ? "border-brand-500 bg-brand-600 text-white shadow-xs dark:border-brand-500 dark:bg-brand-500"
                          : "border-slate-100 bg-slate-50/60 text-slate-700 hover:border-slate-200 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800"
                      )}
                    >
                      <span>{MONTH_SHORT[idx]}</span>
                      <span className={cn("text-[9px] font-normal opacity-70", isCurrent ? "text-white" : "text-slate-400")}>
                        {mName}
                      </span>
                      {isThisMonth && !isCurrent && (
                        <span className="absolute top-1 right-1.5 h-1.5 w-1.5 rounded-full bg-brand-500" />
                      )}
                    </button>
                  );
                })}
              </div>

              <p className="text-[11px] text-center text-slate-500 dark:text-slate-400 pt-1">
                Generates a day-by-day report for the selected month.
              </p>
            </div>
          )}

          {/* TAB 3: YEARLY FILTER */}
          {activeTab === "year" && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Select Year (Annual Overview)
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {availableYears.map((yr) => {
                  const isCurrent =
                    value.id === `year-${yr}` ||
                    (value.id === "this-year" && yr === currentYear) ||
                    (value.id === "last-year" && yr === currentYear - 1);

                  return (
                    <button
                      key={yr}
                      type="button"
                      onClick={() => handleSelectSpecificYear(yr)}
                      className={cn(
                        "flex flex-col items-center justify-center rounded-xl border py-3 px-2 text-xs font-bold transition cursor-pointer",
                        isCurrent
                          ? "border-brand-500 bg-brand-600 text-white shadow-xs dark:border-brand-500 dark:bg-brand-500"
                          : "border-slate-100 bg-slate-50/60 text-slate-700 hover:border-slate-200 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800"
                      )}
                    >
                      <span className="text-sm">{yr}</span>
                      <span className={cn("text-[10px] font-normal mt-0.5", isCurrent ? "text-white/80" : "text-slate-400")}>
                        {yr === currentYear ? "Current Year" : yr === currentYear - 1 ? "Last Year" : "Full Year"}
                      </span>
                    </button>
                  );
                })}
              </div>

              <p className="text-[11px] text-center text-slate-500 dark:text-slate-400 pt-1">
                Aggregates order counts and revenue broken down month-by-month for the full year.
              </p>
            </div>
          )}

          {/* TAB 4: CUSTOM RANGE CALENDAR */}
          {activeTab === "custom" && (
            <div className="space-y-3">
              {/* Calendar Month & Year Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <select
                    value={calMonth}
                    onChange={(e) => setCalendarViewDate(new Date(calYear, Number(e.target.value), 1))}
                    className="rounded-lg border border-slate-200 bg-slate-50 py-1 px-2 text-xs font-semibold text-slate-800 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                  >
                    {MONTH_NAMES.map((m, i) => (
                      <option key={m} value={i}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <select
                    value={calYear}
                    onChange={(e) => setCalendarViewDate(new Date(Number(e.target.value), calMonth, 1))}
                    className="rounded-lg border border-slate-200 bg-slate-50 py-1 px-2 text-xs font-semibold text-slate-800 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                  >
                    {availableYears.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={prevMonth}
                    className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer"
                    title="Previous month"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={nextMonth}
                    className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer"
                    title="Next month"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Days of Week */}
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                <span>Su</span>
                <span>Mo</span>
                <span>Tu</span>
                <span>We</span>
                <span>Th</span>
                <span>Fr</span>
                <span>Sa</span>
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-1" onMouseLeave={() => setHoverDate(null)}>
                {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
                  <div key={`empty-${idx}`} className="h-7 w-7 sm:h-8 sm:w-8" />
                ))}

                {calendarDays.map((d) => {
                  const dTime = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
                  const now = new Date();
                  const todayTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
                  const isToday = dTime === todayTime;

                  const activeStart = customStart
                    ? new Date(customStart.getFullYear(), customStart.getMonth(), customStart.getDate()).getTime()
                    : null;
                  const activeEnd = customEnd
                    ? new Date(customEnd.getFullYear(), customEnd.getMonth(), customEnd.getDate()).getTime()
                    : customStart && hoverDate
                    ? new Date(hoverDate.getFullYear(), hoverDate.getMonth(), hoverDate.getDate()).getTime()
                    : null;

                  const effectiveStart = activeStart && activeEnd ? Math.min(activeStart, activeEnd) : activeStart;
                  const effectiveEnd = activeStart && activeEnd ? Math.max(activeStart, activeEnd) : activeStart;

                  const isStart = activeStart !== null && dTime === activeStart;
                  const isEnd = activeEnd !== null && dTime === activeEnd;
                  const isInRange =
                    effectiveStart !== null &&
                    effectiveEnd !== null &&
                    dTime >= effectiveStart &&
                    dTime <= effectiveEnd;

                  return (
                    <button
                      key={d.toISOString()}
                      type="button"
                      onClick={() => handleDayClick(d)}
                      onMouseEnter={() => {
                        if (customStart && !customEnd) {
                          setHoverDate(d);
                        }
                      }}
                      className={cn(
                        "relative flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center text-xs font-medium transition cursor-pointer select-none",
                        isStart || isEnd
                          ? "rounded-lg bg-brand-600 text-white font-bold shadow-xs z-10 dark:bg-brand-500"
                          : isInRange
                          ? "bg-brand-50 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300 rounded-none first:rounded-l-lg last:rounded-r-lg"
                          : isToday
                          ? "rounded-lg border border-brand-500 text-brand-600 font-bold dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/10"
                          : "rounded-lg text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                      )}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>

              {/* Manual Date Inputs */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="mb-2 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">
                    {customStart && !customEnd ? (
                      <span className="text-brand-600 dark:text-brand-400 font-semibold animate-pulse">
                        Click end date...
                      </span>
                    ) : (
                      "Selected Range:"
                    )}
                  </span>
                  {customStart && (
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {formatRangeDates(customStart, customEnd || customStart)}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <div className="flex-1">
                    <label className="text-[10px] text-slate-400 block mb-0.5">Start Date</label>
                    <input
                      type="date"
                      value={customStart ? toInputDate(customStart) : ""}
                      onChange={(e) => {
                        const d = fromInputDate(e.target.value);
                        if (d) {
                          setCustomStart(d);
                          if (!customEnd) setCustomEnd(d);
                        }
                      }}
                      className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs text-slate-800 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                    />
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-3" />
                  <div className="flex-1">
                    <label className="text-[10px] text-slate-400 block mb-0.5">End Date</label>
                    <input
                      type="date"
                      value={customEnd ? toInputDate(customEnd) : customStart ? toInputDate(customStart) : ""}
                      onChange={(e) => {
                        const d = fromInputDate(e.target.value);
                        if (d) {
                          setCustomEnd(d);
                          if (!customStart) setCustomStart(d);
                        }
                      }}
                      className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs text-slate-800 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Apply Button */}
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomStart(new Date());
                      setCustomEnd(new Date());
                    }}
                    className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white cursor-pointer"
                  >
                    Reset to Today
                  </button>
                  <button
                    type="button"
                    onClick={applyCustomRange}
                    disabled={!customStart}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-brand-700 disabled:opacity-50 cursor-pointer"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Apply Range
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
