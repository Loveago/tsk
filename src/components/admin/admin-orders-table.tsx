"use client";

import * as React from "react";
import { EmptyState, Spinner } from "@/components/shared";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { formatGHS, formatDateTime } from "@/lib/types";
import { orderCode } from "@/lib/utils";
import { ClipboardList } from "lucide-react";

export interface AdminOrder {
  id: number;
  phoneNumber: string;
  network: string;
  gbAmount: number;
  amount: number;
  status: string;
  source: string;
  createdAt: string;
  user: { name: string; email: string };
}

export function AdminOrdersTable({
  data,
  loading,
  selected,
  onToggleAll,
  onToggleOne,
  onOpen,
}: {
  data: AdminOrder[];
  loading: boolean;
  selected: Set<number>;
  onToggleAll: () => void;
  onToggleOne: (id: number) => void;
  onOpen: (o: AdminOrder) => void;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-12 rounded-2xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
        <Spinner className="h-6 w-6 text-brand-600" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
      {data.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No orders found" description="Adjust the filters." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500 dark:border-slate-800">
                <th className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selected.size === data.length && data.length > 0}
                    onChange={onToggleAll}
                  />
                </th>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Size</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <td className="px-3 py-3">
                    <input type="checkbox" checked={selected.has(o.id)} onChange={() => onToggleOne(o.id)} />
                  </td>
                  <td className="cursor-pointer px-4 py-3 font-medium" onClick={() => onOpen(o)}>
                    {orderCode(o.id)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{o.user.name}</p>
                    <p className="text-xs text-slate-500">{o.user.email}</p>
                  </td>
                  <td className="px-4 py-3">{o.phoneNumber}</td>
                  <td className="px-4 py-3">{o.gbAmount}GB {o.network}</td>
                  <td className="px-4 py-3">{formatGHS(o.amount)}</td>
                  <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                  <td className="hidden px-4 py-3 text-slate-500 lg:table-cell">
                    {formatDateTime(o.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
