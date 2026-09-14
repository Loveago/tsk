"use client";

import { EmptyState, Spinner } from "@/components/shared";
import { BatchStatusBadge, BatchStatsChips, type BatchStats } from "@/components/batches/batch-ui";
import { ProgressBar } from "@/components/ui/progress";
import { formatDateTime, formatGHS } from "@/lib/types";
import { Layers } from "lucide-react";

export interface BatchRow {
  id: string;
  batchCode: string;
  network: string;
  status: string;
  totalRecipients: number;
  totalGb: number;
  totalAmount: number;
  createdAt: string;
  user?: { name: string; email: string } | null;
  stats: BatchStats;
  progress: number;
}

export function BatchesTable({
  data,
  loading,
  onOpen,
  selectedIds,
  onToggleSelectRow,
  onToggleSelectAll,
  onChangeStatus,
}: {
  data: BatchRow[];
  loading: boolean;
  onOpen: (b: BatchRow) => void;
  selectedIds?: Set<string>;
  onToggleSelectRow?: (id: string) => void;
  onToggleSelectAll?: () => void;
  onChangeStatus?: (batchId: string, action: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex justify-center rounded-2xl border border-slate-100 bg-white py-12 dark:border-slate-800 dark:bg-slate-900">
        <Spinner className="h-6 w-6 text-brand-600" />
      </div>
    );
  }

  const allSelected = selectedIds && selectedIds.size === data.length && data.length > 0;

  return (
    <div className="rounded-2xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
      {data.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No batches found"
          description="Batches group orders per network. Adjust the filters or wait for new orders."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500 dark:border-slate-800">
                {onToggleSelectRow && (
                  <th className="px-3 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={onToggleSelectAll}
                      className="rounded border-slate-300 dark:border-white/20"
                    />
                  </th>
                )}
                <th className="px-4 py-3 font-medium">Batch</th>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Network</th>
                <th className="px-4 py-3 font-medium">Recipients</th>
                <th className="px-4 py-3 font-medium">Value</th>
                <th className="min-w-[200px] px-4 py-3 font-medium">Progress</th>
                <th className="px-4 py-3 font-medium">Status</th>
                {onChangeStatus && <th className="px-4 py-3 font-medium">Change Status</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.map((b) => (
                <tr
                  key={b.id}
                  className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  onClick={() => onOpen(b)}
                >
                  {onToggleSelectRow && (
                    <td className="px-3 py-3" onClick={(ev) => ev.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds?.has(b.id)}
                        onChange={() => onToggleSelectRow(b.id)}
                        className="rounded border-slate-300 dark:border-white/20"
                      />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs font-bold tracking-wide text-brand-600 dark:text-brand-400">
                      {b.batchCode}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">{formatDateTime(b.createdAt)}</p>
                  </td>
                  <td className="px-4 py-3">
                    {b.user ? (
                      <>
                        <p className="font-medium">{b.user.name}</p>
                        <p className="text-xs text-slate-500">{b.user.email}</p>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium">{b.network}</td>
                  <td className="px-4 py-3">{b.stats.total || b.totalRecipients}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{b.totalGb} GB</p>
                    <p className="text-xs text-slate-500">{formatGHS(b.totalAmount)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ProgressBar
                        value={b.stats.completed + b.stats.cancelled}
                        total={b.stats.total}
                        className="w-24"
                      />
                      <span className="text-xs font-semibold text-slate-500">{b.progress}%</span>
                    </div>
                    <BatchStatsChips stats={b.stats} className="mt-1.5" />
                  </td>
                  <td className="px-4 py-3">
                    <BatchStatusBadge status={b.status} />
                  </td>
                  {onChangeStatus && (
                    <td className="px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
                      <select
                        defaultValue=""
                        onChange={(ev) => {
                          if (ev.target.value) {
                            onChangeStatus(b.id, ev.target.value);
                            ev.target.value = "";
                          }
                        }}
                        className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-semibold outline-none transition hover:border-brand-500 dark:border-white/10 dark:bg-white/5 cursor-pointer"
                      >
                        <option value="" disabled>Change Status ▾</option>
                        <option value="MARK_PROCESSING">→ Processing</option>
                        <option value="MARK_COMPLETED">→ Completed</option>
                        <option value="MARK_FAILED">→ Failed</option>
                        <option value="CANCEL">Cancel</option>
                      </select>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}