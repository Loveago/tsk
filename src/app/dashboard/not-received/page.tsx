"use client";

import * as React from "react";
import { EmptyState, Spinner } from "@/components/shared";
import { OrderDetailDialog } from "@/components/orders/order-detail-dialog";
import { NotReceivedReportDetailDialog } from "@/components/orders/not-received-report-dialog";
import { DeliveryReportStatusBadge } from "@/components/status-badge";
import { useToast } from "@/components/toast";
import { orderCode } from "@/lib/utils";
import { deliveryReportCode } from "@/lib/types";
import { formatDateTime } from "@/lib/types";
import {
  CheckCircle2,
  ClipboardList,
  Clock,
  Eye,
  FileWarning,
  RotateCcw,
  Search,
  Inbox,
} from "lucide-react";

interface ReportRow {
  id: number;
  phoneNumber: string;
  network: string;
  gbAmount: number;
  amount: number;
  orderStatus: string;
  reportStatus: "REVIEW" | "CONFIRMED_SENT" | "REFUNDED";
  reportDate: string;
  processedDate: string | null;
  deliveryReport: {
    id: string;
    status: string;
    adminNote: string | null;
    resolvedAt: string | null;
  } | null;
}

interface Stats {
  total: number;
  review: number;
  resolved: number;
  refunded: number;
}

const REPORT_META = {
  CONFIRMED_SENT: {
    label: "Confirmed Sent",
    cls: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    icon: CheckCircle2,
  },
  REFUNDED: {
    label: "Refunded",
    cls: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    icon: RotateCcw,
  },
  REVIEW: {
    label: "Review",
    cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    icon: Clock,
  },
} as const;

const dateInputCls =
  "h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 placeholder:text-slate-400 dark:border-white/10 dark:bg-[#0d1526] dark:text-slate-100 dark:placeholder:text-slate-500 caret-brand-600 dark:caret-brand-400 dark:[color-scheme:dark] [&>option]:bg-white dark:[&>option]:bg-[#0d1526]";

