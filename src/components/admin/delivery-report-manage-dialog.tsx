"use client";

import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/shared";
import { StatusBadge, DeliveryReportStatusBadge } from "@/components/status-badge";
import { formatGHS, formatDateTime } from "@/lib/types";
import { orderCode } from "@/lib/utils";
import { EVENT_LABELS, type NotReceivedReportDetail } from "@/components/orders/not-received-report-dialog";
import { useToast } from "@/components/toast";
import {
  Image as ImageIcon,
  Upload,
  Eye,
  Search,
  CheckCircle2,
  XCircle,
  MessageSquarePlus,
  RefreshCw,
} from "lucide-react";

const MAX_PROOF_BYTES = 4 * 1024 * 1024; // 4 MB — mirrors the proof API limit

type ResolveAction = "RESOLVE_RESEND" | "RESOLVE_REFUND" | "REJECT";

const RESOLVE_LABELS: Record<ResolveAction, string> = {
  RESOLVE_RESEND: "Resend — queue order back to PROCESSING",
  RESOLVE_REFUND: "Refund — mark order REFUNDED",
  REJECT: "Reject report — leave order untouched",
};

/**
 * Admin "Manage report" dialog (§9/§16/§20): report + order info, admin
 * response, delivery evidence upload/view, the full workflow actions
 * (investigate / mark delivered / response / resolve / reject) and the
 * report timeline.
 */
