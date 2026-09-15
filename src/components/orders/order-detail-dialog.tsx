"use client";

import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { formatGHS, formatDateTime } from "@/lib/types";
import { orderCode } from "@/lib/utils";
import { FileWarning } from "lucide-react";
import {
  ReportWindowBanner,
  type ReportWindowInfo,
} from "@/components/orders/not-received-form";
import { NotReceivedReportDetailDialog } from "@/components/orders/not-received-report-dialog";

interface HistoryItem {
  id: number;
  status: string;
  note: string | null;
  changedBy: string;
  createdAt: string;
}

interface LightReport {
  id: string;
  seq: number;
  code?: string;
  status: string;
}

interface OrderDetail {
  id: number;
  phoneNumber: string;
  network: string;
  gbAmount: number;
  amount: number;
  status: string;
  source: string;
  providerReference: string | null;
  failureReason: string | null;
  history?: HistoryItem[];
  deliveryReport?: LightReport | null;
  reportWindow?: ReportWindowInfo | null;
}

export function OrderDetailDialog({
  order,
  open,
  onClose,
  onOrderChanged,
}: {
  order: OrderDetail | null;
  open: boolean;
  onClose: () => void;
  onOrderChanged?: () => void;
}) {
  const [submitting, setSubmitting] = React.useState(false);
  const [viewReportId, setViewReportId] = React.useState<string | null>(null);
  const [localReport, setLocalReport] = React.useState<LightReport | null>(null);

  // Reset nested dialogs whenever a different order is opened
  React.useEffect(() => {
    setViewReportId(null);
    setLocalReport(null);
  }, [order?.id, open]);

  const report = localReport ?? order?.deliveryReport ?? null;
  const canReport =
    order?.status === "SUCCESS" &&
    !!order?.reportWindow?.open &&
    !report;

  const handleDirectReport = async () => {
    if (!order) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/reports/not-received", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, reason: "Data not received" }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error ?? "Failed to file report");
        return;
      }
      setLocalReport({
        id: json.report?.id ?? json.id ?? "",
        seq: json.report?.seq ?? 0,
        status: "UNDER_REVIEW",
      });
      onOrderChanged?.();
    } catch {
      alert("Error filing report");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} title={order ? `Order ${orderCode(order.id)}` : "Order details"}>
        {order && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><p className="text-xs text-slate-500">Phone</p><p className="font-medium">{order.phoneNumber}</p></div>
              <div><p className="text-xs text-slate-500">Network</p><p className="font-medium">{order.network}</p></div>
              <div><p className="text-xs text-slate-500">Size</p><p className="font-medium">{order.gbAmount}GB</p></div>
              <div><p className="text-xs text-slate-500">Amount</p><p className="font-medium">{formatGHS(order.amount)}</p></div>
              <div><p className="text-xs text-slate-500">Source</p><p className="font-medium">{order.source}</p></div>
              <div><p className="text-xs text-slate-500">Status</p><StatusBadge status={order.status} /></div>
            </div>
            {order.providerReference && (
              <div>
                <p className="text-xs text-slate-500">Provider reference</p>
                <p className="font-mono text-xs">{order.providerReference}</p>
              </div>
            )}
            {order.failureReason && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-400">
                {order.failureReason}
              </div>
            )}

            {/* 24h reporting window (§6) */}
            {order.status === "SUCCESS" && <ReportWindowBanner reportWindow={order.reportWindow ?? null} />}

            {/* Not Received / View Report actions (§5/§7) */}
            {(canReport || report) && (
              <div className="flex flex-wrap justify-end gap-2">
                {canReport && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-amber-600 dark:text-amber-400"
                    disabled={submitting}
                    onClick={handleDirectReport}
                  >
                    <FileWarning className="h-3.5 w-3.5" />
                    {submitting ? "Sending Report…" : "Report Not Received"}
                  </Button>
                )}
                {report && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-amber-300 text-amber-700 dark:border-amber-500/30 dark:text-amber-400"
                    onClick={() => setViewReportId(report.id)}
                  >
                    Under Review · View Report {report.code ? `(${report.code})` : ""}
                  </Button>
                )}
              </div>
            )}

            <div>
              <p className="mb-2 text-xs font-semibold text-slate-500">STATUS HISTORY</p>
              <ol className="space-y-2">
                {(order.history ?? []).map((h) => (
                  <li key={h.id} className="flex items-start gap-2.5">
                    <StatusBadge status={h.status} />
                    <div className="min-w-0 flex-1">
                      {h.note && <p className="text-xs">{h.note}</p>}
                      <p className="text-[11px] text-slate-400">
                        {formatDateTime(h.createdAt)} · by {h.changedBy}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </Dialog>

      <NotReceivedReportDetailDialog
        reportId={viewReportId}
        open={!!viewReportId}
        onClose={() => setViewReportId(null)}
      />
    </>
  );
}
