"use client";

import * as React from "react";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/shared";
import { StatusBadge } from "@/components/status-badge";
import { BatchStatusBadge, downloadBase64 } from "@/components/batches/batch-ui";
import { ProgressBar } from "@/components/ui/progress";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { formatDateTime, formatGHS, BATCH_ACTION_ELIGIBLE } from "@/lib/types";
import { orderCode } from "@/lib/utils";
import { FileSpreadsheet } from "lucide-react";

type BatchAction = "MARK_PROCESSING" | "MARK_COMPLETED" | "MARK_FAILED" | "CANCEL";

interface DetailOrder {
  id: number;
  phoneNumber: string;
  network: string;
  gbAmount: number;
  amount: number;
  status: string;
  failureReason: string | null;
  exportCount: number;
  lastExportedAt: string | null;
  createdAt: string;
  dataPackage?: { name: string } | null;
}

interface BatchDetail {
  batch: {
    id: string;
    batchCode: string;
    network: string;
    status: string;
    totalRecipients: number;
    totalGb: number;
    totalAmount: number;
    createdAt: string;
  };
  user?: { name: string; email: string } | null;
  orders: DetailOrder[];
  stats: { total: number; pending: number; processing: number; completed: number; failed: number; cancelled: number };
  progress: number;
  exportBatches: Array<{
    id: string;
    exportCode: string;
    network: string;
    status: string;
    isReexport: boolean;
    fileName: string;
    createdAt: string;
    adminLabel: string;
  }>;
}

const ACTIONS: Array<{ action: BatchAction; label: string; destructive?: boolean }> = [
  { action: "MARK_PROCESSING", label: "→ Processing" },
  { action: "MARK_COMPLETED", label: "→ Completed" },
  { action: "MARK_FAILED", label: "→ Failed", destructive: true },
  { action: "CANCEL", label: "Cancel batch", destructive: true },
];

