"use client";

import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Spinner } from "@/components/shared";
import { useToast } from "@/components/toast";
import { CheckCircle2, XCircle, CheckSquare, Square, Search } from "lucide-react";

interface BatchItem {
  id: string;
  number: string;
  normalizedNumber: string;
  status: string;
}

interface VerifyBatchModalProps {
  open: boolean;
  onClose: () => void;
  batch: {
    id: string;
    batchReference: string;
    totalNumbers: number;
    numbers?: BatchItem[];
  } | null;
  onSuccess: () => void;
}

export function VerifyBatchModal({
  open,
  onClose,
  batch,
  onSuccess,
}: VerifyBatchModalProps) {
  const { toast } = useToast();
  const [mode, setMode] = React.useState<"ALL" | "SELECTED" | "REJECT">("ALL");
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [rejectionReason, setRejectionReason] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const numbers = batch?.numbers ?? [];

  React.useEffect(() => {
    if (batch?.numbers) {
      // Default all selected if switching to SELECTED mode
      setSelectedIds(new Set(batch.numbers.map((n) => n.id)));
    }
  }, [batch]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(numbers.map((n) => n.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const filteredNumbers = React.useMemo(() => {
    if (!search.trim()) return numbers;
    return numbers.filter((n) => n.number.includes(search.trim()));
  }, [numbers, search]);

  const handleConfirm = async () => {
    if (!batch) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/mtn-verification/batches/${batch.id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          verifiedNumberIds: mode === "SELECTED" ? Array.from(selectedIds) : undefined,
          rejectionReason: mode === "REJECT" || mode === "SELECTED" ? rejectionReason : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Verification failed");

      toast(
        `Batch verified! ${data.verifiedCount} added to accepted whitelist, ${data.rejectedCount} rejected.`,
        "success"
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      toast(err.message ?? "Error verifying batch", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Verify Batch ${batch?.batchReference ?? ""}`}
      description="Record portal verification results for this batch."
      className="max-w-xl"
    >
      <div className="space-y-4">
        {/* Verification Mode Choice */}
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Verification Result
          </Label>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => setMode("ALL")}
              className={`flex flex-col items-start rounded-xl border p-3 text-left transition ${
                mode === "ALL"
                  ? "border-emerald-600 bg-emerald-50/70 text-emerald-900 ring-1 ring-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300"
                  : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
              }`}
            >
              <div className="flex items-center gap-1.5 font-semibold text-xs">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                All Verified
              </div>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                All {numbers.length} numbers accepted on MTN portal
              </p>
            </button>

            <button
              type="button"
              onClick={() => setMode("SELECTED")}
              className={`flex flex-col items-start rounded-xl border p-3 text-left transition ${
                mode === "SELECTED"
                  ? "border-blue-600 bg-blue-50/70 text-blue-900 ring-1 ring-blue-600 dark:bg-blue-500/10 dark:text-blue-300"
                  : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
              }`}
            >
              <div className="flex items-center gap-1.5 font-semibold text-xs">
                <CheckSquare className="h-4 w-4 text-blue-600" />
                Partial Verification
              </div>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                Select which specific numbers were accepted
              </p>
            </button>

            <button
              type="button"
              onClick={() => setMode("REJECT")}
              className={`flex flex-col items-start rounded-xl border p-3 text-left transition ${
                mode === "REJECT"
                  ? "border-red-600 bg-red-50/70 text-red-900 ring-1 ring-red-600 dark:bg-red-500/10 dark:text-red-300"
                  : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
              }`}
            >
              <div className="flex items-center gap-1.5 font-semibold text-xs">
                <XCircle className="h-4 w-4 text-red-600" />
                Reject Batch
              </div>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                Entire batch rejected by portal
              </p>
            </button>
          </div>
        </div>

        {/* Partial Selection UI */}
        {mode === "SELECTED" && (
          <div className="rounded-xl border border-slate-200 p-3.5 space-y-3 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Select Verified Numbers ({selectedIds.size} of {numbers.length})
                </p>
                <p className="text-[11px] text-slate-500">
                  Unchecked numbers will be marked REJECTED.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={selectAll}>
                  Select All
                </Button>
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={deselectAll}>
                  Clear
                </Button>
              </div>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Filter numbers in batch..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs focus:border-brand-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900"
              />
            </div>

            <div className="max-h-44 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
              {filteredNumbers.map((n) => {
                const isSelected = selectedIds.has(n.id);
                return (
                  <label
                    key={n.id}
                    onClick={() => toggleSelect(n.id)}
                    className="flex items-center justify-between px-3 py-2 text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                      {n.number}
                    </span>
                    <span className={isSelected ? "text-emerald-600 font-semibold" : "text-slate-400"}>
                      {isSelected ? "✓ Verified" : "✕ Reject"}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Rejection Reason (for REJECT or SELECTED mode) */}
        {(mode === "REJECT" || (mode === "SELECTED" && selectedIds.size < numbers.length)) && (
          <div className="space-y-1.5">
            <Label htmlFor="reason">Rejection Reason</Label>
            <Input
              id="reason"
              placeholder="e.g. Number not active or rejected by MTN portal"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="text-xs"
            />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={submitting}>
            {submitting && <Spinner className="h-4 w-4 mr-1.5" />}
            Confirm Verification
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
