"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ScrollableTabItem<T extends string = string> {
  key: T;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: number | string;
  badgeCls?: string;
}

export function ScrollableTabs<T extends string = string>({
  tabs,
  activeTab,
  onChange,
  className,
  variant = "pill",
}: {
  tabs: ScrollableTabItem<T>[];
  activeTab: T;
  onChange: (key: T) => void;
  className?: string;
  variant?: "pill" | "subtle";
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  const checkScroll = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const canLeft = el.scrollLeft > 6;
    const canRight = el.scrollLeft < el.scrollWidth - el.clientWidth - 6;
    setCanScrollLeft(canLeft);
    setCanScrollRight(canRight);
  }, []);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    checkScroll();

    const ro = new ResizeObserver(() => checkScroll());
    ro.observe(el);

    return () => ro.disconnect();
  }, [checkScroll, tabs]);

  // Center active tab automatically whenever activeTab changes
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const activeEl = el.querySelector<HTMLElement>('[data-active="true"]');
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
    // Give animation time to finish before rechecking scroll bounds
    const timer = setTimeout(checkScroll, 350);
    return () => clearTimeout(timer);
  }, [activeTab, checkScroll]);

  // Translate vertical wheel scroll to horizontal scroll when hovering over the bar
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    if (el.scrollWidth > el.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      el.scrollLeft += e.deltaY;
      checkScroll();
    }
  };

  const scroll = (direction: "left" | "right") => {
    const el = containerRef.current;
    if (!el) return;
    const distance = Math.max(180, el.clientWidth * 0.6);
    el.scrollBy({ left: direction === "left" ? -distance : distance, behavior: "smooth" });
    setTimeout(checkScroll, 250);
  };

  return (
    <div className={cn("relative flex w-full min-w-0 max-w-full items-center", className)}>
      {/* Left scroll chevron with gradient fade */}
      {canScrollLeft && (
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 z-20 flex items-center pr-4 bg-gradient-to-r from-white via-white/95 to-transparent dark:from-[#0a1120] dark:via-[#0a1120]/95 dark:to-transparent">
          <button
            type="button"
            onClick={() => scroll("left")}
            aria-label="Scroll options left"
            className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-md transition-all hover:bg-slate-50 hover:text-slate-900 active:scale-90 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Horizontal tabs scrollable track */}
      <div
        ref={containerRef}
        onScroll={checkScroll}
        onWheel={onWheel}
        className="no-scrollbar flex w-full min-w-0 flex-1 items-center gap-1.5 overflow-x-auto scroll-smooth py-1.5 px-0.5 touch-pan-x"
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              data-active={active}
              onClick={() => onChange(tab.key)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95",
                active
                  ? "bg-blue-600 text-white shadow-sm shadow-blue-600/30 font-bold"
                  : variant === "pill"
                  ? "bg-slate-100/90 text-slate-600 hover:bg-slate-200 hover:text-slate-900 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-blue-400 dark:border-white/10 dark:bg-transparent dark:text-slate-300"
              )}
            >
              {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={cn(
                    "ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] font-bold",
                    tab.badgeCls || (active ? "bg-white/25 text-white" : "bg-blue-500/15 text-blue-600 dark:text-blue-400")
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Right scroll chevron with gradient fade */}
      {canScrollRight && (
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 z-20 flex items-center pl-4 bg-gradient-to-l from-white via-white/95 to-transparent dark:from-[#0a1120] dark:via-[#0a1120]/95 dark:to-transparent">
          <button
            type="button"
            onClick={() => scroll("right")}
            aria-label="Scroll options right"
            className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-md transition-all hover:bg-slate-50 hover:text-slate-900 active:scale-90 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
