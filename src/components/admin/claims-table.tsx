"use client";

import * as React from "react";
import { formatGHS, formatDateTime } from "@/lib/types";
import { EmptyState, Spinner } from "@/components/shared";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { Receipt, Check, X, Eye, AlertTriangle } from "lucide-react";

interface ClaimRow {
  id: string;
  transactionReference: string;
  claimedAmount: number;
  network: string;
  senderPhone: string | null;
  status: string;
  createdAt: string;
  processedAt: string | null;
  rejectionReason: string | null;
  user: { id: string; name: string; email: string; balance: number };
  incomingTransaction?: { id: string; status: string; amount: number; transactionAt: string } | null;
}

export function ClaimsTable() {
  const { toast } = useToast();
  const [data, setData] = React.useState<ClaimRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [pages, setPages] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [status, setStatus] = React.useState("");
  const [network, setNetwork] = React.useState("");
  const [q, setQ] = React.useState("");

  // Action dialog states
  const [selectedClaim, setSelectedClaim] = React.useState<ClaimRow | null>(null);
  const [actionBusy, setActionBusy] = React.useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (status) params.set("status", status);
    if (network) params.set("network", network);
    if (q.trim()) params.set("q", q.trim());

    try {
      const res = await fetch(`/api/admin/claims?${params}`);
      const json = await res.json();
      setData(json.data ?? []);
      setTotal(json.total ?? 0);
      setPages(json.pages ?? 1);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [page, status, network, q]);

  React.useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const handleApprove = async (claim: ClaimRow) => {
    if (!confirm(`Are you sure you want to approve claim of ${formatGHS(claim.claimedAmount)} for ${claim.user.name}? This will immediately credit their wallet balance.`)) {
      return;
    }
    setActionBusy(true);
    try {
      const res = await fetch(`/api/admin/claims/${claim.id}/approve`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? "Failed to approve claim", "error");
        return;
      }
      toast("Claim approved and wallet balance credited", "success");
      load();
      setSelectedClaim(null);
    } catch {
      toast("Error approving claim", "error");
    } finally {
      setActionBusy(false);
    }
  };

  const handleReject = async () => {
    if (!selectedClaim) return;
    setActionBusy(true);
    try {
      const res = await fetch(`/api/admin/claims/${selectedClaim.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? "Failed to reject claim", "error");
        return;
      }
      toast("Claim marked as rejected", "info");
      setRejectDialogOpen(false);
      setSelectedClaim(null);
      setRejectReason("");
      load();
    } catch {
      toast("Error rejecting claim", "error");
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All Statuses</option>
            <option value="APPROVED">APPROVED</option>
            <option value="PENDING">PENDING</option>
            <option value="REJECTED">REJECTED</option>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Network</Label>
          <Select value={network} onChange={(e) => { setNetwork(e.target.value); setPage(1); }}>
            <option value="">All Networks</option>
            <option value="MTN">MTN</option>
            <option value="TELECEL">Telecel</option>
            <option value="AIRTELTIGO">AirtelTigo</option>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Search User / Tx ID</Label>
          <Input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Search email, name, ref..."
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-white/5 dark:bg-[#0d1526]">
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner className="h-6 w-6 text-brand-600" />
          </div>
        ) : data.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No claims found"
            description="Submitted user claims will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/50 text-xs text-slate-500 dark:border-white/5 dark:bg-white/[0.02]">
                <tr>
                  <th className="px-4 py-3 font-semibold">User</th>
                  <th className="px-4 py-3 font-semibold">Transaction ID</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Network</th>
                  <th className="px-4 py-3 font-semibold">Claim Date</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {data.map((claim) => (
                  <tr key={claim.id} className="hover:bg-slate-50/80 dark:hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900 dark:text-white">{claim.user.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{claim.user.email}</p>
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-slate-900 dark:text-white">
                      {claim.transactionReference}
                    </td>
                    <td className="px-4 py-3 font-bold text-emerald-600 dark:text-emerald-400">
                      {formatGHS(claim.claimedAmount)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200">
                      {claim.network}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                      {formatDateTime(claim.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          claim.status === "APPROVED"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                            : claim.status === "PENDING"
                            ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
                            : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                        }`}
                      >
                        {claim.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedClaim(claim)}
                          className="h-7 text-xs"
                        >
                          <Eye className="h-3 w-3" /> Details
                        </Button>
                        {claim.status === "PENDING" && (
                          <>
                            <Button
                              size="sm"
                              disabled={actionBusy}
                              onClick={() => handleApprove(claim)}
                              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                            >
                              <Check className="h-3 w-3" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={actionBusy}
                              onClick={() => {
                                setSelectedClaim(claim);
                                setRejectDialogOpen(true);
                              }}
                              className="h-7 text-xs text-red-600 hover:bg-red-50"
                            >
                              <X className="h-3 w-3" /> Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs dark:border-white/5">
            <span className="text-slate-500">
              Page {page} of {pages} ({total} claims)
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Claim Detail Modal */}
      {selectedClaim && !rejectDialogOpen && (
        <Dialog
          open={!!selectedClaim}
          onClose={() => setSelectedClaim(null)}
          title="Claim Investigation & Details"
        >
          <div className="space-y-4 text-sm">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-white/5 dark:bg-white/5">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{selectedClaim.user.name}</p>
                  <p className="text-xs text-slate-500">{selectedClaim.user.email}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-500">Wallet Balance</span>
                  <p className="font-bold text-emerald-600 dark:text-emerald-400">
                    {formatGHS(selectedClaim.user.balance)}
                  </p>
                </div>
              </div>
            </div>

            <dl className="divide-y divide-slate-100 text-xs dark:divide-white/5">
              <div className="flex justify-between py-2">
                <dt className="text-slate-500">Transaction ID</dt>
                <dd className="font-mono font-bold text-slate-900 dark:text-white">
                  {selectedClaim.transactionReference}
                </dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-slate-500">Claimed Amount</dt>
                <dd className="font-bold text-slate-900 dark:text-white">
                  {formatGHS(selectedClaim.claimedAmount)}
                </dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-slate-500">MoMo Network</dt>
                <dd className="font-semibold text-slate-800 dark:text-slate-200">
                  {selectedClaim.network}
                </dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-slate-500">Sender Phone</dt>
                <dd className="font-mono text-slate-800 dark:text-slate-200">
                  {selectedClaim.senderPhone ?? "Not provided"}
                </dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-slate-500">Claim Date</dt>
                <dd className="text-slate-700 dark:text-slate-300">
                  {formatDateTime(selectedClaim.createdAt)}
                </dd>
              </div>
              {selectedClaim.rejectionReason && (
                <div className="flex justify-between py-2 text-red-600">
                  <dt>Rejection Reason</dt>
                  <dd className="font-medium text-right max-w-[220px]">
                    {selectedClaim.rejectionReason}
                  </dd>
                </div>
              )}
            </dl>

            {selectedClaim.status === "PENDING" && (
              <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-white/5">
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  disabled={actionBusy}
                  onClick={() => handleApprove(selectedClaim)}
                >
                  <Check className="h-4 w-4" /> Approve &amp; Credit
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 text-red-600"
                  disabled={actionBusy}
                  onClick={() => setRejectDialogOpen(true)}
                >
                  <X className="h-4 w-4" /> Reject Claim
                </Button>
              </div>
            )}
          </div>
        </Dialog>
      )}

      {/* Rejection Dialog */}
      {rejectDialogOpen && selectedClaim && (
        <Dialog
          open={rejectDialogOpen}
          onClose={() => setRejectDialogOpen(false)}
          title="Reject Claim"
        >
          <div className="space-y-4 text-sm">
            <p className="text-xs text-slate-500">
              Enter a safe reason for rejecting this claim. This reason will be recorded in the audit trail.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="rejReason">Rejection Reason</Label>
              <Input
                id="rejReason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Transaction could not be verified with telecom provider"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRejectDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="default"
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={actionBusy}
                onClick={handleReject}
              >
                Confirm Rejection
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

