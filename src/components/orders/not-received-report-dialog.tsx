"use client";

import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/shared";
import { StatusBadge, DeliveryReportStatusBadge } from "@/components/status-badge";
import { formatGHS, formatDateTime } from "@/lib/types";
import { orderCode } from "@/lib/utils";
import { ShieldCheck, Image as ImageIcon } from "lucide-react";

export interface NotReceivedReportDetail {
  id: string;
  seq: number;
  code: string;
  status: string;
  reason: string | null;
  message: string | null;
  adminNote: string | null;
  adminResponse: string | null;
  respondedAt: string | null;
  respondedBy?: string | null;
  proofImageMime: string | null;
  proofImageUploadedAt: string | null;
  resolvedAt: string | null;
  resolvedBy?: string | null;
  createdAt: string;
  events: { id: number; type: string; message: string | null; actorLabel: string; createdAt: string }[];
  order: {
    id: number;
    phoneNumber: string;
    network: string;
    gbAmount: number;
    amount: number;
    status: string;
    completedAt: string | null;
    batch: { batchCode: string } | null;
  };
}

export const EVENT_LABELS: Record<string, string> = {
  SUBMITTED: "Report submitted",
  INVESTIGATION_STARTED: "Investigation started",
  RESPONSE_ADDED: "Administrative response added",
  EVIDENCE_UPLOADED: "Delivery evidence uploaded",
  MARKED_DELIVERED: "Marked as delivered",
  KEEP_INVESTIGATING: "Still investigating",
  REJECTED: "Report rejected",
  RESOLVED: "Report resolved",
  RESEND: "Order queued for resend",
  REFUND: "Order refunded",
};

/** User-facing Not Received report view (§15): report info, order info, response, evidence, timeline. */
export function NotReceivedReportDetailDialog({
  reportId,
  open,
  onClose,
}: {
  reportId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [report, setReport] = React.useState<NotReceivedReportDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [proofOpen, setProofOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open || !reportId) {
      setReport(null);
      setProofOpen(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/reports/not-received/${reportId}`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setReport(json.report ?? null);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, reportId]);

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title={report ? `Not Received Report ${report.code}` : "Not Received Report"}
        className="max-w-2xl"
      >
        {loading || !report ? (
          <div className="flex justify-center py-12">
            <Spinner className="h-6 w-6 text-brand-600" />
          </div>
        ) : (
          <div className="space-y-5 text-sm">
            <ReportInfoSection report={report} />
            <OrderInfoSection order={report.order} />
            {report.adminResponse && <AdminResponseSection report={report} />}
            {report.proofImageMime && (
              <EvidenceSection
                reportId={report.id}
                uploadedAt={report.proofImageUploadedAt}
                onView={() => setProofOpen(true)}
              />
            )}
            {report.events.length > 0 && <TimelineSection events={report.events} />}
          </div>
        )}
      </Dialog>

      <Dialog open={proofOpen} onClose={() => setProofOpen(false)} title="Delivery proof" className="max-w-2xl">
        {reportId && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/reports/not-received/${reportId}/proof`}
            alt="Delivery proof"
            className="max-h-[70vh] w-full rounded-lg object-contain"
          />
        )}
      </Dialog>
    </>
  );
}

function ReportInfoSection({ report }: { report: NotReceivedReportDetail }) {
  return (
    <section>
      <p className="mb-2 text-xs font-semibold text-slate-500">REPORT INFORMATION</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-slate-500">Report</p>
          <p className="font-mono font-semibold">{report.code}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Status</p>
          <DeliveryReportStatusBadge status={report.status} />
        </div>
        <div>
          <p className="text-xs text-slate-500">Reason</p>
          <p>{report.reason ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Reported</p>
          <p>{formatDateTime(report.createdAt)}</p>
        </div>
      </div>
      {report.message && (
        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-white/[0.04] dark:text-slate-300">
          {report.message}
        </p>
      )}
    </section>
  );
}

function OrderInfoSection({ order }: { order: NotReceivedReportDetail["order"] }) {
  return (
    <section>
      <p className="mb-2 text-xs font-semibold text-slate-500">ORDER INFORMATION</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-slate-500">Order</p>
          <p className="font-mono font-semibold">{orderCode(order.id)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Order status</p>
          <StatusBadge status={order.status} />
        </div>
        <div>
          <p className="text-xs text-slate-500">Recipient</p>
          <p>{order.phoneNumber}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Network</p>
          <p>{order.network}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Size</p>
          <p>{order.gbAmount} GB</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Amount</p>
          <p>{formatGHS(order.amount)}</p>
        </div>
      </div>
    </section>
  );
}

function AdminResponseSection({ report }: { report: NotReceivedReportDetail }) {
  return (
    <section className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-3 dark:border-teal-500/20 dark:bg-teal-500/10">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-teal-700 dark:text-teal-400">
        <ShieldCheck className="h-3.5 w-3.5" /> ADMINISTRATIVE RESPONSE
      </p>
      <p className="mt-1.5 text-teal-800 dark:text-teal-300">{report.adminResponse}</p>
      {report.respondedAt && (
        <p className="mt-1 text-[11px] text-teal-600/70 dark:text-teal-400/70">
          {formatDateTime(report.respondedAt)}
          {report.respondedBy ? ` · by ${report.respondedBy}` : ""}
        </p>
      )}
    </section>
  );
}

function EvidenceSection({
  reportId,
  uploadedAt,
  onView,
}: {
  reportId: string;
  uploadedAt: string | null;
  onView: () => void;
}) {
  return (
    <section>
      <p className="mb-2 text-xs font-semibold text-slate-500">DELIVERY EVIDENCE</p>
      <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 dark:border-white/10">
        <p className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <ImageIcon className="h-4 w-4 text-slate-400" />
          Proof image uploaded
          {uploadedAt ? ` · ${formatDateTime(uploadedAt)}` : ""}
        </p>
        <Button size="sm" variant="outline" onClick={onView}>
          View Proof Image
        </Button>
      </div>
    </section>
  );
}

function TimelineSection({ events }: { events: NotReceivedReportDetail["events"] }) {
  return (
    <section>
      <p className="mb-2 text-xs font-semibold text-slate-500">REPORT TIMELINE</p>
      <ol className="space-y-3 border-l border-slate-200 pl-4 dark:border-white/10">
        {events.map((e) => (
          <li key={e.id} className="relative">
            <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-500" />
            <p className="font-medium">{EVENT_LABELS[e.type] ?? e.type}</p>
            {e.message && <p className="text-xs text-slate-500">{e.message}</p>}
            <p className="text-[11px] text-slate-400">
              {formatDateTime(e.createdAt)} · {e.actorLabel}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
