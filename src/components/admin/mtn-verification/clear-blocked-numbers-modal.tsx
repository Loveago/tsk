"use client";

import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/shared";
import { useToast } from "@/components/toast";
import { AlertTriangle, Trash2 } from "lucide-react";

interface ClearBlockedNumbersModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  totalCount: number;
}

export function ClearBlockedNumbersModal({
  open,
  onClose,
  onSuccess,
  totalCount,
}: ClearBlockedNumbersModalProps) {
  const { toast } = useToast();
  const [clearing, setClearing] = React.useState(false);

  const handleClear = async () => {
    setClearing(true);
    try {
      const res = await fetch("/api/admin/mtn-verification/blocked-numbers?all=true", {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to clear blocked numbers");

      const count = data.count ?? totalCount;
      toast(`Successfully unblocked all ${count.toLocaleString()} phone numbers from the blacklist`, "success");
      onSuccess();
      onClose();
    } catch (err: any) {
      toast(err.message ?? "Error unblocking numbers", "error");
    } finally {
      setClearing(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!clearing) onClose();
      }}
      title="Clear All Blocked Numbers"
      description="Permanently remove all phone numbers from the purchasing blacklist."
      className="max-w-md"
    >
      <div className="space-y-4">
        {/* Warning card */}
        <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3.5 text-xs text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200">
          <div className="flex items-start gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-600 dark:bg-rose-900/50 dark:text-rose-300">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-rose-950 dark:text-rose-100">
                Warning: Irreversible Action
              </p>
              <p className="leading-relaxed text-rose-800 dark:text-rose-300">
                You are about to remove{" "}
                <span className="font-bold underline">
                  {totalCount > 0 ? `all ${totalCount.toLocaleString()}` : "all"}
                </span>{" "}
                phone numbers from the system blacklist.
              </p>
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-400">
          Once removed, these numbers will immediately be allowed to place orders again on all storefronts, API, and the user dashboard.
        </p>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={onClose}
            disabled={clearing}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleClear}
            disabled={clearing}
            className="bg-rose-600 hover:bg-rose-700 text-white"
          >
            {clearing && <Spinner className="h-4 w-4 mr-1.5" />}
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Yes, Unblock All Numbers
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
