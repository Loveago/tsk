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
}

const ROLES = ["USER", "RESELLER", "MANAGER", "ADMIN"];

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
              <option value="DISABLED">DISABLED</option>
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
        <Button className="w-full" onClick={save} disabled={saving}>
          {saving && <Spinner />} {user ? "Save changes" : "Create user"}
        </Button>
      </div>
    </Dialog>
  );
}
