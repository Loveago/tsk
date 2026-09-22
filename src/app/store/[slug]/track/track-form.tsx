"use client";

import * as React from "react";
import {
  Clock,
  CheckCircle2,
  FileWarning,
  Eye,
  ShieldCheck,
  Image as ImageIcon,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { sanitizeCustomerRefundNote, sanitizeCustomerFacingText } from "@/lib/types";

interface DeliveryReportSummary {
  id: string;
  seq: number;
  code: string;
  status: string;
  reason?: string | null;
  adminResponse?: string | null;
  hasProof?: boolean;
  createdAt: string;
}

interface TrackedOrder {
  code: string;
  reference: string;
  phone?: string;
  email?: string | null;
  network: string;
  size: string;
  amount: number; // GHS
  status: string;
  createdAt: string;
  canReport?: boolean;
  deliveryReport?: DeliveryReportSummary | null;
  _hasReportedLocally?: boolean;
}

interface ReportDetailData {
  id: string;
  seq: number;
  code: string;
  status: string;
  reason: string | null;
  message: string | null;
  adminResponse: string | null;
  respondedAt: string | null;
  hasProof: boolean;
  proofImageUploadedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  events: {
    id: number;
    type: string;
    message: string | null;
    actorLabel: string;
    createdAt: string;
  }[];
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  PROCESSING: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  COMPLETED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  SUCCESS: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  FAILED: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  REFUNDED: "bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300",
};

const EVENT_LABELS: Record<string, string> = {
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
  MARKED_UNDER_REVIEW: "Marked as under review",
  REFUNDED: "Report closed — refunded",
  CONFIRM_SENT: "Report closed — data confirmed sent",
};

function getLocalDateString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTomorrowDateString() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return getLocalDateString(d);
}

