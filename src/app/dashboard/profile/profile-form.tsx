"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Save, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Spinner } from "@/components/shared";
import { useToast } from "@/components/toast";

interface Initial {
  name: string;
  email: string;
  phone: string;
}

export function ProfileForms({ initial }: { initial: Initial }) {
  const { toast } = useToast();
  const router = useRouter();
  const [name, setName] = React.useState(initial.name);
  const [email, setEmail] = React.useState(initial.email);
  const [phone, setPhone] = React.useState(initial.phone);
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [pwError, setPwError] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError("");
    if (newPassword || confirmPassword || currentPassword) {
      if (!currentPassword) {
        return setPwError("Enter your current password to set a new one.");
      }
      if (newPassword.length < 8) {
        return setPwError("New password must be at least 8 characters.");
      }
      if (newPassword !== confirmPassword) {
        return setPwError("New password and confirmation do not match.");
      }
    }
    setSaving(true);
    try {
      const body: Record<string, string> = { name, email, phone };
      if (newPassword) {
        body.newPassword = newPassword;
        body.currentPassword = currentPassword;
      }
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) return toast(json.error ?? "Update failed", "error");
      toast(
        newPassword
          ? "Profile & password updated — other sessions signed out"
          : "Profile updated",
        "success"
      );
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "rounded-xl border-slate-200 bg-white dark:border-white/10 dark:bg-white/5";

  return (
    <form onSubmit={save} className="space-y-5">
      {/* Account details */}
      <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-[#0d1526]">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3 dark:border-white/5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
            <UserRound className="h-4 w-4" />
          </span>
          <h3 className="text-sm font-bold">Account Details</h3>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email address</Label>
            <Input id="email" type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="phone">Phone number</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="e.g. 0244123456"
              className={inputCls}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={20}
            />
            <p className="text-[11px] text-slate-400">Used for order notifications and account verification.</p>
          </div>
        </div>
      </div>

      {/* Security */}
      <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-[#0d1526]">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3 dark:border-white/5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
            <KeyRound className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-bold">Security</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Change your password — optional</p>
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="currentPassword">Current password</Label>
            <Input id="currentPassword" type="password" autoComplete="current-password" className={inputCls} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="newPassword">New password</Label>
            <Input id="newPassword" type="password" autoComplete="new-password" className={inputCls} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input id="confirmPassword" type="password" autoComplete="new-password" className={inputCls} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>
        </div>
        {pwError && (
          <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400">
            {pwError}
          </p>
        )}
        <p className="mt-3 text-[11px] text-slate-400">
          Changing your password signs out all other sessions for security.
        </p>
        <Button type="submit" disabled={saving} className="mt-4">
          {saving ? <Spinner /> : <Save className="h-4 w-4" />} Save changes
        </Button>
      </div>
    </form>
  );
}