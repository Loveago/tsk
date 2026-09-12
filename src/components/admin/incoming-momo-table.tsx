"use client";

import * as React from "react";
import { formatGHS, formatDateTime } from "@/lib/types";
import { EmptyState, Spinner } from "@/components/shared";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Smartphone, Eye, CheckCircle2, AlertCircle, RefreshCw, XCircle } from "lucide-react";

interface ClaimInfo {
  id: string;
  claimedAmount: number;
  status: string;
  createdAt: string;
  user: { id: string; name: string; email: string };
}

interface IncomingMomoTx {
  id: string;
  transactionReference: string;
  network: string;
  amount: number;
  currency: string;
  senderPhone: string | null;
  recipientPhone: string | null;
  transactionAt: string | null;
  rawSms: string;
  parsedData: string | null;
  source: string;
  status: string;
  createdAt: string;
  claims: ClaimInfo[];
}

interface AuditEntry {
  id: number;
  action: string;
  actorLabel: string;
  target: string;
  newValue: string | null;
  createdAt: string;
}

function momoStatusBadge(status: string) {
  const styles: Record<string, string> = {
    AVAILABLE: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
    CLAIMED: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20",
    UNMATCHED: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
    DUPLICATE: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20",
    REJECTED: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20",
    EXPIRED: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
  };

  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${styles[status] ?? ""}`}>
      {status}
    </span>
  );
}

export function IncomingMomoTable() {
  const [data, setData] = React.useState<IncomingMomoTx[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [pages, setPages] = React.useState(1);
  const [loading, setLoading] = React.useState(true);

  // Filters
  const [network, setNetwork] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [q, setQ] = React.useState("");
  const [sender, setSender] = React.useState("");

  // Detail modal state
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detailTx, setDetailTx] = React.useState<IncomingMomoTx | null>(null);
  const [auditLogs, setAuditLogs] = React.useState<AuditEntry[]>([]);
  const [loadingDetail, setLoadingDetail] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (network) params.set("network", network);
    if (status) params.set("status", status);
    if (q.trim()) params.set("q", q.trim());
    if (sender.trim()) params.set("sender", sender.trim());

    try {
      const res = await fetch(`/api/admin/momo-transactions?${params}`);
      const json = await res.json();
      setData(json.data ?? []);
      setTotal(json.total ?? 0);
      setPages(json.pages ?? 1);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [page, network, status, q, sender]);

  React.useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const openDetail = async (id: string) => {
    setSelectedId(id);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/admin/momo-transactions/${id}`);
      const json = await res.json();
      setDetailTx(json.transaction ?? null);
      setAuditLogs(json.auditLogs ?? []);
    } catch {
      setDetailTx(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
          <Label className="text-xs">Status</Label>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All Statuses</option>
            <option value="AVAILABLE">AVAILABLE (Claimable)</option>
            <option value="CLAIMED">CLAIMED</option>
            <option value="UNMATCHED">UNMATCHED</option>
            <option value="DUPLICATE">DUPLICATE</option>
            <option value="EXPIRED">EXPIRED</option>
            <option value="REJECTED">REJECTED</option>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Search Transaction ID</Label>
          <Input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Search reference..."
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Sender Phone</Label>
          <Input
            value={sender}
            onChange={(e) => { setSender(e.target.value); setPage(1); }}
            placeholder="e.g. 0241..."
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
            icon={Smartphone}
            title="No incoming MoMo transactions"
            description="Incoming forwarded SMS messages will show up here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/50 text-xs text-slate-500 dark:border-white/5 dark:bg-white/[0.02]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Transaction ID</th>
                  <th className="px-4 py-3 font-semibold">Network</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Sender</th>
                  <th className="px-4 py-3 font-semibold">Received</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Claimed By</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {data.map((row) => {
                  const claim = row.claims?.[0];
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/80 dark:hover:bg-white/[0.02]">
                      <td className="px-4 py-3 font-mono font-bold text-slate-900 dark:text-white">
                        {row.transactionReference}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200">
                        {row.network}
                      </td>
                      <td className="px-4 py-3 font-bold text-emerald-600 dark:text-emerald-400">
                        {formatGHS(row.amount)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">
                        {row.senderPhone ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                        {formatDateTime(row.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        {momoStatusBadge(row.status)}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {claim ? (
                          <div>
                            <p className="font-semibold text-slate-800 dark:text-slate-200">{claim.user.name}</p>
                            <p className="text-[11px] text-slate-400">{claim.user.email}</p>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openDetail(row.id)}
                          className="h-7 text-xs"
                        >
                          <Eye className="h-3 w-3" /> View
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs dark:border-white/5">
            <span className="text-slate-500">
              Page {page} of {pages} ({total} transactions)
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

      {/* Transaction Detail Dialog */}
      {selectedId && (
        <Dialog
          open={!!selectedId}
          onClose={() => { setSelectedId(null); setDetailTx(null); }}
          title="Incoming MoMo Transaction Details"
        >
          {loadingDetail || !detailTx ? (
            <div className="flex justify-center py-12">
              <Spinner className="h-6 w-6 text-brand-600" />
            </div>
          ) : (
            <div className="space-y-4 text-sm max-h-[75vh] overflow-y-auto pr-1">
              <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-white/5 dark:bg-white/5">
                <div>
                  <span className="text-xs text-slate-500">Status</span>
                  <div className="mt-1">{momoStatusBadge(detailTx.status)}</div>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-500">Amount</span>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">
                    {formatGHS(detailTx.amount)}
                  </p>
                </div>
              </div>

              {/* Raw SMS Display (Admin only) */}
              <div>
                <Label className="text-xs text-slate-500">Raw SMS Message</Label>
                <div className="mt-1 rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800 dark:border-white/10 dark:bg-black/30 dark:text-slate-200 select-all">
                  {detailTx.rawSms}
                </div>
              </div>

              {/* Parsed Fields */}
              {detailTx.parsedData && (
                <div>
                  <Label className="text-xs text-slate-500">Parsed Fields</Label>
                  <pre className="mt-1 rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] text-slate-700 dark:border-white/10 dark:bg-black/30 dark:text-slate-300 overflow-x-auto">
                    {JSON.stringify(JSON.parse(detailTx.parsedData), null, 2)}
                  </pre>
                </div>
              )}

              {/* Metadata */}
              <dl className="divide-y divide-slate-100 text-xs dark:divide-white/5">
                <div className="flex justify-between py-2">
                  <dt className="text-slate-500">Transaction ID</dt>
                  <dd className="font-mono font-bold text-slate-900 dark:text-white">
                    {detailTx.transactionReference}
                  </dd>
                </div>
                <div className="flex justify-between py-2">
                  <dt className="text-slate-500">Network</dt>
                  <dd className="font-semibold text-slate-800 dark:text-slate-200">
                    {detailTx.network}
                  </dd>
                </div>
                <div className="flex justify-between py-2">
                  <dt className="text-slate-500">Sender Phone</dt>
                  <dd className="font-mono text-slate-800 dark:text-slate-200">
                    {detailTx.senderPhone ?? "N/A"}
                  </dd>
                </div>
                <div className="flex justify-between py-2">
                  <dt className="text-slate-500">Received Date</dt>
                  <dd className="text-slate-700 dark:text-slate-300">
                    {formatDateTime(detailTx.createdAt)}
                  </dd>
                </div>
                <div className="flex justify-between py-2">
                  <dt className="text-slate-500">Source</dt>
                  <dd className="text-slate-700 dark:text-slate-300">{detailTx.source}</dd>
                </div>
              </dl>

              {/* Claim Information */}
              {detailTx.claims && detailTx.claims.length > 0 && (
                <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-3 text-xs dark:border-brand-500/20 dark:bg-brand-500/10">
                  <h5 className="font-bold text-brand-900 dark:text-brand-300">Claim History</h5>
                  {detailTx.claims.map((claim) => (
                    <div key={claim.id} className="mt-2 flex justify-between items-center">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {claim.user.name} ({claim.user.email})
                        </p>
                        <p className="text-[11px] text-slate-500">Claimed: {formatDateTime(claim.createdAt)}</p>
                      </div>
                      <span className="rounded bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                        {claim.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Audit Trail */}
              {auditLogs.length > 0 && (
                <div>
                  <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Audit Trail
                  </h5>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {auditLogs.map((log) => (
                      <div
                        key={log.id}
                        className="rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600 dark:bg-white/5 dark:text-slate-400"
                      >
                        <div className="flex justify-between font-semibold text-slate-800 dark:text-slate-200">
                          <span>{log.action}</span>
                          <span>{formatDateTime(log.createdAt)}</span>
                        </div>
                        <p className="text-[10px] text-slate-500 truncate">Actor: {log.actorLabel}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Dialog>
      )}
    </div>
  );
}

