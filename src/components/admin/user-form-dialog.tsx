"use client";

import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/shared";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  balance: number;
  pricingProfileId: string | null;
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

const ROLES = ["USER", "RESELLER", "MANAGER", "SECRETARY", "ADMIN"];

export function UserFormDialog({
  open,
  onClose,
  user,
  profiles,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  user: AdminUser | null;
  profiles: { id: string; name: string }[];
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [role, setRole] = React.useState("USER");
  const [status, setStatus] = React.useState("ACTIVE");
  const [balance, setBalance] = React.useState("0");
  const [profileId, setProfileId] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName(user?.name ?? "");
      setEmail(user?.email ?? "");
      setPassword("");
      setRole(user?.role ?? "USER");
      setStatus(user?.status ?? "ACTIVE");
      setBalance(String(user?.balance ?? 0));
      setProfileId(user?.pricingProfileId ?? "");
    }
  }, [open, user]);

  const save = async () => {
    setSaving(true);
    try {
      const url = user ? `/api/admin/users/${user.id}` : "/api/admin/users";
      const body: Record<string, unknown> = { name, email, role, status, balance: Number(balance), pricingProfileId: profileId };
      if (!user) body.password = password || undefined;
      else if (password) body.password = password;

      const res = await fetch(url, {
        method: user ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) return toast(json.error ?? "Save failed", "error");
      toast(user ? "User updated" : "User created", "success");
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={user ? `Edit ${user.name}` : "Add user"}>
      <div className="space-y-3 text-sm">
        {user?.signupCodeUsage?.signupCode?.code && (
          <div className="rounded-xl bg-brand-50/70 border border-brand-200 dark:border-brand-500/20 dark:bg-brand-500/10 p-3 flex justify-between items-center text-xs">
            <div>
              <span className="text-slate-500 dark:text-slate-400 block font-medium">Signup Code:</span>
              <span className="font-mono font-bold text-brand-700 dark:text-brand-300 text-sm">
                {user.signupCodeUsage.signupCode.code}
              </span>
            </div>
            <div className="text-right text-slate-500 dark:text-slate-400">
              <span className="block font-medium">Used At:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {new Date(user.signupCodeUsage.usedAt).toLocaleString()}
              </span>
            </div>
          </div>
        )}
        {user?.status === "PENDING_PAYMENT" && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 dark:border-amber-900/40 dark:bg-amber-950/30 p-3 flex justify-between items-center text-xs">
            <div className="space-y-0.5">
              <span className="font-bold text-amber-800 dark:text-amber-300 block">
                ⚡ Account Awaiting Payment
              </span>
              <span className="text-amber-700/80 dark:text-amber-400 text-[11px]">
                You can activate this account to grant immediate access.
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setStatus("ACTIVE");
                toast("Status changed to ACTIVE. Click Save changes below to persist.", "info");
              }}
              className="text-xs bg-white dark:bg-slate-900 border-amber-300 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/50"
            >
              Set Active
            </Button>
          </div>
        )}
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>{user ? "New password (leave blank to keep)" : "Password"}</Label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={user ? "••••••••" : "min 8 characters"}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} disabled={!!user && user.role === "ADMIN"}>
              <option value="ACTIVE">ACTIVE</option>
              <option value="PENDING_PAYMENT">PENDING_PAYMENT</option>
              <option value="DISABLED">DISABLED</option>
              <option value="FROZEN">FROZEN</option>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Wallet balance (GHS)</Label>
            <Input type="number" min="0" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Pricing profile</Label>
            <Select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
              <option value="">Default (retail)</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>
        </div>
        {user?.registrationPayment && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-1.5 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="flex items-center justify-between font-semibold">
              <span className="text-slate-700 dark:text-slate-300">Registration Fee</span>
              {user.registrationPayment.status === "APPROVED" ? (
                <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                  Paid (₵{user.registrationPayment.amount.toFixed(2)})
                </span>
              ) : user.registrationPayment.status === "PENDING" ? (
                <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                  Pending (₵{user.registrationPayment.amount.toFixed(2)})
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300">
                  {user.registrationPayment.status}
                </span>
              )}
            </div>
            {user.registrationPayment.reference && (
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span>Paystack Reference:</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200 select-all">
                  {user.registrationPayment.reference}
                </span>
              </div>
            )}
            {user.registrationPayment.note && (
              <div className="text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-200/60 dark:border-slate-700/60 pt-1">
                {user.registrationPayment.note}
              </div>
            )}
          </div>
        )}

        <Button className="w-full" onClick={save} disabled={saving}>
          {saving && <Spinner />} {user ? "Save changes" : "Create user"}
        </Button>
      </div>
    </Dialog>
  );
}
