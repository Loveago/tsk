"use client";

import * as React from "react";
import { PageHeader, EmptyState, Spinner } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/types";
import { ScrollText } from "lucide-react";

interface Log {
  id: number;
  actorLabel: string;
  action: string;
  target: string;
  previousValue: string | null;
  newValue: string | null;
  ip: string | null;
  createdAt: string;
}

export default function AdminAuditLogsPage() {
  const [data, setData] = React.useState<Log[]>([]);
  const [total, setTotal] = React.useState(0);
  const [pages, setPages] = React.useState(1);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/audit-logs?page=${page}&pageSize=30`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        setData(json.data ?? []);
        setTotal(json.total ?? 0);
        setPages(json.pages ?? 1);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [page]);

  return (
    <div className="space-y-6">
      <PageHeader title="Audit Logs" description={`${total} recorded actions`} />

      <div className="rounded-2xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner className="h-6 w-6 text-brand-600" />
          </div>
        ) : data.length === 0 ? (
          <EmptyState icon={ScrollText} title="No audit entries yet" />
        ) : (
          <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
            {data.map((log) => (
              <li key={log.id} className="px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 font-mono text-[11px] font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                    {log.action}
                  </span>
                  <span className="font-medium">{log.actorLabel}</span>
                  <span className="text-slate-400">→</span>
                  <span className="font-mono text-xs text-slate-500">{log.target}</span>
                  <span className="ml-auto text-xs text-slate-400">
                    {formatDateTime(log.createdAt)}
                  </span>
                </div>
                {(log.previousValue || log.newValue) && (
                  <p className="mt-1 truncate font-mono text-[11px] text-slate-400">
                    {log.previousValue ? `${log.previousValue} → ` : ""}
                    {log.newValue ?? ""}
                  </p>
                )}
              </li>
            ))}
          </ul>
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
