"use client";

import * as React from "react";
import { Spinner } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { downloadBase64 } from "@/components/batches/batch-ui";
import { formatGHS } from "@/lib/types";
import { Download, Layers } from "lucide-react";

const NETWORKS = ["MTN", "TELECEL", "AIRTELTIGO"] as const;

interface Stat {
  network: string;
  pending: number;
  pendingGb: number;
  pendingAmount: number;
}

/**
 * One-click export of the whole pending queue: exports ALL pending orders for a
 * network across every user and every batch into a single Excel file (§6 —
 * networks are never mixed, so one file per network).
 */
export function QuickExportPanel({ onChanged }: { onChanged?: () => void | Promise<void> }) {
  const { toast } = useToast();
  const [stats, setStats] = React.useState<Stat[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busyNetwork, setBusyNetwork] = React.useState<string | null>(null);
  const [bulkLabel, setBulkLabel] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/admin/network-stats");
      const json = await res.json();
      if (res.ok) setStats(json.stats ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const pendingFor = (network: string) => stats.find((s) => s.network === network)?.pending ?? 0;

  /** Export every pending order for one network, across all users/batches. */
  const exportNetwork = async (network: string): Promise<boolean> => {
    setBusyNetwork(network);
    try {
      const res = await fetch("/api/admin/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ network }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? "Export failed", "error");
        return false;
      }
      downloadBase64(json.fileName, json.fileBase64);
      toast(`Export ${json.exportCode} — ${json.count} recipient(s), all users`, "success");
      return true;
    } finally {
      setBusyNetwork(null);
    }
  };

  const afterExport = async () => {
    await load();
    await onChanged?.();
  };

  const handleExportOne = async (network: string) => {
    const ok = await exportNetwork(network);
    if (ok) await afterExport();
  };

  const handleExportAll = async () => {
    const targets = NETWORKS.filter((n) => pendingFor(n) > 0);
    if (targets.length === 0) {
      toast("No pending orders to export", "error");
      return;
    }
    let done = 0;
    for (let i = 0; i < targets.length; i++) {
      setBulkLabel(`${i + 1}/${targets.length}`);
      if (await exportNetwork(targets[i])) done++;
    }
    setBulkLabel(null);
    toast(`Exported ${done} of ${targets.length} network file(s)`, done > 0 ? "success" : "error");
    await afterExport();
  };

  const totalPending = NETWORKS.reduce((s, n) => s + pendingFor(n), 0);

  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-4 dark:border-brand-500/20 dark:bg-brand-500/5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-50">
            <Layers className="h-4 w-4 text-brand-600" />
            Quick export — whole pending queue
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Every user&apos;s pending orders in one file per network (networks can&apos;t be mixed in a dispatch file).
          </p>
        </div>
        <Button onClick={handleExportAll} disabled={loading || bulkLabel !== null || totalPending === 0}>
          {bulkLabel ? (
            <>
              <Spinner className="h-4 w-4" /> Exporting {bulkLabel}…
            </>
          ) : (
            <>
              <Download className="h-4 w-4" /> Export all networks
            </>
          )}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <Spinner className="h-5 w-5 text-brand-600" />
        </div>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {NETWORKS.map((network) => {
            const pending = pendingFor(network);
            const stat = stats.find((s) => s.network === network);
            return (
              <div
                key={network}
                className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-slate-900"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{network}</p>
                  <p className="truncate text-xs text-slate-400">
                    {pending} pending · {stat?.pendingGb ?? 0} GB · {formatGHS(stat?.pendingAmount ?? 0)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => handleExportOne(network)}
                  disabled={pending === 0 || busyNetwork !== null || bulkLabel !== null}
                >
                  {busyNetwork === network ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                  Export
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}