export function BatchDetailSheet({
  batchId,
  open,
  onClose,
  onChanged,
}: {
  batchId: string | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [detail, setDetail] = React.useState<BatchDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [confirm, setConfirm] = React.useState<{ action: BatchAction; label: string; destructive?: boolean } | null>(null);

  const load = React.useCallback(async () => {
    if (!batchId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/batches/${batchId}`);
      const json = await res.json();
      if (res.ok) setDetail(json);
      else toast(json.error ?? "Failed to load batch", "error");
    } finally {
      setLoading(false);
    }
  }, [batchId, toast]);

  React.useEffect(() => {
    if (open && batchId) {
      setDetail(null);
      setSelected(new Set());
      load();
    }
  }, [open, batchId, load]);

  const scopeIds = (action: BatchAction): number[] => {
    const eligible = (BATCH_ACTION_ELIGIBLE as Record<string, string[]>)[action] ?? [];
    const pool =
      selected.size > 0 ? detail?.orders.filter((o) => selected.has(o.id)) ?? [] : detail?.orders ?? [];
    return pool.filter((o) => eligible.includes(o.status)).map((o) => o.id);
  };

  const runAction = async (action: BatchAction, force: boolean) => {
    if (!detail) return;
    const ids = scopeIds(action);
    if (ids.length === 0) {
      toast("No eligible orders for this action", "error");
      return;
    }
    setBusy(true);
    try {
      const reason =
        action === "MARK_FAILED" || action === "CANCEL"
          ? (window.prompt("Reason (optional)") ?? undefined)
          : undefined;
      const res = await fetch(`/api/admin/batches/${detail.batch.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, force, orderIds: selected.size > 0 ? ids : undefined, reason }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? "Action failed", "error");
        return;
      }
      if (json.overrideRequired && json.skipped > 0) {
        toast(`${json.applied} applied · ${json.skipped} skipped — tick "override safeguard" to force`, "error");
      } else {
        toast(`${json.applied} order(s) updated`, "success");
      }
      setConfirm(null);
      setSelected(new Set());
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const exportBatch = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ network: detail.batch.network, batchIds: [detail.batch.id] }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? "Export failed", "error");
        return;
      }
      downloadBase64(json.fileName, json.fileBase64);
      toast(`Export ${json.exportCode} created — ${json.count} recipient(s)`, "success");
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const toggleOne = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const b = detail?.batch;
  const eligibleCount = confirm ? scopeIds(confirm.action).length : 0;

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={b ? <span className="font-mono">{b.batchCode}</span> : "Batch"}
        description={b ? `${b.network} · created ${formatDateTime(b.createdAt)}` : undefined}
      >
        {loading || !detail || !b ? (
          <div className="flex justify-center py-12">
            <Spinner className="h-6 w-6 text-brand-600" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-100 p-4 text-sm dark:border-white/5 sm:grid-cols-4">
              <div>
                <p className="text-xs text-slate-400">Status</p>
                <div className="mt-1"><BatchStatusBadge status={b.status} /></div>
              </div>
              <div>
                <p className="text-xs text-slate-400">Recipients</p>
                <p className="mt-1 font-semibold">{detail.stats.total || b.totalRecipients}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Volume</p>
                <p className="mt-1 font-semibold">{b.totalGb} GB</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Value</p>
                <p className="mt-1 font-semibold">{formatGHS(b.totalAmount)}</p>
              </div>
              {detail.user && (
                <div className="col-span-2 sm:col-span-4">
                  <p className="text-xs text-slate-400">Customer</p>
                  <p className="mt-1 font-medium">
                    {detail.user.name} <span className="text-slate-400">· {detail.user.email}</span>
                  </p>
                </div>
              )}
              <div className="col-span-2 sm:col-span-4">
                <div className="flex items-center gap-2">
                  <ProgressBar value={detail.stats.completed + detail.stats.cancelled} total={detail.stats.total} />
                  <span className="text-xs font-semibold text-slate-500">{detail.progress}%</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={exportBatch} disabled={busy} className="gap-1.5">
                <FileSpreadsheet className="h-3.5 w-3.5" /> Export Excel
              </Button>
              {ACTIONS.map((a) => (
                <Button
                  key={a.action}
                  size="sm"
                  variant="outline"
                  disabled={busy || scopeIds(a.action).length === 0}
                  onClick={() => setConfirm(a)}
                  className={a.destructive ? "text-red-600 dark:text-red-400" : undefined}
                >
                  {a.label}
                </Button>
              ))}
            </div>

            <div className="rounded-xl border border-slate-100 dark:border-white/5">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 text-xs dark:border-white/5">
                <span className="font-semibold text-slate-500">
                  Recipients {selected.size > 0 && `· ${selected.size} selected`}
                </span>
                <button
                  className="underline-offset-2 hover:underline"
                  onClick={() =>
                    setSelected((prev) =>
                      prev.size === detail.orders.length ? new Set() : new Set(detail.orders.map((o) => o.id))
                    )
                  }
                >
                  {selected.size === detail.orders.length && detail.orders.length > 0 ? "Deselect all" : "Select all"}
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs text-slate-500 dark:border-white/5">
                      <th className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selected.size === detail.orders.length && detail.orders.length > 0}
                          onChange={() =>
                            setSelected((prev) =>
                              prev.size === detail.orders.length ? new Set() : new Set(detail.orders.map((o) => o.id))
                            )
                          }
                        />
                      </th>
                      <th className="px-3 py-2 font-medium">Order</th>
                      <th className="px-3 py-2 font-medium">Phone</th>
                      <th className="px-3 py-2 font-medium">Size</th>
                      <th className="px-3 py-2 font-medium">Amount</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="hidden px-3 py-2 font-medium sm:table-cell">Exports</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {detail.orders.map((o) => (
                      <tr key={o.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleOne(o.id)} />
                        </td>
                        <td className="px-3 py-2 font-mono text-xs font-semibold">{orderCode(o.id)}</td>
                        <td className="px-3 py-2">{o.phoneNumber}</td>
                        <td className="px-3 py-2">{o.gbAmount} GB</td>
                        <td className="px-3 py-2">{formatGHS(o.amount)}</td>
                        <td className="px-3 py-2">
                          <StatusBadge status={o.status} />
                          {o.failureReason && (
                            <p className="mt-0.5 max-w-[180px] truncate text-[11px] text-red-500" title={o.failureReason}>
                              {o.failureReason}
                            </p>
                          )}
                        </td>
                        <td className="hidden px-3 py-2 text-xs text-slate-500 sm:table-cell">
                          {o.exportCount > 0 ? `${o.exportCount}×` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {detail.exportBatches.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold text-slate-500">Linked exports</p>
                <ul className="space-y-1.5">
                  {detail.exportBatches.map((e) => (
                    <li
                      key={e.id}
                      className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-xs dark:border-white/5"
                    >
                      <span className="font-mono font-semibold text-brand-600 dark:text-brand-400">{e.exportCode}</span>
                      <span className="text-slate-500">
                        {e.isReexport ? "Re-export · " : ""}
                        {formatDateTime(e.createdAt)} · {e.adminLabel}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Sheet>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={({ force }) => confirm && runAction(confirm.action, force)}
        title={confirm?.label ?? ""}
        message={
          <>
            Apply <strong>{confirm?.label.replace("→ ", "").replace("Cancel batch", "CANCELLED")}</strong> to{" "}
            <strong>{eligibleCount}</strong> eligible order(s) in this batch
            {selected.size > 0 ? " (selected only)" : ""}. Orders not eligible for this transition are skipped.
          </>
        }
        confirmLabel={confirm?.label.replace("→ ", "") ?? "Confirm"}
        variant={confirm?.destructive ? "destructive" : "default"}
        withForce
        loading={busy}
      />
    </>
  );
}