"use client";

import * as React from "react";
import { PageHeader, EmptyState, Spinner } from "@/components/shared";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { ExportButtons } from "@/components/admin/export-buttons";
import { Select, Label } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { formatGHS, formatDateTime } from "@/lib/types";
import { Wallet, Check, X } from "lucide-react";

interface Tx {
  id: string;
  type: string;
  amount: number;
  status: string;
  reference: string | null;
  note: string | null;
  createdAt: string;
  user: { name: string; email: string; balance: number };
}

export default function AdminBillingPage() {
  const { toast } = useToast();
  const [data, setData] = React.useState<Tx[]>([]);
  const [total, setTotal] = React.useState(0);
  const [pages, setPages] = React.useState(1);
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState("PENDING");
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (status) params.set("status", status);
    const res = await fetch(`/api/admin/billing?${params}`);
    const json = await res.json();
    setData(json.data ?? []);
    setTotal(json.total ?? 0);
    setPages(json.pages ?? 1);
    setLoading(false);
  }, [page, status]);

  React.useEffect(() => {
    load();
  }, [load]);

  const decide = async (id: string, decision: "APPROVED" | "REJECTED") => {
    const note =
      decision === "REJECTED" ? prompt("Rejection reason (optional)") ?? undefined : undefined;
    setBusyId(id);
    try {
      const res = await fetch("/api/admin/billing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision, note }),
      });
      const json = await res.json();
      if (!res.ok) return toast(json.error ?? "Action failed", "error");
      toast(
        decision === "APPROVED" ? "Top-up approved — balance credited" : "Top-up rejected",
        decision === "APPROVED" ? "success" : "info"
      );
      load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing"
        description={`${total} wallet transactions`}
        actions={<ExportButtons type="transactions" params={status ? `status=${status}` : ""} />}
      />

      <div className="max-w-xs space-y-1.5">
        <Label>Filter by status</Label>
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="PENDING">Pending approval</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="">All</option>
        </Select>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner className="h-6 w-6 text-brand-600" />
          </div>
        ) : data.length === 0 ? (
          <EmptyState icon={Wallet} title="Nothing here" description="No transactions match this filter." />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.map((tx) => (
              <div
                key={tx.id}
                className="flex flex-wrap items-center gap-3 px-4 py-4 text-sm sm:px-5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{formatGHS(tx.amount)}</p>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {tx.type}
                    </span>
                    <StatusBadge status={tx.status} />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {tx.user.name} · {tx.user.email} · balance {formatGHS(tx.user.balance)}
                  </p>
                  {tx.reference && (
                    <p className="text-xs text-slate-400">Ref: {tx.reference}</p>
                  )}
                  <p className="text-xs text-slate-400">{formatDateTime(tx.createdAt)}</p>
                </div>
                {tx.status === "PENDING" && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={busyId === tx.id}
                      onClick={() => decide(tx.id, "APPROVED")}
                    >
                      <Check className="h-3.5 w-3.5" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === tx.id}
                      onClick={() => decide(tx.id, "REJECTED")}
                    >
                      <X className="h-3.5 w-3.5" /> Reject
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm dark:border-slate-800">
            <span className="text-slate-500">Page {page} of {pages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