export function TrackForm({ slug }: { slug: string }) {
  const [query, setQuery] = React.useState("");
  const [date, setDate] = React.useState(getLocalDateString);
  const maxDate = React.useMemo(() => getTomorrowDateString(), []);
  const handleTodayClick = () => setDate(getLocalDateString());
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [results, setResults] = React.useState<TrackedOrder[] | null>(null);

  // Single-action reporting state
  const [submittingReference, setSubmittingReference] = React.useState<string | null>(null);
  const [reportSuccessMessage, setReportSuccessMessage] = React.useState("");
  const [reportErrorMessage, setReportErrorMessage] = React.useState("");

  // Report Detail View State
  const [viewReportOrder, setViewReportOrder] = React.useState<TrackedOrder | null>(null);
  const [viewReportId, setViewReportId] = React.useState<string | null>(null);
  const [reportDetail, setReportDetail] = React.useState<ReportDetailData | null>(null);
  const [loadingDetail, setLoadingDetail] = React.useState(false);
  const [proofModalOpen, setProofModalOpen] = React.useState(false);

  async function track(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 4) {
      setError("Enter recipient phone number (e.g. 024 XXX XXXX), order ID, or payment reference.");
      return;
    }
    const digits = q.replace(/\D/g, "");
    const isPhone = !/[a-zA-Z]/.test(q) && digits.length >= 9;
    if (isPhone && !date) {
      setError("Please select the date the order was placed when tracking by phone number.");
      return;
    }
    setBusy(true);
    setError("");
    setResults(null);
    setReportSuccessMessage("");
    setReportErrorMessage("");
    try {
      const res = await fetch(`/api/store/${slug}/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, date }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not look up that order");
      setResults(data.orders as TrackedOrder[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not look up that order");
    } finally {
      setBusy(false);
    }
  }

  // Single action direct report (NO POPUP)
  async function directReportOrder(order: TrackedOrder) {
    setSubmittingReference(order.reference);
    setReportErrorMessage("");
    setReportSuccessMessage("");

    // Optimistically update locally so the button immediately turns to "Under Review"
    setResults((prev) =>
      prev
        ? prev.map((o) =>
            o.reference === order.reference
              ? {
                  ...o,
                  _hasReportedLocally: true,
                  canReport: false,
                  deliveryReport: {
                    id: "",
                    seq: 0,
                    code: "NR-PENDING",
                    status: "UNDER_REVIEW",
                    createdAt: new Date().toISOString(),
                  },
                }
              : o
          )
        : prev
    );

    try {
      const res = await fetch(`/api/store/${slug}/track/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference: order.reference,
          reason: "Data not received",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit report");
      }

      // Update with server report ID & code
      setResults((prev) =>
        prev
          ? prev.map((o) =>
              o.reference === order.reference
                ? {
                    ...o,
                    _hasReportedLocally: true,
                    canReport: false,
                    deliveryReport: {
                      id: data.report?.id || "",
                      seq: data.report?.seq || 0,
                      code: data.report?.code || "NR-00000",
                      status: data.report?.status || "UNDER_REVIEW",
                      createdAt: data.report?.createdAt || new Date().toISOString(),
                    },
                  }
                : o
            )
          : prev
      );

      setReportSuccessMessage("Report submitted — our team and network provider will investigate.");
    } catch (err) {
      // Revert optimistic update on error
      setResults((prev) =>
        prev
          ? prev.map((o) =>
              o.reference === order.reference
                ? {
                    ...o,
                    _hasReportedLocally: false,
                    canReport: true,
                    deliveryReport: null,
                  }
                : o
            )
          : prev
      );
      setReportErrorMessage(err instanceof Error ? err.message : "Failed to submit report");
    } finally {
      setSubmittingReference(null);
    }
  }

  // Open report detail modal
  async function openReportDetail(order: TrackedOrder, reportId: string) {
    if (!reportId) return;
    setViewReportOrder(order);
    setViewReportId(reportId);
    setLoadingDetail(true);
    setReportDetail(null);
    try {
      const res = await fetch(
        `/api/store/${slug}/track/report/${reportId}?reference=${encodeURIComponent(order.reference)}`
      );
      const data = await res.json();
      if (res.ok && data.report) {
        setReportDetail(data.report);
      }
    } catch (err) {
      console.error("Failed to load report detail:", err);
    } finally {
      setLoadingDetail(false);
    }
  }

  function renderReportElement(o: TrackedOrder) {
    const isCompleted = o.status === "COMPLETED" || o.status === "SUCCESS";
    const rep = o.deliveryReport;
    const isSubmitting = submittingReference === o.reference;

    // If order has an existing report or was just reported
    if (rep || o._hasReportedLocally) {
      const status = rep?.status || "UNDER_REVIEW";
      const isDelivered = status === "DELIVERED" || status === "CONFIRM_SENT";
      const isResolved = status === "RESOLVED";
      const isRefunded = status === "REFUNDED";
      const isRejected = status === "REJECTED";

      let badgeText = "Under Review";
      let badgeCls =
        "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20";
      if (isDelivered) {
        badgeText = rep?.hasProof ? "Confirmed Sent (Proof)" : "Confirm Sent";
        badgeCls =
          "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20";
      } else if (isResolved) {
        badgeText = "Resolved";
        badgeCls =
          "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20";
      } else if (isRefunded) {
        badgeText = "Refunded";
        badgeCls =
          "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-400 dark:border-cyan-500/20";
      } else if (isRejected) {
        badgeText = "Rejected";
        badgeCls =
          "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20";
      }

      return (
        <button
          type="button"
          disabled={!rep?.id}
          onClick={() => {
            if (rep?.id) openReportDetail(o, rep.id);
          }}
          className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${badgeCls} ${
            rep?.id ? "cursor-pointer hover:opacity-80" : "cursor-default"
          }`}
          title={rep?.id ? "Click to view review status and delivery proof" : "Under Review"}
        >
          <Clock className="h-3 w-3 shrink-0" />
          <span>{badgeText}</span>
          {rep?.hasProof && <Eye className="h-3 w-3 ml-0.5 shrink-0" />}
        </button>
      );
    }

    // Direct 1-action report button for completed orders (NO POPUP)
    if (isCompleted && o.canReport !== false) {
      return (
        <button
          type="button"
          onClick={() => directReportOrder(o)}
          disabled={isSubmitting}
          className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
          title="Report this order as data not received"
        >
          {isSubmitting ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" />
          ) : (
            <FileWarning className="h-3.5 w-3.5 shrink-0" />
          )}
          <span>{isSubmitting ? "Submitting…" : "Report"}</span>
        </button>
      );
    }

    return null;
  }

  return (
    <>
      <form onSubmit={track}>
        <label htmlFor="track-query" className="block text-sm font-bold text-slate-800 dark:text-slate-100">
          Recipient phone number, receipt email, or order reference
        </label>
        <input
          id="track-query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="024 XXX XXXX · you@example.com · CF-ST-... · STF-..."
          className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-yellow-400 caret-yellow-500 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-slate-500 dark:caret-yellow-400"
        />

        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-slate-600 dark:text-slate-300">Lookup by:</span>
          <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium dark:bg-white/10">📱 10-digit Phone</span>
          <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium dark:bg-white/10">✉️ Receipt Email</span>
          <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium dark:bg-white/10">🔖 Order Ref</span>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between">
            <label htmlFor="track-date" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Order Date{" "}
              <span className="text-[11px] font-normal text-slate-500">
                {query.includes("@") || /^CF-ST-|^STF-|^PSK-|^REG-/i.test(query.trim())
                  ? "(Optional for email / ref lookup)"
                  : "(Required for phone lookup)"}
              </span>
            </label>
            <button
              type="button"
              onClick={handleTodayClick}
              className="text-xs font-semibold text-yellow-600 hover:text-yellow-700 dark:text-yellow-400 dark:hover:underline"
            >
              Today
            </button>
          </div>
          <input
            id="track-date"
            type="date"
            value={date}
            max={maxDate}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition-colors focus:border-yellow-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {query.includes("@") || /^CF-ST-|^STF-|^PSK-|^REG-/i.test(query.trim())
              ? "Matches all recent orders matching your email or reference."
              : "Filters orders to the specific date placed to protect customer privacy."}
          </p>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="mt-4 w-full rounded-full bg-yellow-300 py-3.5 text-sm font-bold text-slate-900 shadow-md shadow-yellow-400/30 transition-colors hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Searching…" : "Track Order"}
        </button>
        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </p>
        )}
      </form>

      {reportSuccessMessage && (
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
          <span>{reportSuccessMessage}</span>
        </div>
      )}

      {reportErrorMessage && (
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-800">
          <FileWarning className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
          <span>{reportErrorMessage}</span>
        </div>
      )}

      {results && (
        <div className="mt-6 space-y-3">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {results.length === 0
              ? "No orders found for that query."
              : `${results.length} order${results.length === 1 ? "" : "s"} found`}
          </p>
          {results.map((o) => (
            <div
              key={o.reference}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3.5 sm:px-4 sm:py-3 dark:border-white/10 dark:bg-white/5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {o.network} {o.size} — ₵{o.amount.toFixed(2)}
                  </p>
                  {o.phone && (
                    <span className="font-mono text-xs font-semibold text-slate-600 dark:text-slate-300">
                      ({o.phone})
                    </span>
                  )}
                  {o.email && (
                    <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[180px]" title={o.email}>
                      · {o.email}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-400">
                  {o.code} · {new Date(o.createdAt).toLocaleString()}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${STATUS_STYLES[o.status] ?? STATUS_STYLES.REFUNDED}`}
                >
                  {o.status}
                </span>

                {/* Direct 1-action report button or report status badge */}
                {renderReportElement(o)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Report Detail Modal (opens when clicking on an existing report badge) */}
      {viewReportId && viewReportOrder && (
        <Dialog
          open={Boolean(viewReportId)}
          onClose={() => {
            setViewReportId(null);
            setViewReportOrder(null);
            setProofModalOpen(false);
          }}
          title={reportDetail ? `Report ${reportDetail.code}` : "Report Status"}
          description="Review status and investigation details for this delivery report."
          className="max-w-lg"
        >
          <div className="p-4 sm:p-5 space-y-4 max-h-[70vh] overflow-y-auto">
            {loadingDetail ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-amber-500" />
              </div>
            ) : reportDetail ? (
              <>
                <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-white/5 border border-slate-200/60 dark:border-white/10">
                  <div>
                    <div className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                      {reportDetail.code}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Submitted: {new Date(reportDetail.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${
                      reportDetail.status === "DELIVERED" || reportDetail.status === "CONFIRM_SENT"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                        : reportDetail.status === "RESOLVED"
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
                        : reportDetail.status === "REFUNDED"
                        ? "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300"
                        : reportDetail.status === "REJECTED"
                        ? "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300"
                        : "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300"
                    }`}
                  >
                    {reportDetail.status.replace(/_/g, " ")}
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Reason: </span>
                    <span className="text-slate-600 dark:text-slate-400">{reportDetail.reason || "Data not received"}</span>
                  </div>
                  {reportDetail.adminResponse && (
                    <div className="rounded-xl border border-blue-200/80 bg-blue-50/60 p-3 text-xs dark:border-blue-900/60 dark:bg-blue-950/30">
                      <div className="font-semibold text-blue-900 dark:text-blue-300 mb-1 flex items-center gap-1.5">
                        <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        Investigation Response
                      </div>
                      <p className="text-blue-800 dark:text-blue-200">
                        {sanitizeCustomerRefundNote(reportDetail.adminResponse, viewReportOrder?.amount)}
                      </p>
                    </div>
                  )}
                </div>

                {/* Delivery Proof Evidence */}
                {reportDetail.hasProof && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-semibold text-emerald-900 dark:text-emerald-300">
                        <ImageIcon className="h-4 w-4 text-emerald-600" />
                        <span>Delivery Evidence Proof Attached</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setProofModalOpen(true)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 underline hover:opacity-80"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View Proof
                      </button>
                    </div>
                  </div>
                )}

                {/* Timeline Events */}
                {reportDetail.events && reportDetail.events.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-white/5">
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Activity Timeline
                    </div>
                    <div className="space-y-2">
                      {reportDetail.events.map((evt) => (
                        <div
                          key={evt.id}
                          className="flex items-start gap-2.5 text-[11px] text-slate-600 dark:text-slate-400"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <span className="font-medium text-slate-900 dark:text-white">
                              {sanitizeCustomerFacingText(EVENT_LABELS[evt.type] || evt.type)}
                            </span>
                            {evt.message && (
                              <p className="text-slate-500 dark:text-slate-400">
                                {sanitizeCustomerFacingText(evt.message)}
                              </p>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 shrink-0">
                            {new Date(evt.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-slate-500 text-center py-4">Report information not available.</p>
            )}
          </div>
        </Dialog>
      )}

      {/* Proof Image Viewer Dialog */}
      {proofModalOpen && viewReportId && viewReportOrder && (
        <Dialog
          open={proofModalOpen}
          onClose={() => setProofModalOpen(false)}
          title="Delivery Evidence Proof"
          description="Network confirmation receipt provided for this delivery."
          className="max-w-2xl"
        >
          <div className="p-4 sm:p-5 flex flex-col items-center justify-center space-y-3">
            <div className="max-h-[60vh] overflow-auto rounded-xl border border-slate-200 dark:border-white/10 p-2 bg-slate-50 dark:bg-black/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/store/${slug}/track/report/${viewReportId}/proof?reference=${encodeURIComponent(
                  viewReportOrder.reference
                )}`}
                alt="Delivery proof"
                className="max-h-[55vh] w-auto rounded-lg object-contain"
              />
            </div>
            <a
              href={`/api/store/${slug}/track/report/${viewReportId}/proof?reference=${encodeURIComponent(
                viewReportOrder.reference
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open full-resolution image in new tab
            </a>
          </div>
        </Dialog>
      )}
    </>
  );
}
