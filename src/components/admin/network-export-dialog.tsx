"use client";

import * as React from "react";
import { X, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";
import { Spinner } from "@/components/shared";
import { useToast } from "@/components/toast";
import { downloadBase64 } from "@/components/batches/batch-ui";
import { formatGHS } from "@/lib/types";
import { cn } from "@/lib/utils";

const ROLES = ["ADMIN", "MANAGER", "RESELLER", "USER"] as const;

// Statuses the admin can move exported orders to
const EXPORT_STATUSES = [
  { value: "PROCESSING", label: "Processing" },
  { value: "PENDING", label: "Pending (keep as-is)" },
  { value: "SUCCESS", label: "Success" },
  { value: "FAILED", label: "Failed" },
] as const;

interface UserOption {
  id: string;
  name: string;
  email: string;
}

interface NetworkExportDialogProps {
  network: string;
  /** Number of pending orders for this network */
  pendingCount: number;
  pendingGb: number;
  pendingAmount: number;
  open: boolean;
  onClose: () => void;
  onExported: () => void;
}

export function NetworkExportDialog({
  network,
  pendingCount,
  pendingGb,
  pendingAmount,
  open,
  onClose,
  onExported,
}: NetworkExportDialogProps) {
  const { toast } = useToast();

  // Filters
  const [role, setRole] = React.useState("");
  const [userId, setUserId] = React.useState("");
  const [volumeExact, setVolumeExact] = React.useState("");
  const [volumeMin, setVolumeMin] = React.useState("");
  const [volumeMax, setVolumeMax] = React.useState("");
  const [targetStatus, setTargetStatus] = React.useState("PROCESSING");

  // Users list for "By user" dropdown
  const [users, setUsers] = React.useState<UserOption[]>([]);
  const [usersLoading, setUsersLoading] = React.useState(false);

  // Export state
  const [exporting, setExporting] = React.useState(false);

  // Close on Escape
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  // Load users when dialog opens (filtered by role if selected)
  React.useEffect(() => {
    if (!open) return;
    let active = true;
    setUsersLoading(true);
    const params = new URLSearchParams({ pageSize: "200" });
    if (role) params.set("role", role);
    fetch(`/api/admin/users?${params.toString()}`)
      .then((r) => r.json())
      .then((json) => {
        if (active) setUsers(json.data ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setUsersLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, role]);

  // Reset userId when role changes (selected user may no longer be in the list)
  React.useEffect(() => {
    setUserId("");
  }, [role]);

  // Reset all filters when the dialog is opened fresh
  React.useEffect(() => {
    if (open) {
      setRole("");
      setUserId("");
      setVolumeExact("");
      setVolumeMin("");
      setVolumeMax("");
      setTargetStatus("PROCESSING");
    }
  }, [open]);

  const handleExport = async () => {
    setExporting(true);
    try {
      // Build payload — only pass non-empty filters
      const body: Record<string, unknown> = {
        network,
        targetStatus,
      };
      if (userId) body.userId = userId;
      // Volume filters: exact overrides min/max (matches the image hint)
      if (volumeExact) {
        // exact volume in MB → convert to GB for the API (orders store gbAmount)
        body.volumeExactMb = Number(volumeExact);
      } else {
        if (volumeMin) body.volumeMinMb = Number(volumeMin);
        if (volumeMax) body.volumeMaxMb = Number(volumeMax);
      }

      const res = await fetch("/api/admin/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (!res.ok) {
        toast(json.error ?? "Export failed", "error");
        return;
      }
      if (!json.count) {
        toast("No matching PENDING orders found with the selected filters", "error");
        return;
      }

      downloadBase64(json.fileName, json.fileBase64);
      toast(
        `Export ${json.exportCode} created — ${json.count} order(s) moved to ${targetStatus}`,
        "success"
      );
      onClose();
      onExported();
    } finally {
      setExporting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0d1526]"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-6 pb-4">
          <div>
            <h2 className="text-lg font-bold leading-tight">
              Export {network}{" "}
              <span className="text-brand-600 dark:text-brand-400">
                — {pendingCount} PENDING Orders
              </span>
            </h2>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              Export matching order lines to Excel and create a tracked batch. Use
              filters below to narrow by role, user, or volume (MB).
            </p>
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
              {pendingCount} pending · {pendingGb} GB · {formatGHS(pendingAmount)}.
              Filters may reduce the export.
            </p>
          </div>
          <button
            onClick={onClose}
            className="mt-0.5 shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 pb-2">
          {/* Filters box */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/5 dark:bg-white/[0.02]">
            <p className="mb-0.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
              Filters
            </p>
            <p className="mb-4 text-xs text-slate-400 dark:text-slate-500">
              Optional. Volume values use the same units as order lines (MB).
              Exact volume overrides min/max if set.
            </p>

            <div className="space-y-4">
              {/* By role */}
              <div>
                <Label htmlFor="export-role" className="mb-1.5 block">
                  By role
                </Label>
                <Select
                  id="export-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  <option value="">All roles</option>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r.charAt(0) + r.slice(1).toLowerCase()}
                    </option>
                  ))}
                </Select>
              </div>

              {/* By user */}
              <div>
                <Label htmlFor="export-user" className="mb-1.5 block">
                  By user
                </Label>
                <Select
                  id="export-user"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  disabled={usersLoading}
                >
                  <option value="">
                    {usersLoading ? "Loading users…" : "All users"}
                  </option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </Select>
              </div>

              {/* Volume exact */}
              <div>
                <Label htmlFor="export-vol-exact" className="mb-1.5 block">
                  Volume (MB, exact)
                </Label>
                <Input
                  id="export-vol-exact"
                  type="number"
                  min={0}
                  placeholder="e.g. 2000"
                  value={volumeExact}
                  onChange={(e) => setVolumeExact(e.target.value)}
                />
              </div>

              {/* Min / Max volume */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="export-vol-min" className="mb-1.5 block">
                    Min volume (MB)
                  </Label>
                  <Input
                    id="export-vol-min"
                    type="number"
                    min={0}
                    placeholder="Min"
                    value={volumeMin}
                    onChange={(e) => setVolumeMin(e.target.value)}
                    disabled={!!volumeExact}
                  />
                </div>
                <div>
                  <Label htmlFor="export-vol-max" className="mb-1.5 block">
                    Max volume (MB)
                  </Label>
                  <Input
                    id="export-vol-max"
                    type="number"
                    min={0}
                    placeholder="Max"
                    value={volumeMax}
                    onChange={(e) => setVolumeMax(e.target.value)}
                    disabled={!!volumeExact}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Change status to */}
          <div className="mt-5">
            <Label htmlFor="export-target-status" className="mb-1.5 block">
              Change status to{" "}
              <span className="font-normal text-slate-400">(required)</span>
            </Label>
            <Select
              id="export-target-status"
              value={targetStatus}
              onChange={(e) => setTargetStatus(e.target.value)}
              className={cn(
                "border-brand-400 ring-1 ring-brand-200 dark:border-brand-500/60 dark:ring-brand-500/20"
              )}
            >
              {EXPORT_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
            <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
              Defaults to <strong>Processing</strong>. Orders left unchanged when
              set to &quot;Pending (keep as-is)&quot;.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 p-4 dark:border-white/5">
          <Button variant="outline" onClick={onClose} disabled={exporting}>
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={exporting || pendingCount === 0}
            className="gap-1.5"
          >
            {exporting ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <FileSpreadsheet className="h-4 w-4" />
            )}
            {exporting ? "Exporting…" : "Export"}
          </Button>
        </div>
      </div>
    </div>
  );
}
