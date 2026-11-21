"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  RefreshCw,
  Search,
  Settings,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";

interface MatchedPaystackOrder {
  storefrontOrderId: string;
  orderId: number | null;
  orderCode: string;
  paymentReference: string;
  customerPhone: string;
  network: string;
  gbAmount: number | null;
  sellingPriceGhs: number;
  orderStatus: string;
  storefrontName: string | null;
  paystackRefundId: string | null;
  paystackRefundStatus: string | null;
  paystackRefundAmountGhs: number | null;
  paystackRefundError: string | null;
  alreadyPaystackRefunded: boolean;
  eligible: boolean;
  createdAt: string;
}

export function PaystackBatchRefundTab({
  paystackAutoRefundEnabled,
}: {
  paystackAutoRefundEnabled: boolean;
}) {
  const { toast } = useToast();
  const [refsText, setRefsText] = React.useState("");
  const [scanning, setScanning] = React.useState(false);
  const [executing, setExecuting] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [reason, setReason] = React.useState("Paystack batch reference refund");

  const [matched, setMatched] = React.useState<MatchedPaystackOrder[]>([]);
  const [unmatched, setUnmatched] = React.useState<string[]>([]);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [hasScanned, setHasScanned] = React.useState(false);

  const handlePreview = async () => {
    if (!refsText.trim()) {
      toast("Paste Paystack references (e.g. GH-... or STF-...) first.", "error");
      return;
    }

    try {
      setScanning(true);
      const res = await fetch("/api/admin/refunds/paystack-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", text: refsText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to scan Paystack references");

      const rows: MatchedPaystackOrder[] = data.matched || [];
      setMatched(rows);
      setUnmatched(data.unmatched || []);
      setSelectedIds(rows.filter((r) => r.eligible).map((r) => r.storefrontOrderId));
      setHasScanned(true);
      toast(
        `Matched ${rows.length} storefront order(s) (${rows.filter((r) => r.eligible).length} eligible for Paystack refund).`,
        "success"
      );
    } catch (err: any) {
      toast(err?.message || "Failed to scan references", "error");
    } finally {
      setScanning(false);
    }
  };

  const handleExecute = async () => {
    if (selectedIds.length === 0) return;

    try {
      setExecuting(true);
      const res = await fetch("/api/admin/refunds/paystack-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "execute",
          storefrontOrderIds: selectedIds,
          reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send Paystack refunds");

      const refundedSet = new Set<string>(data.refundedOrderIds || []);
      setMatched((prev) =>
        prev.map((row) =>
          refundedSet.has(row.storefrontOrderId)
            ? {
                ...row,
                paystackRefundStatus: "PENDING",
                alreadyPaystackRefunded: true,
                eligible: false,
                orderStatus: "REFUNDED",
              }
            : row
        )
      );
      setSelectedIds((prev) => prev.filter((id) => !refundedSet.has(id)));
      setConfirmOpen(false);

      if (data.failedCount > 0) {
        const firstErr = data.errors?.[0]?.error || "Some refunds failed";
        toast(
          `Sent ${data.sentCount} refund(s) to Paystack. ${data.failedCount} failed: ${firstErr}`,
          "error"
        );
      } else {
        toast(
          `Sent ${data.sentCount} refund(s) to Paystack (minus 2% fee)${
            data.alreadyRefundedCount ? `, ${data.alreadyRefundedCount} already refunded` : ""
          }.`,
          "success"
        );
      }
    } catch (err: any) {
      toast(err?.message || "Paystack batch refund failed", "error");
    } finally {
      setExecuting(false);
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const eligibleIds = matched.filter((m) => m.eligible).map((m) => m.storefrontOrderId);
  const allEligibleSelected =
    eligibleIds.length > 0 && selectedIds.length === eligibleIds.length;

  const selectedTotalGhs = matched
    .filter((m) => selectedIds.includes(m.storefrontOrderId))
    .reduce((sum, m) => sum + m.sellingPriceGhs, 0);

  return (
    <div className="space-y-4">
      {!paystackAutoRefundEnabled ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span>
              <strong>Paystack Auto-Refund is currently OFF.</strong> Turn it ON in{" "}
              <strong>Settings → Billing &amp; Payments</strong> so future Bulk Refund Scanner
              refunds automatically go to Paystack without needing this step.
            </span>
          </div>
          <Link href="/admin/settings">
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs">
              <Settings className="h-3.5 w-3.5" />
              <span>Open Settings</span>
            </Button>
          </Link>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3.5 text-xs text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-200">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>
            <strong>Paystack Auto-Refund is ON.</strong> New storefront refunds from the Bulk
            Refund Scanner or Orders page will automatically be sent to Paystack (minus the 2% fee).
            Use this tool to catch up any past references.
          </span>
        </div>
      )}

      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-violet-600" />
              <span>Paste Paystack References (GH-... / STF-...)</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Paste one or more Paystack references (one per line, comma, or space-separated). Each
              matched order is refunded via Paystack minus the 2% Paystack fee.
            </p>
          </div>
          {refsText && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setRefsText("");
                setMatched([]);
                setUnmatched([]);
                setSelectedIds([]);
                setHasScanned(false);
              }}
              className="gap-1 text-xs text-slate-500"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear</span>
            </Button>
          )}
        </div>

        <textarea
          value={refsText}
          onChange={(e) => setRefsText(e.target.value)}
          rows={6}
          placeholder={"GH-1795...\nGH-1796...\nSTF-..."}
          className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 font-mono text-xs text-slate-900 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-[#0d1526] dark:text-slate-100"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            onClick={handlePreview}
            disabled={scanning || !refsText.trim()}
            className="gap-1.5"
          >
            {scanning ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            <span>{scanning ? "Scanning References..." : "Scan References"}</span>
          </Button>

          {selectedIds.length > 0 && (
            <Button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
            >
              <CreditCard className="h-4 w-4" />
              <span>
                Refund {selectedIds.length} Selected via Paystack (GHS{" "}
                {selectedTotalGhs.toFixed(2)})
              </span>
            </Button>
          )}
        </div>
      </Card>

      {hasScanned && unmatched.length > 0 && (
        <Card className="p-4 border-amber-200 bg-amber-50/50 dark:border-amber-500/20 dark:bg-amber-950/20">
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-300">
            {unmatched.length} reference(s) not found in Storefront Orders:
          </p>
          <p className="mt-1 font-mono text-[11px] text-amber-800 dark:text-amber-200 break-all">
            {unmatched.join(", ")}
          </p>
        </Card>
      )}

      {hasScanned && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200/80 bg-slate-50 text-slate-500 uppercase tracking-wider dark:border-white/10 dark:bg-white/[0.02]">
                <tr>
                  <th className="px-3 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={allEligibleSelected}
                      onChange={() =>
                        setSelectedIds(allEligibleSelected ? [] : eligibleIds)
                      }
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                  </th>
                  <th className="px-3 py-3">Paystack Reference</th>
                  <th className="px-3 py-3">Storefront Order</th>
                  <th className="px-3 py-3">Recipient / Bundle</th>
                  <th className="px-3 py-3">Refund (Net of 2%)</th>
                  <th className="px-3 py-3">Order Status</th>
                  <th className="px-3 py-3">Paystack Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {matched.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      No matching storefront orders found.
                    </td>
                  </tr>
                ) : (
                  matched.map((m) => (
                    <tr
                      key={m.storefrontOrderId}
                      className={cn(
                        "hover:bg-slate-50/70 dark:hover:bg-white/[0.02]",
                        m.alreadyPaystackRefunded && "opacity-60"
                      )}
                    >
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          disabled={!m.eligible}
                          checked={selectedIds.includes(m.storefrontOrderId)}
                          onChange={() => toggleOne(m.storefrontOrderId)}
                          className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        />
                      </td>
                      <td className="px-3 py-3 font-mono font-semibold text-slate-900 dark:text-white">
                        {m.paymentReference}
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-mono font-medium">{m.orderCode}</div>
                        {m.orderId && (
                          <div className="text-[10px] text-slate-400">Order #{m.orderId}</div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-mono font-medium">{m.customerPhone}</div>
                        <div className="text-[11px] text-slate-500">
                          {m.network} {m.gbAmount ? `• ${m.gbAmount} GB` : ""}
                        </div>
                      </td>
                      <td className="px-3 py-3 font-bold text-slate-900 dark:text-white">
                        GHS {m.sellingPriceGhs.toFixed(2)}
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={m.orderStatus} />
                      </td>
                      <td className="px-3 py-3">
                        {m.alreadyPaystackRefunded ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>
                              {m.paystackRefundStatus || "REFUNDED"}
                              {m.paystackRefundAmountGhs
                                ? ` (GHS ${m.paystackRefundAmountGhs.toFixed(2)})`
                                : ""}
                            </span>
                          </span>
                        ) : m.paystackRefundStatus === "FAILED" ? (
                          <span
                            title={m.paystackRefundError || "Previous attempt failed"}
                            className="inline-flex items-center rounded-md border border-rose-300 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-300"
                          >
                            Failed (Retryable)
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                            Ready to Refund
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Dialog
        open={confirmOpen}
        onClose={() => !executing && setConfirmOpen(false)}
        title="Confirm Paystack Batch Refund"
      >
        <div className="space-y-4 text-xs text-slate-600 dark:text-slate-300">
          <p>
            You are about to send <strong>{selectedIds.length}</strong> storefront refund(s)
            totalling <strong>GHS {selectedTotalGhs.toFixed(2)}</strong> (minus the 2% Paystack
            fee) directly to Paystack.
          </p>
          <p className="text-[11px] text-slate-500">
            Any order not yet marked as <strong>REFUNDED</strong> in the database will also be
            marked REFUNDED and its reseller commission reversed.
          </p>
          <div className="space-y-1">
            <label className="font-semibold text-slate-700 dark:text-slate-200">
              Refund Reason:
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0d1526] dark:text-white"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={executing}
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={executing}
              onClick={handleExecute}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              {executing ? "Sending to Paystack..." : "Confirm & Send Refunds"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
