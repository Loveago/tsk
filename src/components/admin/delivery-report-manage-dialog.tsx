"use client";

import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/shared";
import { StatusBadge, DeliveryReportStatusBadge } from "@/components/status-badge";
import { formatGHS, formatDateTime } from "@/lib/types";
import { orderCode } from "@/lib/utils";
import { type NotReceivedReportDetail } from "@/components/orders/not-received-report-dialog";
import { useToast } from "@/components/toast";
import {
  Image as ImageIcon,
  Upload,
  Eye,
  CheckCircle2,
  MessageSquarePlus,
  Clipboard,
} from "lucide-react";

const MAX_PROOF_BYTES = 4 * 1024 * 1024; // 4 MB — mirrors the proof API limit

export type ReportStatusAction =
  | "MARK_UNDER_REVIEW"
  | "RESOLVE_CONFIRM_SENT"
  | "RESOLVE"
  | "RESOLVE_REFUNDED"
  | "REJECT";

interface StatusOption {
  action: ReportStatusAction;
  label: string;
  badge: string;
  hint: string;
  isClose: boolean;
  activeColor: string;
}

const STATUS_OPTIONS: StatusOption[] = [
  {
    action: "MARK_UNDER_REVIEW",
    label: "Under Review",
    badge: "UNDER REVIEW",
    hint: "Keep report open while reviewing the case",
    isClose: false,
    activeColor: "border-violet-500 bg-violet-50 text-violet-800 dark:bg-violet-500/10 dark:text-violet-300 shadow-sm",
  },
  {
    action: "RESOLVE_CONFIRM_SENT",
    label: "Confirm Sent",
    badge: "CONFIRM SENT",
    hint: "Close report — data confirmed sent successfully",
    isClose: true,
    activeColor: "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300 shadow-sm",
  },
  {
    action: "RESOLVE",
    label: "Resolved",
    badge: "RESOLVED",
    hint: "Close report as resolved (order unchanged)",
    isClose: true,
    activeColor: "border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-500/10 dark:text-brand-300 shadow-sm",
  },
  {
    action: "RESOLVE_REFUNDED",
    label: "Refunded",
    badge: "REFUNDED",
    hint: "Close report and refund order if failed",
    isClose: true,
    activeColor: "border-cyan-500 bg-cyan-50 text-cyan-800 dark:bg-cyan-500/10 dark:text-cyan-300 shadow-sm",
  },
  {
    action: "REJECT",
    label: "Reject",
    badge: "REJECTED",
    hint: "Reject customer report — leave order untouched",
    isClose: true,
    activeColor: "border-red-500 bg-red-50 text-red-800 dark:bg-red-500/10 dark:text-red-400 shadow-sm",
  },
];

