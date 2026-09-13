"use client";

import * as React from "react";
import Link from "next/link";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/shared";
import { useToast } from "@/components/toast";
import { formatDateTime } from "@/lib/types";
import {
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  ShieldCheck,
  Smartphone,
  Calendar,
  Layers,
  ShoppingBag,
  User,
  Plus,
  Trash2,
} from "lucide-react";

interface NumberDetailsModalProps {
  open: boolean;
  onClose: () => void;
  phoneNumber: string | null;
  onActionComplete?: () => void;
}

export function NumberDetailsModal({
  open,
  onClose,
  phoneNumber,
  onActionComplete,
}: NumberDetailsModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<any>(null);
  const [actionInProgress, setActionInProgress] = React.useState(false);

  const fetchDetails = React.useCallback(async (num: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/mtn-verification/number/${encodeURIComponent(num)}`);
      if (!res.ok) throw new Error("Failed to fetch details");
      const d = await res.json();
      setData(d.details);
    } catch (err: any) {
      toast(err.message ?? "Error loading details", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    if (open && phoneNumber) {
      fetchDetails(phoneNumber);
    } else {
      setData(null);
    }
  }, [open, phoneNumber, fetchDetails]);

  const handleAddWhitelist = async () => {
    if (!phoneNumber) return;
    setActionInProgress(true);
    try {
      const res = await fetch("/api/admin/mtn-verification/accepted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: phoneNumber, source: "MANUAL" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed to whitelist");
      toast("Number added to accepted whitelist", "success");
      fetchDetails(phoneNumber);
      onActionComplete?.();
    } catch (err: any) {
      toast(err.message ?? "Error", "error");
    } finally {
      setActionInProgress(false);
    }
  };

  const handleRemoveWhitelist = async () => {
    if (!data?.accepted?.id) return;
    setActionInProgress(true);
    try {
      const res = await fetch(`/api/admin/mtn-verification/accepted?id=${data.accepted.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to remove from whitelist");
      toast("Number removed from accepted whitelist", "success");
      fetchDetails(phoneNumber!);
      onActionComplete?.();
    } catch (err: any) {
      toast(err.message ?? "Error", "error");
    } finally {
      setActionInProgress(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Number Details: ${phoneNumber ?? ""}`}
      description="Comprehensive view of whitelist status, requests history, and order activity"
      className="max-w-2xl"
    >
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6 text-brand-600" />
        </div>
      ) : !data ? (
        <p className="py-8 text-center text-xs text-slate-500">No data found for this number.</p>
      ) : (
        <div className="space-y-5">
          {/* Header Card */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/50">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-base font-bold text-slate-900 dark:text-white">
                  {data.number}
                </span>
                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                  {data.network}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                {data.accepted ? "Whitelisted — Can purchase MTN packages" : "Not whitelisted"}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {data.accepted ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50"
                  onClick={handleRemoveWhitelist}
                  disabled={actionInProgress}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Remove from Whitelist
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleAddWhitelist}
                  disabled={actionInProgress}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add to Whitelist
                </Button>
              )}

              <Link href={`/admin/orders?q=${data.number}`} target="_blank">
                <Button variant="outline" size="sm" className="h-8 text-xs">
                  <ShoppingBag className="h-3.5 w-3.5 mr-1" />
                  Order History
                </Button>
              </Link>
            </div>
          </div>

          {/* Whitelist Status Section */}
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
              <ShieldCheck className="h-4 w-4 text-brand-600" />
              Accepted Whitelist Status
            </h4>
            {data.accepted ? (
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <div>
                  <p className="text-slate-500">Status</p>
                  <p className="font-semibold text-emerald-600">✓ Accepted</p>
                </div>
                <div>
                  <p className="text-slate-500">Source</p>
                  <p className="font-medium text-slate-800 dark:text-slate-200">{data.accepted.source}</p>
                </div>
                <div>
                  <p className="text-slate-500">Batch Reference</p>
                  <p className="font-mono text-slate-800 dark:text-slate-200">
                    {data.accepted.batch?.batchReference || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Verified Date</p>
                  <p className="text-slate-800 dark:text-slate-200">
                    {formatDateTime(data.accepted.verifiedAt)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                This number is currently NOT in the Accepted MTN whitelist.
              </p>
            )}
          </div>

          {/* Blocked / Unverified Activity Section */}
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
              <ShoppingBag className="h-4 w-4 text-blue-600" />
              Order Usage & Review Record
            </h4>
            {data.blocked ? (
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <div>
                  <p className="text-slate-500">Review Status</p>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {data.blocked.status}
                  </span>
                </div>
                <div>
                  <p className="text-slate-500">Total Orders Placed</p>
                  <p className="font-bold text-slate-800 dark:text-slate-200">
                    {data.blocked.orderCount}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">First Ordered</p>
                  <p className="text-slate-800 dark:text-slate-200">
                    {formatDateTime(data.blocked.firstSeenAt)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Last Ordered</p>
                  <p className="text-slate-800 dark:text-slate-200">
                    {formatDateTime(data.blocked.lastSeenAt)}
                  </p>
                </div>
                {data.blocked.user && (
                  <div className="col-span-2 sm:col-span-4 pt-1 text-slate-500">
                    User: <strong className="text-slate-800 dark:text-slate-200">{data.blocked.user.name}</strong> ({data.blocked.user.email})
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                No orders recorded while verification enforcement was disabled.
              </p>
            )}
          </div>

          {/* User Verification Requests History */}
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
              <Layers className="h-4 w-4 text-indigo-600" />
              Verification Requests History ({data.requests?.length ?? 0})
            </h4>
            {data.requests && data.requests.length > 0 ? (
              <div className="mt-3 overflow-hidden rounded-xl border border-slate-100 dark:border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800/50">
                    <tr>
                      <th className="px-3 py-2">Submitted By</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Batch</th>
                      <th className="px-3 py-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.requests.map((r: any) => (
                      <tr key={r.id}>
                        <td className="px-3 py-2 text-slate-800 dark:text-slate-200">
                          {r.user?.name || r.user?.email || "Unknown"}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              r.status === "VERIFIED"
                                ? "bg-emerald-50 text-emerald-700"
                                : r.status === "REJECTED"
                                ? "bg-red-50 text-red-700"
                                : r.status === "PROCESSING"
                                ? "bg-blue-50 text-blue-700"
                                : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-500">
                          {formatDateTime(r.submittedAt || r.createdAt)}
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-500">
                          {r.batch?.batchReference || "—"}
                        </td>
                        <td className="px-3 py-2 text-slate-500">
                          {r.rejectionReason || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                No user verification requests recorded for this number.
              </p>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
