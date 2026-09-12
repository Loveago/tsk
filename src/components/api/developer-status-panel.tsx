"use client";

import * as React from "react";
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/shared";

export function DeveloperStatusPanel() {
  const [statusData, setStatusData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/v1/status");
      const json = await res.json();
      if (json.success && json.data) {
        setStatusData(json.data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="h-6 w-6 text-blue-600" />
      </div>
    );
  }

  const components = statusData?.components || {};

  const getStatusIcon = (status: string) => {
    if (status === "OPERATIONAL") return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
    if (status === "DEGRADED" || status === "MAINTENANCE") return <AlertTriangle className="h-5 w-5 text-amber-500" />;
    return <XCircle className="h-5 w-5 text-red-500" />;
  };

  const getStatusBadge = (status: string) => {
    if (status === "OPERATIONAL") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Operational
        </span>
      );
    }
    if (status === "MAINTENANCE") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Maintenance
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Degraded
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-bold tracking-tight">System Status</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Live operational status across carrier networks, order processing, and API infrastructure.
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh Status
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(components).map(([key, comp]: [string, any]) => (
          <div
            key={key}
            className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center gap-3">
              {getStatusIcon(comp.status)}
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{comp.name}</p>
                <p className="text-[11px] text-slate-400 font-mono">Component: {key}</p>
              </div>
            </div>
            {getStatusBadge(comp.status)}
          </div>
        ))}
      </div>
    </div>
  );
}
