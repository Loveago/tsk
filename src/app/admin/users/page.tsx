"use client";

import * as React from "react";
import { PageHeader } from "@/components/shared";
import { UserFormDialog } from "@/components/admin/user-form-dialog";
import { AdminUsersTable, type UserRow } from "@/components/admin/admin-users-table";
import { ManualCreditDialog } from "@/components/admin/manual-credit-dialog";
import { ExportButtons } from "@/components/admin/export-buttons";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { Users } from "lucide-react";

export default function AdminUsersPage() {
  const { toast } = useToast();
  const [data, setData] = React.useState<UserRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [pages, setPages] = React.useState(1);
  const [page, setPage] = React.useState(1);
  const [role, setRole] = React.useState("");
  const [q, setQ] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<UserRow | null>(null);
  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = React.useState(false);
  const [adjustingUser, setAdjustingUser] = React.useState<UserRow | null>(null);
  const [adjustmentMode, setAdjustmentMode] = React.useState<"CREDIT" | "DEBIT">("CREDIT");
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

  const handleFreeze = async (u: UserRow) => {
    const actionName = u.status === "FROZEN" ? "unfreeze" : "freeze";
    if (!confirm(`Are you sure you want to ${actionName} ${u.name}'s account?`)) return;
    try {
      const res = await fetch(`/api/admin/users/${u.id}/freeze`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) return toast(json.error ?? `Failed to ${actionName} user`, "error");
      toast(json.user?.status === "FROZEN" ? `User ${u.name} account frozen` : `User ${u.name} account unfrozen`, "success");
      load();
    } catch {
      toast(`Failed to ${actionName} user`, "error");
    }
  };

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

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search name or email…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        />
        <Select
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(1);
          }}
          className="w-40"
        >
          <option value="">All roles</option>
          <option value="USER">USER</option>
          <option value="RESELLER">RESELLER</option>
          <option value="MANAGER">MANAGER</option>
          <option value="SECRETARY">SECRETARY</option>
          <option value="ADMIN">ADMIN</option>
        </Select>
      </div>

      <AdminUsersTable
        data={data}
        loading={loading}
        onEdit={(u) => {
          setEditing(u);
          setDialogOpen(true);
        }}
        onManualCredit={(u) => {
          setAdjustingUser(u);
          setAdjustmentMode("CREDIT");
          setAdjustmentDialogOpen(true);
        }}
        onManualDebit={(u) => {
          setAdjustingUser(u);
          setAdjustmentMode("DEBIT");
          setAdjustmentDialogOpen(true);
        }}
        onToggleFreeze={handleFreeze}
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

      <ManualCreditDialog
        open={adjustmentDialogOpen}
        initialMode={adjustmentMode}
        onClose={() => {
          setAdjustmentDialogOpen(false);
          setAdjustingUser(null);
        }}
        user={adjustingUser}
        onAdjusted={load}
      />
    </div>
  );
}
