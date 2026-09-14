"use client";

import * as React from "react";
import { EmptyState, Spinner } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { formatGHS, formatDateTime } from "@/lib/types";
import { Users, Pencil, PlusCircle, Ticket, Snowflake, ShieldAlert } from "lucide-react";

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  balance: number;
  pricingProfileId: string | null;
  _count: { orders: number };
  lastLoginAt: string | null;
  signupCodeUsage?: {
    signupCode: { code: string };
    usedAt: string;
  } | null;
}

export function AdminUsersTable({
  data,
  loading,
  onEdit,
  onManualCredit,
  onToggleFreeze,
}: {
  data: UserRow[];
  loading: boolean;
  onEdit: (u: UserRow) => void;
  onManualCredit?: (u: UserRow) => void;
  onToggleFreeze?: (u: UserRow) => void;
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
                <th className="hidden px-4 py-3 font-medium md:table-cell">Signup Code</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">Orders</th>
                <th className="hidden px-4 py-3 font-medium xl:table-cell">Last login</th>
                <th className="px-4 py-3 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900 dark:text-white">{u.name}</p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold">{u.role}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        u.status === "ACTIVE"
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                          : u.status === "FROZEN"
                          ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/20"
                          : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                      }`}
                    >
                      {u.status === "FROZEN" && <Snowflake className="h-3 w-3 animate-pulse" />}
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-bold text-emerald-600 dark:text-emerald-400">{formatGHS(u.balance)}</td>
                  <td className="hidden px-4 py-3 md:table-cell text-xs">
                    {u.signupCodeUsage?.signupCode?.code ? (
                      <span className="inline-flex items-center gap-1 font-mono font-bold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/10 px-2 py-0.5 rounded">
                        <Ticket className="h-3 w-3" /> {u.signupCodeUsage.signupCode.code}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell text-xs">{u._count.orders}</td>
                  <td className="hidden px-4 py-3 text-slate-500 xl:table-cell text-xs">
                    {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1.5">
                      {onToggleFreeze && u.role !== "ADMIN" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onToggleFreeze(u)}
                          className={`h-7 text-xs ${
                            u.status === "FROZEN"
                              ? "text-amber-600 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-500/10"
                              : "text-cyan-600 border-cyan-300 hover:bg-cyan-50 dark:hover:bg-cyan-500/10"
                          }`}
                          title={u.status === "FROZEN" ? "Unfreeze user account" : "Freeze user account"}
                        >
                          <Snowflake className="h-3 w-3" />
                          {u.status === "FROZEN" ? "Unfreeze" : "Freeze"}
                        </Button>
                      )}
                      {onManualCredit && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onManualCredit(u)}
                          className="h-7 text-xs"
                          title="Manual wallet credit"
                        >
                          <PlusCircle className="h-3 w-3 text-emerald-600" /> Credit
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => onEdit(u)} className="h-7 text-xs">
                        <Pencil className="h-3 w-3" /> Edit
                      </Button>
                    </div>
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
