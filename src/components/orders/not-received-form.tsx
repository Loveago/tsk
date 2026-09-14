"use client";

import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/shared";
import { useToast } from "@/components/toast";
import { formatDateTime, deliveryReportCode, REPORT_WINDOW_HOURS } from "@/lib/types";
import { orderCode } from "@/lib/utils";
import { Clock } from "lucide-react";

export const REPORT_REASONS = [
  "Data not received",
  "Partial data received",
  "Wrong number sent",
  "Other",
];

export interface ReportWindowInfo {
  completedAt: string | null;
  deadline: string | null;
  open: boolean;
  hasReport: boolean;
  windowHours?: number | null;
}

/** Report deadline banner inside the order details window (§6). */
export function ReportWindowBanner({ reportWindow }: { reportWindow: ReportWindowInfo | null }) {
  const [, setNow] = React.useState(Date.now());

  // Keep the countdown fresh
  React.useEffect(() => {
    if (!reportWindow?.open || !reportWindow.deadline) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [reportWindow?.open, reportWindow?.deadline]);

  if (!reportWindow || !reportWindow.completedAt || !reportWindow.deadline) return null;

  const hours = reportWindow.windowHours ?? REPORT_WINDOW_HOURS;

  if (reportWindow.open) {
    const ms = new Date(reportWindow.deadline).getTime() - Date.now();
    const totalMinutes = Math.max(0, Math.floor(ms / 60000));
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs dark:border-amber-500/20 dark:bg-amber-500/10">
        <p className="flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-400">
          <Clock className="h-3.5 w-3.5" />
          Not Received reporting available
          {reportWindow.hasReport
            ? " · report submitted"
            : ` · ${h > 0 ? `${h}h ${m}m` : `${m}m`} remaining`}
        </p>
        <p className="mt-0.5 text-amber-600/80 dark:text-amber-400/80">
          Reports can be submitted until {formatDateTime(reportWindow.deadline)} ({hours}h window)
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs dark:border-white/10 dark:bg-white/[0.04]">
      <p className="font-semibold text-slate-600 dark:text-slate-300">Reporting period expired</p>
      <p className="mt-0.5 text-slate-500 dark:text-slate-400">
        The {hours}-hour reporting period for this order has ended.
        {reportWindow.hasReport ? " Your submitted report remains available below." : ""}
      </p>
    </div>
  );
}

/** Not Received report creation dialog — posts to the existing report API. */
export function NotReceivedReportFormDialog({
  order,
  open,
  onClose,
  onSubmitted,
}: {
  order: { id: number; phoneNumber: string; gbAmount: number; network: string } | null;
  open: boolean;
  onClose: () => void;
  onSubmitted: (report: { id: string; seq: number }) => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = React.useState(REPORT_REASONS[0]);
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    if (!order) return;
    setBusy(true);
    try {
      const res = await fetch("/api/reports/not-received", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, reason, message: message || undefined }),
      });
      const json = await res.json();
      if (res.ok) {
        toast(`Report ${deliveryReportCode(json.report.seq)} submitted`, "success");
        setMessage("");
        setReason(REPORT_REASONS[0]);
        onSubmitted(json.report);
        onClose();
      } else {
        toast(json.error ?? "Failed to submit report", "error");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Report not received">
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Reporting <strong className="font-mono">{order ? orderCode(order.id) : ""}</strong> to{" "}
          {order?.phoneNumber} ({order?.gbAmount} GB {order?.network}).
        </p>
        <select
          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-brand-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          {REPORT_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <textarea
          className="h-20 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm outline-none transition focus:border-brand-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100"
          placeholder="Describe the issue (optional)"
          value={message}
          maxLength={600}
          onChange={(e) => setMessage(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={busy}>
            {busy ? <Spinner className="h-3.5 w-3.5" /> : "Submit report"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
