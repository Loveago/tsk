"use client";

import * as React from "react";
import { Search, RefreshCw, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner, EmptyState } from "@/components/shared";
import { formatDateTime } from "@/lib/types";

export function DeveloperLogsPanel() {
  const [logs, setLogs] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [search, setSearch] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "25");
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/developer/logs?${params.toString()}`);
      const json = await res.json();
      setLogs(json.logs ?? []);
      setTotalPages(json.totalPages || 1);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search request ID, endpoint, or error..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>

        <Button variant="outline" size="sm" onClick={load} className="gap-1.5 h-9">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner className="h-6 w-6 text-blue-600" />
          </div>
        ) : logs.length === 0 ? (
          <EmptyState
            title="No API logs recorded"
            description="Your API requests will be logged here with response times and debug Request IDs."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 dark:border-slate-800 font-sans">
                  <th className="px-4 py-3 font-semibold">Method & Status</th>
                  <th className="px-4 py-3 font-semibold">Endpoint</th>
                  <th className="px-4 py-3 font-semibold">Duration</th>
                  <th className="px-4 py-3 font-semibold">Request ID</th>
                  <th className="hidden px-4 py-3 font-semibold md:table-cell">Client IP</th>
                  <th className="px-4 py-3 text-right font-semibold font-sans">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {logs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${
                          l.success
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                            : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                        }`}
                      >
                        {l.method} {l.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">
                      {l.endpoint}
                      {l.errorCode && (
                        <span className="ml-2 font-mono text-[10px] text-red-500">
                          ({l.errorCode})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-sans">
                      {l.responseTimeMs ? `${l.responseTimeMs}ms` : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-[11px]">
                      {l.requestId || "—"}
                    </td>
                    <td className="hidden px-4 py-3 text-slate-400 md:table-cell">
                      {l.ip || "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400 text-[11px] font-sans">
                      {formatDateTime(l.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 p-4 dark:border-slate-800 text-xs font-sans">
            <p className="text-slate-500">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
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
