"use client";

import * as React from "react";
import Link from "next/link";
import { EmptyState, Spinner } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { formatGHS, formatDateTime } from "@/lib/types";
import {
  Users,
  Pencil,
  PlusCircle,
  MinusCircle,
  Ticket,
  Snowflake,
  ShieldAlert,
  CheckCircle2,
  Trash2,
  Clock,
  Copy,
  Check,
  Wallet,
  MessageSquare,
} from "lucide-react";

function CopyRefButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);

  const onCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      title="Copy reference"
      className="inline-flex items-center p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  balance: number;
  overdraftEnabled?: boolean;
  pricingProfileId: string | null;
  _count: { orders: number };
  lastLoginAt: string | null;
  signupCodeUsage?: {
    signupCode: { code: string };
    usedAt: string;
  } | null;
  registrationPayment?: {
    id: string;
    reference: string | null;
    amount: number;
    status: string;
    note: string | null;
    paidAt: string | null;
    createdAt: string;
  } | null;
}

export function AdminUsersTable({
  data,
  loading,
  selectedIds = [],
  onSelect,
  onSelectAll,
  currentUserId,
  onEdit,
  onManualCredit,
  onManualDebit,
  onToggleOverdraft,
  onToggleFreeze,
  onActivate,
  onDelete,
  onMessage,
}: {
  data: UserRow[];
  loading: boolean;
  selectedIds?: string[];
  onSelect?: (id: string) => void;
  onSelectAll?: () => void;
  currentUserId?: string;
  onEdit: (u: UserRow) => void;
  onManualCredit?: (u: UserRow) => void;
  onManualDebit?: (u: UserRow) => void;
  onToggleOverdraft?: (u: UserRow) => void;
  onToggleFreeze?: (u: UserRow) => void;
  onActivate?: (u: UserRow) => void;
  onDelete?: (u: UserRow) => void;
  onMessage?: (u: UserRow) => void;
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
                {onSelectAll && (
                  <th className="w-10 px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={data.length > 0 && selectedIds.length === data.length}
                      onChange={onSelectAll}
                      aria-label="Select all users"
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800"
                    />
                  </th>
                )}
                <th className="px-3 py-3 font-medium">User</th>
                <th className="px-3 py-3 font-medium">Role</th>
                <th className="px-3 py-3 font-medium whitespace-nowrap">Status</th>
                <th className="px-3 py-3 font-medium whitespace-nowrap">Registration / Ref</th>
                <th className="px-3 py-3 font-medium whitespace-nowrap">Balance</th>
                <th className="hidden px-3 py-3 font-medium xl:table-cell whitespace-nowrap">Signup Code</th>
                <th className="hidden px-3 py-3 font-medium lg:table-cell whitespace-nowrap">Orders</th>
                <th className="hidden px-3 py-3 font-medium xl:table-cell whitespace-nowrap">Last login</th>
                <th className="px-3 py-3 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.map((u) => {
                const isSelected = selectedIds.includes(u.id);
                return (
                  <tr
                    key={u.id}
                    className={`transition hover:bg-slate-50 dark:hover:bg-slate-800/60 ${
                      isSelected ? "bg-brand-50/40 dark:bg-brand-950/20" : ""
                    }`}
                  >
                    {onSelect && (
                      <td className="w-10 px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => onSelect(u.id)}
                          aria-label={`Select ${u.name}`}
                          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800"
                        />
                      </td>
                    )}
                    <td className="px-3 py-3">
                      <p className="font-medium text-slate-900 dark:text-white">{u.name}</p>
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </td>
                    <td className="px-3 py-3 text-xs font-semibold whitespace-nowrap">{u.role}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${
                          u.status === "ACTIVE"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                            : u.status === "FROZEN"
                            ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/20"
                            : u.status === "PENDING_PAYMENT"
                            ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20"
                            : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                        }`}
                      >
                        {u.status === "FROZEN" && <Snowflake className="h-3 w-3 shrink-0 animate-pulse" />}
                        {u.status === "PENDING_PAYMENT" && <Clock className="h-3 w-3 shrink-0" />}
                        {u.status === "PENDING_PAYMENT" ? "Awaiting Payment" : u.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {u.registrationPayment ? (
                        <div className="flex flex-col gap-1">
                          <div>
                            {u.registrationPayment.status === "APPROVED" ? (
                              <span
                                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 whitespace-nowrap"
                                title={u.registrationPayment.paidAt ? `Paid on ${formatDateTime(u.registrationPayment.paidAt)}` : undefined}
                              >
                                <CheckCircle2 className="h-2.5 w-2.5 shrink-0" /> Paid {formatGHS(u.registrationPayment.amount)}
                              </span>
                            ) : u.registrationPayment.status === "PENDING" ? (
                              <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20 whitespace-nowrap">
                                <Clock className="h-2.5 w-2.5 shrink-0" /> Pending {formatGHS(u.registrationPayment.amount)}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400 whitespace-nowrap">
                                {u.registrationPayment.status}
                              </span>
                            )}
                          </div>
                          {u.registrationPayment.reference && (
                            <div className="flex items-center gap-1 text-[11px] font-mono text-slate-600 dark:text-slate-300">
                              <span
                                className="truncate max-w-[125px]"
                                title={u.registrationPayment.note || u.registrationPayment.reference}
                              >
                                {u.registrationPayment.reference}
                              </span>
                              <CopyRefButton text={u.registrationPayment.reference} />
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Exempt / Free</span>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex flex-col items-start gap-1">
                        <Link
                          href={`/admin/wallets?userId=${u.id}`}
                          className={`inline-flex items-center gap-1.5 font-bold hover:underline group whitespace-nowrap ${
                            u.balance < 0
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-emerald-600 dark:text-emerald-400"
                          }`}
                          title="Inspect user wallet balance and activity ledger"
                        >
                          <Wallet
                            className={`h-3.5 w-3.5 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity ${
                              u.balance < 0 ? "text-rose-500" : "text-emerald-500"
                            }`}
                          />
                          <span>{formatGHS(u.balance)}</span>
                        </Link>
                        {onToggleOverdraft ? (
                          <button
                            type="button"
                            onClick={() => onToggleOverdraft(u)}
                            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold transition border whitespace-nowrap ${
                              u.overdraftEnabled
                                ? "bg-violet-50 text-violet-700 border-violet-300 hover:bg-violet-100 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30"
                                : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100 hover:text-slate-700 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700 dark:hover:bg-slate-800"
                            }`}
                            title={
                              u.overdraftEnabled
                                ? "Overdraft is ON — click to turn OFF"
                                : "Overdraft is OFF — click to turn ON"
                            }
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                u.overdraftEnabled ? "bg-violet-600 dark:bg-violet-400" : "bg-slate-400"
                              }`}
                            />
                            {u.overdraftEnabled ? "Overdraft: ON" : "Overdraft: OFF"}
                          </button>
                        ) : (
                          u.overdraftEnabled && (
                            <span
                              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/20 whitespace-nowrap"
                              title="Overdraft is enabled for this user"
                            >
                              Overdraft ON
                            </span>
                          )
                        )}
                      </div>
                    </td>
                    <td className="hidden px-3 py-3 xl:table-cell text-xs whitespace-nowrap">
                      {u.signupCodeUsage?.signupCode?.code ? (
                        <span className="inline-flex items-center gap-1 font-mono font-bold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/10 px-2 py-0.5 rounded">
                          <Ticket className="h-3 w-3" /> {u.signupCodeUsage.signupCode.code}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="hidden px-3 py-3 lg:table-cell text-xs whitespace-nowrap">{u._count.orders}</td>
                    <td className="hidden px-3 py-3 text-slate-500 xl:table-cell text-xs whitespace-nowrap">
                      {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"}
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      <div className="flex justify-end gap-1 items-center flex-nowrap">
                        {onActivate && u.status === "PENDING_PAYMENT" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onActivate(u)}
                            className="h-7 px-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border-emerald-300 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-700 dark:text-emerald-400 shadow-sm whitespace-nowrap"
                            title="Activate awaiting payment account"
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-600 dark:text-emerald-400" />
                            Activate
                          </Button>
                        )}
                        {onToggleFreeze && u.role !== "ADMIN" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onToggleFreeze(u)}
                            className={`h-7 px-2 text-xs whitespace-nowrap ${
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
                            className="h-7 px-2 text-xs whitespace-nowrap"
                            title="Manual wallet credit"
                          >
                            <PlusCircle className="h-3 w-3 text-emerald-600" /> Credit
                          </Button>
                        )}
                        {onManualDebit && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onManualDebit(u)}
                            className="h-7 px-2 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 border-rose-200 dark:border-rose-900/40 whitespace-nowrap"
                            title="Manual wallet debit"
                          >
                            <MinusCircle className="h-3 w-3 text-rose-600 dark:text-rose-400" /> Debit
                          </Button>
                        )}
                        {onMessage && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onMessage(u)}
                            className="h-7 px-2 text-xs text-brand-700 border-brand-200 hover:bg-brand-50 dark:text-brand-300 dark:border-brand-500/30 dark:hover:bg-brand-950/30 whitespace-nowrap"
                            title="Contact user via system chat"
                          >
                            <MessageSquare className="h-3 w-3 text-brand-600 dark:text-brand-400" /> Chat
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => onEdit(u)} className="h-7 px-2 text-xs whitespace-nowrap">
                          <Pencil className="h-3 w-3" /> Edit
                        </Button>
                        {onDelete && u.id !== currentUserId && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onDelete(u)}
                            className="h-7 px-2 text-xs text-rose-600 border-rose-200 hover:bg-rose-50 hover:border-rose-300 dark:text-rose-400 dark:border-rose-900/50 dark:hover:bg-rose-950/30"
                            title="Delete user account"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
