"use client";

import * as React from "react";
import { PageHeader, Spinner, EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Search,
  RefreshCw,
  Send,
  ShieldCheck,
  Info,
} from "lucide-react";
import { formatDateTime } from "@/lib/types";

interface VerificationItem {
  id: string;
  number: string;
  normalizedNumber: string;
  status: "SUBMITTED" | "PROCESSING" | "VERIFIED" | "REJECTED";
  submittedAt: string;
  verifiedAt?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  batch?: { batchReference: string; status: string } | null;
}

export default function UserMtnVerificationPage() {
  const { toast } = useToast();
  const [phoneNumber, setPhoneNumber] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [items, setItems] = React.useState<VerificationItem[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [pageSize] = React.useState(15);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("ALL");
  const [instructions, setInstructions] = React.useState("");
  const [verificationEnabled, setVerificationEnabled] = React.useState(false);
  const [submissionFeedback, setSubmissionFeedback] = React.useState<{
    type: "success" | "verified" | "pending" | "error";
    message: string;
  } | null>(null);

  const fetchItems = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (search.trim()) params.set("q", search.trim());

      const res = await fetch(`/api/mtn-verification?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load verification requests");
      const data = await res.json();
      setItems(data.data ?? []);
      setTotal(data.total ?? 0);
      if (data.instructions) setInstructions(data.instructions);
      if (typeof data.verificationEnabled === "boolean") {
        setVerificationEnabled(data.verificationEnabled);
      }
    } catch (err: any) {
      toast(err.message ?? "Error loading data", "error");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, search, toast]);

  React.useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!phoneNumber.trim()) {
      return toast("Please enter an MTN phone number", "error");
    }

    setSubmitting(true);
    setSubmissionFeedback(null);
    try {
      const res = await fetch("/api/mtn-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: phoneNumber.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setSubmissionFeedback({
          type: "error",
          message: data.error ?? "Failed to submit number",
        });
        toast(data.error ?? "Submission failed", "error");
        return;
      }

      if (data.status === "VERIFIED") {
        setSubmissionFeedback({
          type: "verified",
          message: "✓ This number is already verified. You can purchase MTN bundles for it immediately.",
        });
        toast("Number is already verified!", "success");
      } else if (data.status === "ALREADY_PENDING") {
        setSubmissionFeedback({
          type: "pending",
          message: "◷ This number already has an active verification request in progress.",
        });
        toast("Verification request already pending", "info");
      } else {
        setSubmissionFeedback({
          type: "success",
          message: "Number submitted successfully! You will see the status update below.",
        });
        toast("Submitted for MTN verification", "success");
        setPhoneNumber("");
      }

      fetchItems();
    } catch (err: any) {
      toast(err.message ?? "An error occurred", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (item: VerificationItem) => {
    switch (item.status) {
      case "VERIFIED":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Verified
          </span>
        );
      case "PROCESSING":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-600/20 dark:bg-blue-500/10 dark:text-blue-400">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            Processing
          </span>
        );
      case "REJECTED":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-600/20 dark:bg-red-500/10 dark:text-red-400">
            <XCircle className="h-3.5 w-3.5" />
            Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400">
            <Clock className="h-3.5 w-3.5" />
            Submitted
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="MTN Number Verification"
        description="Verify recipient MTN phone numbers before placing orders"
      />

      {/* Verification Enforcement Notice */}
      {verificationEnabled ? (
        <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
          <ShieldCheck className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">MTN Number Verification is currently active</p>
            <p className="text-xs text-blue-800 dark:text-blue-300">
              Only verified MTN recipient numbers can be used when ordering MTN data bundles. Telecel and AirtelTigo bundles are not affected.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300">
          <Info className="h-5 w-5 shrink-0 text-slate-500 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Optional MTN Verification</p>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Verification enforcement is currently OFF. You can still verify recipient numbers in advance to ensure smooth future deliveries.
            </p>
          </div>
        </div>
      )}

      {/* Submit Card */}
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">
          Submit an MTN Number
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {instructions || "Submit your MTN number for verification before purchasing MTN packages. Prefixes: 024, 025, 053, 054, 055, 059."}
        </p>

        <form onSubmit={handleSubmit} className="mt-5 max-w-md space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="phoneNumber">MTN Phone Number</Label>
            <div className="flex gap-2">
              <Input
                id="phoneNumber"
                type="text"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="e.g. 0241234567"
                className="font-mono text-sm"
                disabled={submitting}
              />
              <Button type="submit" disabled={submitting || !phoneNumber.trim()} className="shrink-0">
                {submitting ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4 mr-1.5" />}
                Submit
              </Button>
            </div>
            <p className="text-[11px] text-slate-400">
              Accepts 024XXXXXXX, 233XXXXXXXXX, or +233XXXXXXXXX format.
            </p>
          </div>

          {submissionFeedback && (
            <div
              className={`rounded-xl p-3.5 text-xs font-medium flex items-start gap-2 ${
                submissionFeedback.type === "verified"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30"
                  : submissionFeedback.type === "pending"
                  ? "bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30"
                  : submissionFeedback.type === "success"
                  ? "bg-blue-50 text-blue-800 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30"
                  : "bg-red-50 text-red-800 border border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/30"
              }`}
            >
              {submissionFeedback.type === "verified" && <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />}
              {submissionFeedback.type === "pending" && <Clock className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />}
              {submissionFeedback.type === "success" && <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-blue-600" />}
              {submissionFeedback.type === "error" && <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />}
              <span>{submissionFeedback.message}</span>
            </div>
          )}
        </form>
      </div>

      {/* Submitted Requests List */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Your Submitted MTN Numbers
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Track real-time verification status for all your submitted numbers ({total} total)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8.5 w-44 rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-xs shadow-sm focus:border-brand-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8.5 rounded-xl border border-slate-200 bg-white px-3 text-xs shadow-sm focus:border-brand-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="ALL">All Statuses</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="PROCESSING">Processing</option>
              <option value="VERIFIED">Verified</option>
              <option value="REJECTED">Rejected</option>
            </select>

            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchItems()}
              title="Refresh"
              className="h-8.5 w-8.5 p-0 shrink-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {loading && items.length === 0 ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-6 w-6 text-brand-600" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="No numbers submitted yet"
            description="Submit an MTN phone number above to start verification."
            icon={ShieldCheck}
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-base font-bold text-slate-900 dark:text-white">
                      {item.number}
                    </span>
                    {getStatusBadge(item)}
                  </div>

                  <div className="mt-3 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex items-center justify-between">
                      <span>Submitted:</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {formatDateTime(item.submittedAt)}
                      </span>
                    </div>

                    {item.status === "VERIFIED" && item.verifiedAt && (
                      <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
                        <span>Verified on:</span>
                        <span className="font-medium">
                          {formatDateTime(item.verifiedAt)}
                        </span>
                      </div>
                    )}

                    {item.status === "PROCESSING" && (
                      <div className="text-blue-600 dark:text-blue-400 text-[11px] font-medium mt-1">
                        Waiting for MTN portal confirmation
                      </div>
                    )}

                    {item.status === "REJECTED" && (
                      <div className="mt-2 rounded-lg bg-red-50 p-2 text-[11px] text-red-700 dark:bg-red-500/10 dark:text-red-300">
                        <span className="font-semibold">Reason: </span>
                        {item.rejectionReason || "Verification unsuccessful"}
                      </div>
                    )}
                  </div>
                </div>

                {item.status === "REJECTED" && (
                  <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => {
                        setPhoneNumber(item.number);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      Resubmit
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {total > pageSize && (
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-slate-500">
              Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total}
            </span>
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page * pageSize >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
