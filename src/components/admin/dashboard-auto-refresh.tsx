"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RefreshCw, Pause, Play, Clock } from "lucide-react";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { cn } from "@/lib/utils";

const INTERVAL_PRESETS = [
  { label: "15s", value: 15 },
  { label: "30s", value: 30 },
  { label: "60s", value: 60 },
  { label: "2m", value: 120 },
  { label: "Off", value: 0 },
];

export function DashboardAutoRefresh() {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [defaultInterval, setDefaultInterval] = React.useState(30);

  // Load server-configured default or saved user preference
  React.useEffect(() => {
    const saved = localStorage.getItem("admin_refresh_interval");
    if (saved !== null && !isNaN(Number(saved))) {
      setDefaultInterval(Number(saved));
      return;
    }

    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => {
        const val = Number(d.settings?.admin_dashboard_refresh_interval ?? 30);
        if (Number.isFinite(val) && val >= 0) {
          setDefaultInterval(val);
        }
      })
      .catch(() => {});
  }, []);

  const handleRefresh = React.useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  const {
    secondsRemaining,
    isPaused,
    isManuallyPaused,
    togglePause,
    triggerRefresh,
    lastRefreshedAt,
    intervalSeconds,
    setIntervalSeconds,
  } = useAutoRefresh({
    intervalSeconds: defaultInterval,
    onRefresh: handleRefresh,
    pauseOnHidden: true,
    refreshOnVisible: true,
    pauseOnOffline: true,
  });

  const handleSelectInterval = (val: number) => {
    setIntervalSeconds(val);
    try {
      localStorage.setItem("admin_refresh_interval", String(val));
    } catch {}
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Interval Selector Pill Dropdown / Selector */}
      <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs dark:border-white/10 dark:bg-white/5">
        <select
          value={intervalSeconds}
          onChange={(e) => handleSelectInterval(Number(e.target.value))}
          className="bg-transparent px-2 py-1 font-medium text-slate-700 outline-none dark:text-slate-200 cursor-pointer"
          title="Select auto-refresh interval"
        >
          {INTERVAL_PRESETS.map((p) => (
            <option key={p.value} value={p.value} className="bg-white text-slate-900 dark:bg-[#0d1526] dark:text-slate-100">
              {p.value === 0 ? "Auto-refresh: Off" : `Auto: ${p.label}`}
            </option>
          ))}
        </select>
      </div>

      {/* Status & Countdown indicator */}
      <div className="hidden sm:flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 min-w-[70px]">
        {intervalSeconds > 0 && (
          isPaused ? (
            <span className="flex items-center gap-1 text-amber-500 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              Paused
            </span>
          ) : (
            <span className="flex items-center gap-1 font-mono">
              <Clock className="h-3 w-3 text-slate-400" />
              {secondsRemaining}s
            </span>
          )
        )}
      </div>

      {/* Play/Pause Toggle */}
      {intervalSeconds > 0 && (
        <button
          type="button"
          onClick={togglePause}
          className={cn(
            "rounded-lg border p-1.5 text-xs transition cursor-pointer",
            isManuallyPaused
              ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
          )}
          title={isManuallyPaused ? "Resume auto-refresh" : "Pause auto-refresh"}
        >
          {isManuallyPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
        </button>
      )}

      {/* Manual Refresh Button */}
      <Button
        size="sm"
        variant="outline"
        onClick={() => triggerRefresh()}
        disabled={isPending}
        className="gap-1.5"
        title={lastRefreshedAt ? `Last updated: ${lastRefreshedAt.toLocaleTimeString()}` : "Refresh now"}
      >
        <RefreshCw className={cn("h-3.5 w-3.5", isPending && "animate-spin text-brand-600 dark:text-brand-400")} />
        <span>Refresh</span>
      </Button>
    </div>
  );
}
