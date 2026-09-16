"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { BATCH_STATUS_META, type BatchStatus } from "@/lib/types";

export function BatchStatusBadge({ status, className }: { status: string; className?: string }) {
  const upper = typeof status === "string" ? status.toUpperCase() : status;
  const meta = BATCH_STATUS_META[status] || BATCH_STATUS_META[upper] || (status === "COMPLETED" ? BATCH_STATUS_META["Processed"] : undefined);
  if (!meta) {
    return (
      <Badge variant="muted" className={className}>
        {status}
      </Badge>
    );
  }
  return (
    <Badge variant="muted" className={cn(meta.className, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </Badge>
  );
}

export interface BatchStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
}

export function BatchStatsChips({ stats, className }: { stats: BatchStats; className?: string }) {
  const chips = [
    { label: "pending", value: stats.pending, cls: "text-amber-600 dark:text-amber-400" },
    { label: "processing", value: stats.processing, cls: "text-blue-600 dark:text-blue-400" },
    { label: "processed", value: stats.completed, cls: "text-emerald-600 dark:text-emerald-400" },
    { label: "failed", value: stats.failed, cls: "text-red-600 dark:text-red-400" },
    { label: "refund", value: stats.cancelled, cls: "text-violet-500" },
  ];
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs", className)}>
      {chips.map((c) => (
        <span key={c.label} className={cn("font-medium", c.cls, c.value === 0 && "opacity-40")}>
          {c.value} {c.label}
        </span>
      ))}
    </div>
  );
}

/** Triggers a client-side download of a base64-encoded file (Excel workbook). */
export function downloadBase64(fileName: string, base64: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}