"use client";

import * as React from "react";
import { PageHeader, EmptyState, Spinner } from "@/components/shared";
import { StatusBadge, DeliveryReportStatusBadge } from "@/components/status-badge";
import { Pagination } from "@/components/ui/pagination";
import { DeliveryReportManageDialog } from "@/components/admin/delivery-report-manage-dialog";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatGHS } from "@/lib/types";
import { orderCode } from "@/lib/utils";
import { FileWarning, Image as ImageIcon } from "lucide-react";

const TABS = [
  { key: "", label: "All" },
  { key: "OPEN", label: "Open" },
  { key: "INVESTIGATING", label: "Investigating" },
  { key: "DELIVERED", label: "Delivered" },
  { key: "RESOLVED", label: "Resolved" },
  { key: "REJECTED", label: "Rejected" },
];

interface ReportRow {
  id: string;
  seq: number;
  code: string;
  reason: string | null;
  message: string | null;
  status: string;
  adminNote: string | null;
  adminResponse: string | null;
  respondedAt: string | null;
  proofImageMime: string | null;
  proofImageUploadedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  order: {
    id: number;
    phoneNumber: string;
    network: string;
    gbAmount: number;
    amount: number;
    status: string;
    completedAt: string | null;
    failureReason: string | null;
    batch: { batchCode: string } | null;
  };
  user: { id: string; name: string; email: string };
}

export default function DeliveryReportsPage() {
  const [rows, setRows] = React.useState<ReportRow[]>([]);
  const [stats, setStats] = React.useState<Record<string, number>>({});
  const [total, setTotal] = React.useState(0);
  const [pages, setPages] = React.useState(1);
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState("");
  const [q, setQ] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [manageId, setManageId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "15" });
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    try {
      const res = await fetch(`/api/admin/delivery-reports?${params}`);
      const json = await res.json();
      if (res.ok) {
        setRows(json.data ?? []);
        setStats(json.stats ?? {});
        setTotal(json.total ?? 0);
        setPages(json.pages ?? 1);
      }
    } finally {
      setLoading(false);
    }
  }, [page, status, q]);

  React.useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Not Received Reports"
        description={`${total} report${total === 1 ? "" : "s"} filed by customers`}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key || "all"}
            onClick={() => {
              setStatus(t.key);
              setPage(1);
            }}
            className={
              "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition " +
              (status === t.key
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-brand-300 dark:border-white/10 dark:bg-transparent dark:text-slate-300")
            }
          >
            {t.label}
            {t.key && stats[t.key] ? ` (${stats[t.key]})` : ""}
          </button>
        ))}
        <input
          className="ml-auto h-9 w-64 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-brand-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100"
          placeholder="Search phone, user, order code…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner className="h-6 w-6 text-brand-600" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={FileWarning}
            title="No reports"
            description="Customer-filed reports will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500 dark:border-slate-800">
                  <th className="px-4 py-3 font-medium">Report</th>
                  <th className="px-4 py-3 font-medium">Issue</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Order status</th>
                  <th className="px-4 py-3 font-medium">Closed</th>
                  <th className="px-4 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((r) => {
                  return (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs font-bold">{r.code}</p>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <DeliveryReportStatusBadge status={r.status} />
                          {r.proofImageMime && (
                            <span title={`Proof uploaded ${r.proofImageUploadedAt ? formatDateTime(r.proofImageUploadedAt) : ""}`}>
                              <ImageIcon className="h-3.5 w-3.5 text-emerald-500" />
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-400">{formatDateTime(r.createdAt)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{r.reason || "Not received"}</p>
                        {r.message && (
                          <p className="mt-0.5 max-w-[240px] truncate text-xs text-slate-500" title={r.message}>
                            {r.message}
                          </p>
                        )}
                        {r.adminResponse && (
                          <p className="mt-0.5 max-w-[240px] truncate text-xs text-teal-600 dark:text-teal-400" title={r.adminResponse}>
                            Response: {r.adminResponse}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{r.user.name}</p>
                        <p className="text-xs text-slate-500">{r.user.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs font-bold">{orderCode(r.order.id)}</p>
                        <p className="text-xs text-slate-500">
                          {r.order.phoneNumber} · {r.order.gbAmount} GB {r.order.network}
                        </p>
                        <p className="text-xs text-slate-400">{formatGHS(r.order.amount)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={r.order.status} />
                        {r.order.failureReason && (
                          <p className="mt-0.5 max-w-[160px] truncate text-[11px] text-red-500" title={r.order.failureReason}>
                            {r.order.failureReason}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {r.resolvedAt && (
                          <p className="text-xs text-slate-400">{formatDateTime(r.resolvedAt)}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="outline" onClick={() => setManageId(r.id)}>
                          Manage
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination page={page} pages={pages} total={total} onPage={setPage} />

      <DeliveryReportManageDialog
        reportId={manageId}
        open={!!manageId}
        onClose={() => setManageId(null)}
        onChanged={load}
      />
    </div>
  );
}

