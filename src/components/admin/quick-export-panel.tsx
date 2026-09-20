"use client";

import * as React from "react";
import { Spinner } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { NetworkExportDialog } from "@/components/admin/network-export-dialog";
import { formatGHS } from "@/lib/types";
import { Download, Layers } from "lucide-react";

const NETWORKS = ["MTN", "TELECEL", "AIRTELTIGO", "AIRTELTIGO_BIGTIME"] as const;

interface Stat {
  network: string;
  pending: number;
  pendingGb: number;
  pendingAmount: number;
}

/**
 * One-click export of the whole pending queue: opens the NetworkExportDialog per
 * network so the admin can filter orders and choose the target status before
 * generating the Excel file.
 */
export function QuickExportPanel({ onChanged }: { onChanged?: () => void | Promise<void> }) {
  const [stats, setStats] = React.useState<Stat[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [dialogNetwork, setDialogNetwork] = React.useState<string | null>(null);

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

  const afterExport = async () => {
    await load();
    await onChanged?.();
  };

  const totalPending = NETWORKS.reduce((s, n) => s + pendingFor(n), 0);

  const dialogStat = dialogNetwork ? stats.find((s) => s.network === dialogNetwork) : null;

  return (
    <>
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
        </div>

        {loading ? (
          <div className="flex justify-center py-4">
            <Spinner className="h-5 w-5 text-brand-600" />
          </div>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {NETWORKS.map((network) => {
              const pending = pendingFor(network);
              const stat = stats.find((s) => s.network === network);
              const label = network === "AIRTELTIGO" ? "AT iShare" : network === "AIRTELTIGO_BIGTIME" ? "AT Big Time" : network;
              return (
                <div
                  key={network}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-slate-900"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{label}</p>
                    <p className="truncate text-xs text-slate-400">
                      {pending} pending · {stat?.pendingGb ?? 0} GB · {formatGHS(stat?.pendingAmount ?? 0)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setDialogNetwork(network)}
                  >
                    <Download className="h-4 w-4" />
                    Export
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Per-network export dialog with filters + status override */}
      {dialogNetwork && (
        <NetworkExportDialog
          network={dialogNetwork}
          pendingCount={dialogStat?.pending ?? 0}
          pendingGb={dialogStat?.pendingGb ?? 0}
          pendingAmount={dialogStat?.pendingAmount ?? 0}
          open={true}
          onClose={() => setDialogNetwork(null)}
          onExported={afterExport}
        />
      )}
    </>
  );
}