export function DeliveryReportManageDialog({
  reportId,
  open,
  onClose,
  onChanged,
}: {
  reportId: string | null;
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const [report, setReport] = React.useState<NotReceivedReportDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [proofUrl, setProofUrl] = React.useState<string | null>(null);
  const [response, setResponse] = React.useState("");
  const [resolveAction, setResolveAction] = React.useState<ResolveAction>("RESOLVE_RESEND");
  const [note, setNote] = React.useState("");

  const load = React.useCallback(async () => {
    if (!reportId) {
      setReport(null);
      setProofUrl(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/not-received/${reportId}`);
      const json = await res.json();
      setReport(json.report ?? null);
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  React.useEffect(() => {
    if (open) {
      setResponse("");
      setNote("");
      setResolveAction("RESOLVE_RESEND");
      load();
    } else {
      setReport(null);
      setProofUrl(null);
    }
  }, [open, load]);

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    if (!reportId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/delivery-reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, action, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? "Action failed", "error");
        return;
      }
      toast(
        json.orderUpdated
          ? `Report updated — order moved to ${json.orderUpdated}`
          : "Report updated",
        "success"
      );
      setResponse("");
      setNote("");
      await load();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const viewProof = async () => {
    if (!reportId || proofUrl) return;
    const res = await fetch(`/api/reports/not-received/${reportId}/proof`);
    if (!res.ok) {
      toast("Failed to load proof image", "error");
      return;
    }
    setProofUrl(URL.createObjectURL(await res.blob()));
  };

  const uploadProof = async (file: File) => {
    if (!reportId) return;
    if (file.size > MAX_PROOF_BYTES) {
      toast("Proof image must be 4 MB or smaller", "error");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/admin/delivery-reports/${reportId}/proof`, {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? "Upload failed", "error");
        return;
      }
      toast("Delivery evidence uploaded", "success");
      setProofUrl(null);
      await load();
      onChanged?.();
    } finally {
      setUploading(false);
    }
  };

  const isClosed = report ? report.status === "RESOLVED" || report.status === "REJECTED" : false;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={report ? `Manage Report ${report.code}` : "Manage Report"}
      className="max-w-2xl"
    >
      {loading || !report ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6 text-brand-600" />
        </div>
      ) : (
        <ManageBody
          report={report}
          busy={busy}
          uploading={uploading}
          proofUrl={proofUrl}
          response={response}
          note={note}
          resolveAction={resolveAction}
          isClosed={isClosed}
          setResponse={setResponse}
          setNote={setNote}
          setResolveAction={setResolveAction}
          onAct={act}
          onViewProof={viewProof}
          onUploadProof={uploadProof}
        />
      )}
    </Dialog>
  );

interface ManageBodyProps {
  report: NotReceivedReportDetail;
  busy: boolean;
  uploading: boolean;
  proofUrl: string | null;
  response: string;
  note: string;
  resolveAction: ResolveAction;
  isClosed: boolean;
  setResponse: (v: string) => void;
  setNote: (v: string) => void;
  setResolveAction: (v: ResolveAction) => void;
  onAct: (action: string, extra?: Record<string, unknown>) => Promise<void>;
  onViewProof: () => Promise<void>;
  onUploadProof: (file: File) => Promise<void>;
}

function ManageBody({
  report,
  busy,
  uploading,
  proofUrl,
  response,
  note,
  resolveAction,
  isClosed,
  setResponse,
  setNote,
  setResolveAction,
  onAct,
  onViewProof,
  onUploadProof,
}: ManageBodyProps) {
  return (
    <div className="max-h-[75vh] space-y-5 overflow-y-auto pr-1 text-sm">
      <InfoSections report={report} />

      {report.adminResponse && (
        <section className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2.5 dark:border-teal-500/20 dark:bg-teal-500/10">
          <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">CURRENT RESPONSE TO CUSTOMER</p>
          <p className="mt-1 text-teal-800 dark:text-teal-300">{report.adminResponse}</p>
          {report.respondedAt && (
            <p className="mt-0.5 text-[11px] text-teal-600/70 dark:text-teal-400/70">
              {formatDateTime(report.respondedAt)}
              {report.respondedBy ? ` · by ${report.respondedBy}` : ""}
            </p>
          )}
        </section>
      )}

      <EvidenceSection
        reportId={report.id}
        hasProof={!!report.proofImageMime}
        uploadedAt={report.proofImageUploadedAt}
        proofUrl={proofUrl}
        uploading={uploading}
        onView={onViewProof}
        onUpload={onUploadProof}
      />

      <ActionsSection
        report={report}
        busy={busy}
        response={response}
        note={note}
        resolveAction={resolveAction}
        isClosed={isClosed}
        setResponse={setResponse}
        setNote={setNote}
        setResolveAction={setResolveAction}
        onAct={onAct}
      />

      <TimelineSection events={report.events} />
    </div>
  );
}

function InfoSections({ report }: { report: NotReceivedReportDetail }) {
  return (
    <>
      <section className="rounded-lg border border-slate-200 px-3 py-2.5 dark:border-white/10">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-500">REPORT</p>
          <DeliveryReportStatusBadge status={report.status} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Info label="Report code" value={report.code} mono />
          <Info label="Filed" value={formatDateTime(report.createdAt)} />
          <Info label="Reason" value={report.reason || "—"} />
          <Info
            label="Completed at"
            value={report.order.completedAt ? formatDateTime(report.order.completedAt) : "—"}
          />
        </div>
        {report.message && (
          <p className="mt-2 rounded-md bg-slate-50 p-2 text-xs text-slate-600 dark:bg-white/5 dark:text-slate-300">
            {report.message}
          </p>
        )}
        {report.adminNote && (
          <p className="mt-1.5 text-xs text-emerald-600 dark:text-emerald-400">Admin note: {report.adminNote}</p>
        )}
      </section>

      <section>
        <p className="mb-2 text-xs font-semibold text-slate-500">ORDER</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Info label="Order" value={orderCode(report.order.id)} mono />
          <Info label="Status" value={<StatusBadge status={report.order.status} />} />
          <Info label="Recipient" value={report.order.phoneNumber} />
          <Info label="Network" value={report.order.network} />
          <Info label="Size" value={`${report.order.gbAmount} GB`} />
          <Info label="Amount" value={formatGHS(report.order.amount)} />
        </div>
      </section>
    </>
  );
}

function Info({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={mono ? "font-mono text-xs font-semibold" : "text-xs font-medium"}>{value}</p>
    </div>
  );
}

function EvidenceSection({
  reportId,
  hasProof,
  uploadedAt,
  proofUrl,
  uploading,
  onView,
  onUpload,
}: {
  reportId: string;
  hasProof: boolean;
  uploadedAt: string | null;
  proofUrl: string | null;
  uploading: boolean;
  onView: () => Promise<void>;
  onUpload: (file: File) => Promise<void>;
}) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  return (
    <section>
      <p className="mb-2 text-xs font-semibold text-slate-500">DELIVERY EVIDENCE</p>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2.5 dark:border-white/10">
        <p className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <ImageIcon className="h-4 w-4 text-slate-400" />
          {hasProof
            ? `Proof image uploaded${uploadedAt ? ` · ${formatDateTime(uploadedAt)}` : ""}`
            : "No proof image yet"}
        </p>
        <div className="flex items-center gap-2">
          {hasProof && (
            <Button size="sm" variant="outline" disabled={uploading} onClick={onView}>
              <Eye className="mr-1.5 h-3.5 w-3.5" /> View
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
            <Upload className="mr-1.5 h-3.5 w-3.5" /> {uploading ? "Uploading…" : hasProof ? "Replace" : "Upload"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) onUpload(file);
            }}
          />
        </div>
      </div>
      {!hasProof && (
        <p className="mt-1 text-[11px] text-slate-400">
          JPG, PNG or WEBP up to 4 MB — becomes visible to the customer on their report.
        </p>
      )}
      {proofUrl && (
        <div className="mt-2 space-y-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={proofUrl}
            alt={`Delivery proof for report ${reportId}`}
            className="max-h-72 w-full rounded-lg border border-slate-200 object-contain dark:border-white/10"
          />
          <a
            href={proofUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-[11px] font-medium text-brand-600 hover:underline"
          >
            Open full size ↗
          </a>
        </div>
      )}
    </section>
  );
}

function ActionsSection({
  report,
  busy,
  response,
  note,
  resolveAction,
  isClosed,
  setResponse,
  setNote,
  setResolveAction,
  onAct,
}: {
  report: NotReceivedReportDetail;
  busy: boolean;
  response: string;
  note: string;
  resolveAction: ResolveAction;
  isClosed: boolean;
  setResponse: (v: string) => void;
  setNote: (v: string) => void;
  setResolveAction: (v: ResolveAction) => void;
  onAct: (action: string, extra?: Record<string, unknown>) => Promise<void>;
}) {
  const canWork = !isClosed && report.status !== "DELIVERED";
  return (
    <section className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-white/10">
      <p className="text-xs font-semibold text-slate-500">ACTIONS</p>

      {/* Workflow progress actions */}
      <div className="flex flex-wrap gap-2">
        {report.status === "OPEN" && (
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => onAct("START_INVESTIGATION")}>
            <Search className="mr-1.5 h-3.5 w-3.5" /> Start Investigating
          </Button>
        )}
        {report.status === "INVESTIGATING" && (
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => onAct("KEEP_INVESTIGATING")}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Keep Investigating
          </Button>
        )}
        {canWork && (
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => onAct("MARK_DELIVERED")}>
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Mark Delivered
          </Button>
        )}
      </div>

      {/* Administrative response — always allowed (server re-verifies) */}
      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
          <MessageSquarePlus className="h-3.5 w-3.5" /> ADMIN RESPONSE (visible to customer)
        </p>
        <textarea
          className="h-16 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs outline-none transition focus:border-brand-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100"
          placeholder="e.g. We have verified delivery with the network. Please see the attached proof."
          value={response}
          maxLength={1000}
          onChange={(e) => setResponse(e.target.value)}
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={busy || !response.trim()}
            onClick={() => onAct("ADD_RESPONSE", { adminResponse: response.trim() })}
          >
            Add Response
          </Button>
        </div>
      </div>


      {/* Resolve / reject — only while the report is open */}
      {!isClosed && (
        <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-white/5">
          <p className="text-[11px] font-semibold text-slate-500">CLOSE REPORT</p>
          <div className="space-y-1.5">
            {(Object.keys(RESOLVE_LABELS) as ResolveAction[]).map((a) => {
              const orderFailed = report.order.status === "FAILED";
              const disabled =
                (a === "RESOLVE_RESEND" || a === "RESOLVE_REFUND") && !orderFailed;
              return (
                <label
                  key={a}
                  className={
                    "flex items-start gap-2 rounded-lg border p-2.5 text-xs transition " +
                    (resolveAction === a
                      ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10"
                      : "border-slate-200 dark:border-white/10") +
                    (disabled ? " opacity-50" : " cursor-pointer")
                  }
                >
                  <input
                    type="radio"
                    name="manage-resolve"
                    checked={resolveAction === a}
                    disabled={disabled}
                    onChange={() => setResolveAction(a)}
                    className="mt-0.5"
                  />
                  <span>
                    {RESOLVE_LABELS[a]}
                    {disabled ? " (order is not FAILED)" : ""}
                  </span>
                </label>
              );
            })}
          </div>
          <textarea
            className="h-16 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs outline-none transition focus:border-brand-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100"
            placeholder="Resolution note (stored as admin note, visible in the timeline)"
            value={note}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => onAct(resolveAction, { resolutionNote: note || undefined })}
            >
              <XCircle className="mr-1.5 h-3.5 w-3.5" />
              {resolveAction === "REJECT" ? "Reject Report" : "Resolve Report"}
            </Button>
          </div>
        </div>
      )}
      {isClosed && (
        <p className="text-[11px] text-slate-400">
          This report is closed — only admin responses can still be added.
        </p>
      )}
    </section>
  );
}


function TimelineSection({ events }: { events: NotReceivedReportDetail["events"] }) {
  if (events.length === 0) return null;
  return (
    <section>
      <p className="mb-2 text-xs font-semibold text-slate-500">REPORT TIMELINE</p>
      <ol className="space-y-3 border-l border-slate-200 pl-4 dark:border-white/10">
        {events.map((e) => (
          <li key={e.id} className="relative">
            <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-500" />
            <p className="text-xs font-medium">{EVENT_LABELS[e.type] ?? e.type}</p>
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
}