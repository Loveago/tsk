"use client";

import * as React from "react";
import { PageHeader } from "@/components/shared";
import { UserFormDialog } from "@/components/admin/user-form-dialog";
import { AdminUsersTable } from "@/components/admin/admin-users-table";
import { ExportButtons } from "@/components/admin/export-buttons";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";
import { Users } from "lucide-react";

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

export default function AdminUsersPage() {
  const [data, setData] = React.useState<Row[]>([]);
  const [total, setTotal] = React.useState(0);
  const [pages, setPages] = React.useState(1);
  const [page, setPage] = React.useState(1);
  const [role, setRole] = React.useState("");
  const [q, setQ] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Row | null>(null);
  const [profiles, setProfiles] = React.useState<{ id: string; name: string }[]>([]);

  const load = React.useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (role) params.set("role", role);
    if (q) params.set("q", q);
    const res = await fetch(`/api/admin/users?${params}`);
    const json = await res.json();
    setData(json.data ?? []);
    setTotal(json.total ?? 0);
    setPages(json.pages ?? 1);
    setLoading(false);
  }, [page, role, q]);

  React.useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  React.useEffect(() => {
    fetch("/api/admin/pricing")
      .then((r) => r.json())
      .then((d) =>
        setProfiles(
          (d.profiles ?? []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))
        )
      );
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description={`${total} registered users`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ExportButtons type="users" />
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Users className="h-4 w-4" /> Add user
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Role</Label>
          <Select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
            <option value="">All</option>
            {["USER", "RESELLER", "MANAGER", "ADMIN"].map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </Select>
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>Search name / email</Label>
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="kwame…" />
        </div>
      </div>

      <AdminUsersTable
        data={data}
        loading={loading}
        onEdit={(u) => {
          setEditing(u);
          setDialogOpen(true);
        }}
      />

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
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

      <UserFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        user={editing}
        profiles={profiles}
        onSaved={load}
      />
    </div>
  );
}
