"use client";

import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (opts: { force: boolean }) => void;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  variant?: "default" | "destructive";
  /** When true, shows an "override safeguards" checkbox passed as `force` to onConfirm. */
  withForce?: boolean;
  loading?: boolean;
}

/** Confirmation dialog used for batch actions and other state-changing operations. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  variant = "default",
  withForce = false,
  loading = false,
}: ConfirmDialogProps) {
  const [force, setForce] = React.useState(false);
  React.useEffect(() => {
    if (open) setForce(false);
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} title={title} className="max-w-md">
      <div className="space-y-4">
        <div className="text-sm text-slate-600 dark:text-slate-300">{message}</div>
        {withForce && (
          <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
            <input
              type="checkbox"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Override safeguard — apply this change even if some orders are already in the
              target state or a transition would normally be blocked.
            </span>
          </label>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={variant === "destructive" ? "destructive" : "default"}
            size="sm"
            onClick={() => onConfirm({ force })}
            disabled={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}