function ReportBadge({ s }: { s: ReportRow["reportStatus"] }) {
  const m = REPORT_META[s];
  const Icon = m.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${m.cls}`}
    >
      <Icon className="h-3 w-3" /> {m.label}
    </span>
  );
}

interface MyReportRow {
  id: string;
  seq: number;
  code: string;
  status: string;
  reason: string | null;
  adminResponse: string | null;
  createdAt: string;
  order: { id: number; phoneNumber: string; network: string; gbAmount: number; amount: number; status: string };
}

export default function NotReceivedPage() {
  const { toast } = useToast();
  const [data, setData] = React.useState<ReportRow[]>([]);
  const [stats, setStats] = React.useState<Stats>({ total: 0, review: 0, resolved: 0, refunded: 0 });
  const [total, setTotal] = React.useState(0);
  const [pages, setPages] = React.useState(1);
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [sort, setSort] = React.useState("newest");
  const [loading, setLoading] = React.useState(true);
  const [detail, setDetail] = React.useState<Record<string, unknown> | null>(null);
  const [view, setView] = React.useState<"orders" | "reports">("reports");
  const [myReports, setMyReports] = React.useState<MyReportRow[]>([]);
  const [myStats, setMyStats] = React.useState({ total: 0, open: 0, investigating: 0, closed: 0 });
  const [viewReportId, setViewReportId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "15" });
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (sort) params.set("sort", sort);
    try {
      const res = await fetch(`/api/reports/not-received?${params}`);
      const json = await res.json();
      setData(json.data ?? []);
      setStats(json.stats ?? { total: 0, review: 0, resolved: 0, refunded: 0 });
      setTotal(json.total ?? 0);
      setPages(json.pages ?? 1);
    } catch {
      toast("Failed to load reports", "error");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, q, status, from, to, sort]);

  React.useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const openDetail = async (id: number) => {
    const res = await fetch(`/api/orders/${id}`);
    const json = await res.json();
    setDetail(json.order ?? null);
  };

  const loadMyReports = React.useCallback(async () => {
    const params = new URLSearchParams({ view: "reports", page: String(page), pageSize: "15" });
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    try {
      const res = await fetch(`/api/reports/not-received?${params}`);
      const json = await res.json();
      setMyReports(json.reports ?? []);
      setMyStats(json.stats ?? { total: 0, open: 0, investigating: 0, closed: 0 });
      setTotal(json.total ?? 0);
      setPages(json.pages ?? 1);
    } catch {
      toast("Failed to load reports", "error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, q, status]);

  React.useEffect(() => {
    if (view !== "reports") return;
    const t = setTimeout(loadMyReports, 250);
    return () => clearTimeout(t);
  }, [view, loadMyReports]);

  const tiles = view === "reports"
    ? [
        { label: "Reports", value: String(myStats.total), icon: ClipboardList, cls: "text-slate-400" },
        { label: "Open", value: String(myStats.open), icon: Clock, cls: "text-amber-500" },
        { label: "Investigating", value: String(myStats.investigating), icon: Eye, cls: "text-blue-500" },
        { label: "Closed", value: String(myStats.closed), icon: CheckCircle2, cls: "text-emerald-500" },
      ]
    : [
        { label: "Total", value: String(stats.total), icon: ClipboardList, cls: "text-slate-400" },
        { label: "Review", value: String(stats.review), icon: Clock, cls: "text-amber-500" },
        { label: "Resolved", value: String(stats.resolved), icon: CheckCircle2, cls: "text-blue-500" },
        { label: "Refunded", value: String(stats.refunded), icon: RotateCcw, cls: "text-violet-500" },
        { label: "Showing", value: String(data.length), icon: Eye, cls: "text-emerald-500" },
      ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-600/25">
          <FileWarning className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-lg font-bold tracking-tight">My Not Received Reports</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Track the status of data reported as not received
          </p>
        </div>
      </div>

      {/* View switcher */}
      <div className="flex w-fit rounded-xl border border-slate-200/70 bg-white p-1 shadow-sm dark:border-white/5 dark:bg-[#0d1526]">
        {(
          [
            { key: "reports", label: "My Reports", icon: Inbox },
            { key: "orders", label: "Order History", icon: ClipboardList },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setView(t.key);
              setPage(1);
              setStatus("");
            }}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition ${
              view === t.key
                ? "bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5"
            }`}
          >
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="flex items-center gap-3 rounded-xl border border-slate-200/70 bg-white px-4 py-3 shadow-sm dark:border-white/5 dark:bg-[#0d1526]"
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-white/5 ${t.cls}`}
            >
              <t.icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-bold leading-tight">{t.value}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{t.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters + table */}
      <div className="rounded-2xl border border-slate-200/70 bg-white shadow-sm dark:border-white/5 dark:bg-[#0d1526]">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 dark:border-white/5 lg:flex-row lg:items-center">
          <div className="relative lg:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder={view === "reports" ? "Search by phone or reason..." : "Search by phone number..."}
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20 caret-brand-600 dark:border-white/10 dark:bg-[#0d1526] dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-[#0d1526] dark:caret-brand-400"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className={`${dateInputCls} w-40`}
            >
              <option value="">All Status</option>
              {view === "reports" ? (
                <>
                  <option value="OPEN">Open</option>
                  <option value="INVESTIGATING">Investigating</option>
                  <option value="DELIVERED">Delivered</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="REJECTED">Rejected</option>
                </>
              ) : (
                <>
                  <option value="REVIEW">Review</option>
                  <option value="CONFIRMED_SENT">Confirmed Sent</option>
                  <option value="REFUNDED">Refunded</option>
                </>
              )}
            </select>
            {view === "orders" && (
              <>
            <input
              type="date"
              value={from ? from.slice(0, 10) : ""}
              onChange={(e) => {
                setFrom(e.target.value ? new Date(`${e.target.value}T00:00:00`).toISOString() : "");
                setPage(1);
              }}
              className={`${dateInputCls} w-36`}
            />
            <input
              type="date"
              value={to ? to.slice(0, 10) : ""}
              onChange={(e) => {
                setTo(
                  e.target.value ? new Date(`${e.target.value}T23:59:59.999`).toISOString() : ""
                );
                setPage(1);
              }}
              className={`${dateInputCls} w-36`}
            />
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
              className={`${dateInputCls} w-40`}
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
            </select>
            {(q || status || from || to) && (
              <button
                onClick={() => {
                  setQ("");
                  setStatus("");
                  setFrom("");
                  setTo("");
                  setPage(1);
                }}
                className="h-9 rounded-lg bg-slate-500/10 px-3 text-xs font-bold text-slate-500 transition hover:bg-slate-500/20 dark:text-slate-400"
              >
                Clear
              </button>
            )}
            </>
            )}
          </div>
        </div>

        {view === "reports" ? (
          loading ? (
            <div className="flex justify-center py-12">
              <Spinner className="h-6 w-6 text-brand-600" />
            </div>
          ) : myReports.length === 0 ? (
            <EmptyState
              icon={FileWarning}
              title="No reports yet"
              description="Reports you submit from a completed order will appear here."
            />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-white/5">
              {myReports.map((r) => (
                <li key={r.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-sm font-bold">{deliveryReportCode(r.seq)}</p>
                      <DeliveryReportStatusBadge status={r.status} />
                    </div>
                    <p className="mt-1 text-sm">
                      {r.order.network} · {r.order.phoneNumber} · {r.order.gbAmount} GB
                      <span className="ml-2 font-mono text-[11px] text-slate-400">{orderCode(r.order.id)}</span>
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Reported {formatDateTime(r.createdAt)}
                      {r.reason ? ` · ${r.reason}` : ""}
                      {r.adminResponse ? ` · Response: ${r.adminResponse}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => setViewReportId(r.id)}
                      className="inline-flex h-8 items-center rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-3 text-xs font-bold text-white shadow-sm transition hover:opacity-90"
                    >
                      View Report
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : loading ? (
          <div className="flex justify-center py-12">
            <Spinner className="h-6 w-6 text-brand-600" />
          </div>
        ) : data.length === 0 ? (
          <EmptyState
            icon={FileWarning}
            title="No reports found"
            description="Orders reported as not received will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-[11px] uppercase tracking-wide text-slate-500 dark:border-white/5 dark:bg-white/[0.02] dark:text-slate-400">
                  <th className="px-4 py-3 font-semibold">Phone Number</th>
                  <th className="px-4 py-3 font-semibold">Allocation</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Report Date</th>
                  <th className="px-4 py-3 font-semibold">Processed Date</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {data.map((r) => (
                  <tr
                    key={r.id}
                    className="transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.03]"
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold">{r.phoneNumber}</p>
                      <p className="text-[11px] text-slate-400">{orderCode(r.id)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-violet-500/10 px-2 py-0.5 text-[11px] font-bold text-violet-600 dark:text-violet-400">
                        {r.gbAmount} GB
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <ReportBadge s={r.reportStatus} />
                      {r.deliveryReport && (
                        <p className="mt-1 max-w-[180px] truncate text-[11px] text-slate-400" title={r.deliveryReport.adminNote ?? r.deliveryReport.status}>
                          {r.deliveryReport.status}
                          {r.deliveryReport.adminNote ? `: ${r.deliveryReport.adminNote}` : ""}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                      {formatDateTime(r.reportDate)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                      {r.processedDate ? formatDateTime(r.processedDate) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openDetail(r.id)}
                        className="inline-flex h-8 items-center rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-3 text-xs font-bold text-white shadow-sm transition hover:opacity-90"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm dark:border-white/5">
            <span className="text-slate-500">
              Page {page} of {pages} · {total} report(s)
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold transition hover:bg-slate-50 disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/5"
              >
                Previous
              </button>
              <button
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold transition hover:bg-slate-50 disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/5"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <OrderDetailDialog
        order={detail as never}
        open={!!detail}
        onClose={() => setDetail(null)}
        onOrderChanged={() => {
          load();
          loadMyReports();
        }}
      />
      <NotReceivedReportDetailDialog
        reportId={viewReportId}
        open={!!viewReportId}
        onClose={() => setViewReportId(null)}
      />
    </div>
  );
}

