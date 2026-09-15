"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export function DashboardAutoRefresh() {
  const router = useRouter();
  const [lastRefreshed, setLastRefreshed] = React.useState(null as Date | null);
  const [refreshInterval, setRefreshInterval] = React.useState(30);
  const [refreshing, setRefreshing] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => {
        const val = Number(d.settings?.admin_dashboard_refresh_interval ?? 30);
        setRefreshInterval(Number.isFinite(val) && val >= 0 ? val : 30);
      })
      .catch(() => {});
  }, []);

  const refresh = React.useCallback(() => {
    setRefreshing(true);
    router.refresh();
    setLastRefreshed(new Date());
    setTimeout(() => setRefreshing(false), 600);
  }, [router]);

  React.useEffect(() => {
    if (refreshInterval <= 0) return;
    const id = setInterval(refresh, refreshInterval * 1000);
    return () => clearInterval(id);
  }, [refresh, refreshInterval]);

  return (
    <div className="flex items-center gap-2">
      {lastRefreshed && (
        <span className="text-xs text-slate-400 dark:text-slate-500">
          Updated {lastRefreshed.toLocaleTimeString()}
        </span>
      )}
      {refreshInterval > 0 && (
        <span className="text-xs text-slate-400 dark:text-slate-500">
          auto-refreshes every {refreshInterval}s
        </span>
      )}
      <Button size="sm" variant="outline" onClick={refresh} disabled={refreshing} className="gap-1.5">
        <RefreshCw className={"h-3.5 w-3.5 " + (refreshing ? "animate-spin" : "")} />
        Refresh
      </Button>
    </div>
  );
}
