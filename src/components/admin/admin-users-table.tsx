"use client";

import * as React from "react";
import { EmptyState, Spinner } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { formatGHS, formatDateTime } from "@/lib/types";
import { Users, Pencil } from "lucide-react";

interface Row {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  balance: number;
  pricingProfileId: string | null;
  _count: { orders: number };
  lastLoginAt: string | null;
}

export function AdminUsersTable({
  data,
  loading,
  onEdit,
}: {
  data: Row[];
  loading: boolean;
  onEdit: (u: Row) => void;
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
        <EmptyState icon={Users} title="No users found" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500 dark:border-slate-800">
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Balance</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Orders</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">Last login</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <td className="px-4 py-3">
                    <p className="font-medium">{u.name}</p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">{u.role}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        u.status === "ACTIVE"
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                          : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                      }`}
                    >
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold">{formatGHS(u.balance)}</td>
                  <td className="hidden px-4 py-3 md:table-cell">{u._count.orders}</td>
                  <td className="hidden px-4 py-3 text-slate-500 lg:table-cell">
                    {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => onEdit(u)}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
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
