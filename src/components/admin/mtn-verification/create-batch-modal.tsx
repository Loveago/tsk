"use client";

import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/shared";
import { useToast } from "@/components/toast";
import { Layers } from "lucide-react";

interface CreateBatchModalProps {
  open: boolean;
  onClose: () => void;
  selectedRequestIds: string[];
  onSuccess: (batch: any) => void;
}

export function CreateBatchModal({
  open,
  onClose,
  selectedRequestIds,
  onSuccess,
}: CreateBatchModalProps) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = React.useState(false);

  const handleCreate = async () => {
    if (!selectedRequestIds.length) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/mtn-verification/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestIds: selectedRequestIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create batch");

      toast(`Created batch ${data.batch?.batchReference ?? ""} with ${selectedRequestIds.length} numbers!`, "success");
      onSuccess(data.batch);
      onClose();
    } catch (err: any) {
      toast(err.message ?? "Error creating batch", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Create Verification Batch"
      description="Bundle selected pending numbers into an exportable verification batch."
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-brand-50 p-2.5 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {selectedRequestIds.length} Numbers Selected
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                These requests will move from SUBMITTED to PROCESSING state. You can export the batch as TXT/CSV for portal submission.
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={submitting || selectedRequestIds.length === 0}>
            {submitting && <Spinner className="h-4 w-4 mr-1.5" />}
            Create Verification Batch
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