/**
 * Admin "Manage report" dialog:
 *  1. Order Details & Report Time
 *  2. Actions First (Under Review, Confirm Sent, Resolved, Refunded, Reject)
 *  3. Delivery Evidence (Upload / Clipboard Paste)
 *  4. Optional Message / Note
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
  const [selectedAction, setSelectedAction] = React.useState<ReportStatusAction>("RESOLVE_CONFIRM_SENT");
  const [message, setMessage] = React.useState("");

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
      setMessage("");
      setSelectedAction("RESOLVE_CONFIRM_SENT");
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
      setMessage("");
      await load();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const handleApplyAction = () => {
    const trimmed = message.trim();
    act(selectedAction, {
      resolutionNote: trimmed || undefined,
      adminResponse: trimmed || undefined,
    });
  };

  const handleSendResponseOnly = () => {
    const trimmed = message.trim();
    if (!trimmed) {
      toast("Please enter a response message", "error");
      return;
    }
    act("ADD_RESPONSE", { adminResponse: trimmed });
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

  const uploadProof = React.useCallback(async (file: File) => {
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
  }, [reportId, load, onChanged, toast]);

  // Global clipboard paste listener for proof image
  React.useEffect(() => {
    if (!open || !reportId) return;

    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        const textData = e.clipboardData?.getData("text/plain");
        if (textData) return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            toast("Pasting proof image from clipboard…", "info");
            uploadProof(file);
            break;
          }
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [open, reportId, uploadProof, toast]);

  const isClosed =
    report
      ? report.status === "RESOLVED" ||
        report.status === "REJECTED" ||
        report.status === "REFUNDED" ||
        report.status === "CONFIRM_SENT"
      : false;

  const currentOption = STATUS_OPTIONS.find((s) => s.action === selectedAction) ?? STATUS_OPTIONS[1];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={report ? `Manage Report ${report.code}` : "Manage Report"}
      className="max-w-xl max-h-[85vh] sm:max-h-[90vh] overflow-y-auto"
    >
      {loading || !report ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6 text-brand-600" />
        </div>
      ) : (
        <div className="space-y-4 text-sm pr-1">
          {/* 1. ORDER DETAILS & REPORT TIME */}
          <section className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 dark:border-white/10 dark:bg-white/[0.02] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-2.5 dark:border-white/5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                  {report.code}
                </span>
                <DeliveryReportStatusBadge status={report.status} />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Filed: <strong className="text-slate-700 dark:text-slate-200">{formatDateTime(report.createdAt)}</strong>
              </p>
            </div>

            {/* Order info grid */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 text-xs">
              <div>
                <p className="text-[11px] text-slate-500">Order Code</p>
                <p className="font-mono font-bold text-slate-800 dark:text-slate-200">{orderCode(report.order.id)}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">Order Status</p>
                <div className="mt-0.5"><StatusBadge status={report.order.status} /></div>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">Recipient</p>
                <p className="font-medium text-slate-800 dark:text-slate-200">{report.order.phoneNumber}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">Network & Size</p>
                <p className="font-medium text-slate-800 dark:text-slate-200">{report.order.network} · {report.order.gbAmount} GB</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">Amount</p>
                <p className="font-semibold text-slate-800 dark:text-slate-200">{formatGHS(report.order.amount)}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">Batch</p>
                <p className="font-mono font-medium text-slate-800 dark:text-slate-200 truncate">
                  {report.order.batch?.batchCode ?? "Single"}
                </p>
              </div>
            </div>

            {/* Customer reason / message */}
            {(report.reason || report.message) && (
              <div className="rounded-lg bg-amber-50/70 border border-amber-200/70 p-2.5 text-xs text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                <p className="font-semibold">Reason: {report.reason || "Not received"}</p>
                {report.message && <p className="mt-1 text-slate-600 dark:text-slate-300">{report.message}</p>}
              </div>
            )}

            {/* Current response if any */}
            {report.adminResponse && (
              <div className="rounded-lg border border-teal-200 bg-teal-50/80 p-2.5 text-xs dark:border-teal-500/20 dark:bg-teal-500/10">
                <p className="font-semibold text-teal-800 dark:text-teal-300">Previous Response to Customer:</p>
                <p className="mt-0.5 text-teal-900 dark:text-teal-200">{report.adminResponse}</p>
              </div>
            )}
          </section>

          {/* 2. ACTIONS FIRST */}
          <section className="rounded-xl border border-slate-200 p-3.5 dark:border-white/10 space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Select Status
              </p>
              {isClosed && (
                <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                  Report is closed
                </span>
              )}
            </div>

            {!isClosed ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {STATUS_OPTIONS.map((opt) => {
                  const isSelected = selectedAction === opt.action;
                  return (
                    <button
                      key={opt.action}
                      type="button"
                      onClick={() => setSelectedAction(opt.action)}
                      className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition-all ${
                        isSelected
                          ? opt.activeColor
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-white/20 dark:hover:bg-white/[0.04]"
                      }`}
                    >
                      <span className="text-xs font-bold">{opt.label}</span>
                      <span className="mt-1 text-[10px] leading-tight opacity-75">{opt.hint}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                This report is closed ({report.status}). You can still send an additional message to the customer below.
              </div>
            )}
          </section>

          {/* 3. UPLOAD / PASTE FROM CLIPBOARD */}
          <section className="rounded-xl border border-slate-200 p-3.5 dark:border-white/10 space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Delivery Evidence
              </p>
              {report.proofImageMime && (
                <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  Proof Attached
                </span>
              )}
            </div>

            <EvidenceBox
              reportId={report.id}
              hasProof={!!report.proofImageMime}
              uploadedAt={report.proofImageUploadedAt}
              proofUrl={proofUrl}
              uploading={uploading}
              onView={viewProof}
              onUpload={uploadProof}
            />
          </section>

          {/* 4. OPTIONAL MESSAGE & SUBMIT */}
          <section className="rounded-xl border border-slate-200 p-3.5 dark:border-white/10 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Optional Message / Note
            </p>
            <textarea
              className="h-20 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500 caret-brand-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100 dark:placeholder:text-slate-500 dark:caret-brand-400"
              placeholder="e.g. Verified with network: 5GB bundle successfully credited on 15 Sep."
              value={message}
              maxLength={1000}
              onChange={(e) => setMessage(e.target.value)}
            />

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              {isClosed ? (
                <Button
                  size="sm"
                  disabled={busy || !message.trim()}
                  onClick={handleSendResponseOnly}
                  className="gap-1.5"
                >
                  <MessageSquarePlus className="h-3.5 w-3.5" /> Send Message to Customer
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={handleApplyAction}
                  className="gap-1.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold"
                >
                  {busy ? <Spinner className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Apply: {currentOption.label}
                </Button>
              )}
            </div>
          </section>
        </div>
      )}
    </Dialog>
  );
}

function EvidenceBox({
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
  const [dragActive, setDragActive] = React.useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith("image/")) {
      onUpload(file);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          onUpload(file);
          break;
        }
      }
    }
  };

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onPaste={handlePaste}
        tabIndex={0}
        onClick={() => fileRef.current?.click()}
        className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-3.5 text-center transition cursor-pointer outline-none focus:border-brand-500 ${
          dragActive
            ? "border-brand-500 bg-brand-50/50 dark:bg-brand-500/10"
            : "border-slate-200 bg-slate-50/60 hover:border-slate-300 dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-white/20"
        }`}
      >
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
          <Clipboard className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          <span>Paste screenshot from clipboard (Ctrl+V) or click to browse</span>
        </div>
        <p className="mt-1 text-[11px] text-slate-400">
          Supports JPG, PNG, WEBP up to 4 MB
        </p>
      </div>

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

      {hasProof && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
          <p className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <ImageIcon className="h-4 w-4 text-emerald-500" />
            Proof uploaded {uploadedAt ? `· ${formatDateTime(uploadedAt)}` : ""}
          </p>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" disabled={uploading} onClick={onView}>
              <Eye className="mr-1 h-3.5 w-3.5" /> View
            </Button>
            <Button size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
              <Upload className="mr-1 h-3.5 w-3.5" /> {uploading ? "Uploading…" : "Replace"}
            </Button>
          </div>
        </div>
      )}

      {proofUrl && (
        <div className="mt-2 space-y-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={proofUrl}
            alt={`Delivery proof for report ${reportId}`}
            className="max-h-52 w-full rounded-lg border border-slate-200 object-contain dark:border-white/10"
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
    </div>
  );
}