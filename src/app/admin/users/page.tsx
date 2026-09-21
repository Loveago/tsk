"use client";

import * as React from "react";
import { PageHeader } from "@/components/shared";
import { UserFormDialog } from "@/components/admin/user-form-dialog";
import { AdminUsersTable, type UserRow } from "@/components/admin/admin-users-table";
import { ManualCreditDialog } from "@/components/admin/manual-credit-dialog";
import { ExportButtons } from "@/components/admin/export-buttons";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/toast";
import {
  Users,
  CheckCircle2,
  Trash2,
  Snowflake,
  Clock,
  Filter,
  X,
  AlertTriangle,
  Zap,
} from "lucide-react";

export default function AdminUsersPage() {
  const { toast } = useToast();
  const [data, setData] = React.useState<UserRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [pages, setPages] = React.useState(1);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(true);

  // Current logged in admin
  const [currentUser, setCurrentUser] = React.useState<{ id: string; role: string } | null>(null);

  // Filters
  const [q, setQ] = React.useState("");
  const [role, setRole] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [balance, setBalance] = React.useState("");
  const [pricingProfileId, setPricingProfileId] = React.useState("");
  const [hasOrders, setHasOrders] = React.useState("");
  const [hasSignupCode, setHasSignupCode] = React.useState("");

  // Counts for tabs/badges
  const [counts, setCounts] = React.useState({
    total: 0,
    awaitingPayment: 0,
    zeroBalance: 0,
    frozen: 0,
    active: 0,
  });

  // Modals & single actions
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<UserRow | null>(null);
  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = React.useState(false);
  const [adjustingUser, setAdjustingUser] = React.useState<UserRow | null>(null);
  const [adjustmentMode, setAdjustmentMode] = React.useState<"CREDIT" | "DEBIT">("CREDIT");
  const [profiles, setProfiles] = React.useState<{ id: string; name: string }[]>([]);

  // Delete single user confirmation dialog
  const [deleteConfirmUser, setDeleteConfirmUser] = React.useState<UserRow | null>(null);
  const [deletingSingle, setDeletingSingle] = React.useState(false);

  // Selection & Bulk actions
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [bulkActionConfirm, setBulkActionConfirm] = React.useState<{
    action: "FREEZE" | "UNFREEZE" | "ACTIVATE" | "DELETE";
    title: string;
    description: string;
    isDestructive?: boolean;
  } | null>(null);
  const [bulkProcessing, setBulkProcessing] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user) setCurrentUser(d.user);
      })
      .catch(() => {});
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (q) params.set("q", q);
    if (role) params.set("role", role);
    if (status) params.set("status", status);
    if (balance) params.set("balance", balance);
    if (pricingProfileId) params.set("pricingProfileId", pricingProfileId);
    if (hasOrders) params.set("hasOrders", hasOrders);
    if (hasSignupCode) params.set("hasSignupCode", hasSignupCode);

    try {
      const res = await fetch(`/api/admin/users?${params}`);
      const json = await res.json();
      setData(json.data ?? []);
      setTotal(json.total ?? 0);
      setPages(json.pages ?? 1);
      if (json.counts) {
        setCounts(json.counts);
      }
    } catch {
      toast("Failed to load users", "error");
    } finally {
      setLoading(false);
    }
  }, [page, q, role, status, balance, pricingProfileId, hasOrders, hasSignupCode, toast]);

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

  // Selection handlers
  const handleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (data.length === 0) return;
    const pageIds = data.map((u) => u.id);
    const allSelected = pageIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  // Single user activation
  const handleActivate = async (u: UserRow) => {
    try {
      const res = await fetch(`/api/admin/users/${u.id}/activate`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) return toast(json.error ?? "Failed to activate user", "error");
      toast(`User ${u.name} account activated successfully`, "success");
      load();
    } catch {
      toast("Failed to activate user", "error");
    }
  };

  // Single user freeze / unfreeze
  const handleFreeze = async (u: UserRow) => {
    const actionName = u.status === "FROZEN" ? "unfreeze" : "freeze";
    if (!confirm(`Are you sure you want to ${actionName} ${u.name}'s account?`)) return;
    try {
      const res = await fetch(`/api/admin/users/${u.id}/freeze`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) return toast(json.error ?? `Failed to ${actionName} user`, "error");
      toast(
        json.user?.status === "FROZEN"
          ? `User ${u.name} account frozen`
          : `User ${u.name} account unfrozen`,
        "success"
      );
      load();
    } catch {
      toast(`Failed to ${actionName} user`, "error");
    }
  };

  // Single user deletion
  const handleDeleteConfirm = async () => {
    if (!deleteConfirmUser) return;
    setDeletingSingle(true);
    try {
      const res = await fetch(`/api/admin/users/${deleteConfirmUser.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) return toast(json.error ?? "Failed to delete user", "error");
      toast(`User ${deleteConfirmUser.name} deleted successfully`, "success");
      setSelectedIds((prev) => prev.filter((id) => id !== deleteConfirmUser.id));
      setDeleteConfirmUser(null);
      load();
    } catch {
      toast("Failed to delete user", "error");
    } finally {
      setDeletingSingle(false);
    }
  };

  // Bulk action execution
  const handleExecuteBulkAction = async () => {
    if (!bulkActionConfirm || selectedIds.length === 0) return;
    setBulkProcessing(true);
    try {
      const res = await fetch("/api/admin/users/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: bulkActionConfirm.action,
          userIds: selectedIds,
        }),
      });
      const json = await res.json();
      if (!res.ok) return toast(json.error ?? "Bulk action failed", "error");
      toast(json.message ?? "Bulk action completed", "success");
      setSelectedIds([]);
      setBulkActionConfirm(null);
      load();
    } catch {
      toast("Bulk action failed", "error");
    } finally {
      setBulkProcessing(false);
    }
  };

  const hasActiveFilters =
    Boolean(q) ||
    Boolean(role) ||
    Boolean(status) ||
    Boolean(balance) ||
    Boolean(pricingProfileId) ||
    Boolean(hasOrders) ||
    Boolean(hasSignupCode);

  const clearAllFilters = () => {
    setQ("");
    setRole("");
    setStatus("");
    setBalance("");
    setPricingProfileId("");
    setHasOrders("");
    setHasSignupCode("");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description={`${total} registered users found`}
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

      {/* Quick Filter Status Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200/80 pb-3 dark:border-slate-800">
        <button
          type="button"
          onClick={() => {
            setStatus("");
            setBalance("");
            setPage(1);
          }}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
            !status && !balance
              ? "bg-brand-600 text-white shadow-sm"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          }`}
        >
          All Users
          <span className="rounded-full bg-black/10 dark:bg-white/10 px-1.5 py-0.2 text-[10px]">
            {counts.total}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setStatus("PENDING_PAYMENT");
            setBalance("");
            setPage(1);
          }}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
            status === "PENDING_PAYMENT"
              ? "bg-amber-500 text-white shadow-sm"
              : "bg-amber-50 text-amber-800 border border-amber-200/80 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800/40"
          }`}
        >
          <Clock className="h-3.5 w-3.5" />
          Awaiting Payment
          {counts.awaitingPayment > 0 && (
            <span className="rounded-full bg-amber-600/20 dark:bg-amber-400/20 px-1.5 py-0.2 text-[10px] font-bold">
              {counts.awaitingPayment}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setBalance("zero");
            setStatus("");
            setPage(1);
          }}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
            balance === "zero"
              ? "bg-indigo-600 text-white shadow-sm"
              : "bg-indigo-50 text-indigo-800 border border-indigo-200/80 hover:bg-indigo-100 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-800/40"
          }`}
        >
          Zero Balance (GHS 0.00)
          <span className="rounded-full bg-indigo-600/20 dark:bg-indigo-400/20 px-1.5 py-0.2 text-[10px] font-bold">
            {counts.zeroBalance}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setStatus("FROZEN");
            setBalance("");
            setPage(1);
          }}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
            status === "FROZEN"
              ? "bg-cyan-600 text-white shadow-sm"
              : "bg-cyan-50 text-cyan-800 border border-cyan-200/80 hover:bg-cyan-100 dark:bg-cyan-950/30 dark:text-cyan-400 dark:border-cyan-800/40"
          }`}
        >
          <Snowflake className="h-3.5 w-3.5" />
          Frozen
          {counts.frozen > 0 && (
            <span className="rounded-full bg-cyan-600/20 dark:bg-cyan-400/20 px-1.5 py-0.2 text-[10px] font-bold">
              {counts.frozen}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setStatus("ACTIVE");
            setBalance("");
            setPage(1);
          }}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
            status === "ACTIVE"
              ? "bg-emerald-600 text-white shadow-sm"
              : "bg-emerald-50 text-emerald-800 border border-emerald-200/80 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800/40"
          }`}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Active
          <span className="rounded-full bg-emerald-600/20 dark:bg-emerald-400/20 px-1.5 py-0.2 text-[10px] font-bold">
            {counts.active}
          </span>
        </button>
      </div>

      {/* Advanced Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-2.5">
        <Input
          placeholder="Search name, email or phone…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          className="max-w-xs h-9 text-xs"
        />

        {/* Status Filter */}
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="w-40 h-9 text-xs"
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="PENDING_PAYMENT">Awaiting Payment</option>
          <option value="FROZEN">Frozen</option>
          <option value="DISABLED">Disabled</option>
        </Select>

        {/* Balance Filter */}
        <Select
          value={balance}
          onChange={(e) => {
            setBalance(e.target.value);
            setPage(1);
          }}
          className="w-44 h-9 text-xs font-medium"
        >
          <option value="">All Balances</option>
          <option value="zero">Zero Balance (GHS 0.00)</option>
          <option value="positive">Positive Balance (&gt; 0)</option>
          <option value="low">Low Balance (&le; GHS 10)</option>
          <option value="negative">Negative Balance (&lt; 0)</option>
        </Select>

        {/* Role Filter */}
        <Select
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(1);
          }}
          className="w-36 h-9 text-xs"
        >
          <option value="">All Roles</option>
          <option value="USER">USER</option>
          <option value="RESELLER">RESELLER</option>
          <option value="MANAGER">MANAGER</option>
          <option value="SECRETARY">SECRETARY</option>
          <option value="ADMIN">ADMIN</option>
        </Select>

        {/* Pricing Profile Filter */}
        <Select
          value={pricingProfileId}
          onChange={(e) => {
            setPricingProfileId(e.target.value);
            setPage(1);
          }}
          className="w-40 h-9 text-xs"
        >
          <option value="">All Pricing Profiles</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>

        {/* Orders Placed Filter */}
        <Select
          value={hasOrders}
          onChange={(e) => {
            setHasOrders(e.target.value);
            setPage(1);
          }}
          className="w-36 h-9 text-xs"
        >
          <option value="">All Orders</option>
          <option value="yes">Has Orders (&ge; 1)</option>
          <option value="no">No Orders (0)</option>
        </Select>

        {/* Signup Code Filter */}
        <Select
          value={hasSignupCode}
          onChange={(e) => {
            setHasSignupCode(e.target.value);
            setPage(1);
          }}
          className="w-40 h-9 text-xs"
        >
          <option value="">All Signups</option>
          <option value="yes">Used Signup Code</option>
          <option value="no">No Signup Code</option>
        </Select>

        {hasActiveFilters && (
          <Button
            size="sm"
            variant="ghost"
            onClick={clearAllFilters}
            className="h-9 px-2.5 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20"
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Reset Filters
          </Button>
        )}
      </div>

      {/* Floating Bulk Actions Bar */}
      {selectedIds.length > 0 && (
        <div className="sticky top-4 z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-200 bg-white/95 p-3 shadow-xl backdrop-blur-md dark:border-brand-500/30 dark:bg-[#0f172a]/95 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-brand-600 px-2 text-xs font-bold text-white">
              {selectedIds.length}
            </span>
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              user(s) selected
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedIds([])}
              className="h-7 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400"
            >
              Deselect All
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {/* Bulk Activate */}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setBulkActionConfirm({
                  action: "ACTIVATE",
                  title: `Activate ${selectedIds.length} User Account(s)?`,
                  description:
                    "This will immediately change their status to ACTIVE and approve any pending registration fee transactions.",
                })
              }
              className="h-8 text-xs font-semibold text-emerald-700 bg-emerald-50 border-emerald-300 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:border-emerald-700 dark:text-emerald-300"
            >
              <Zap className="h-3.5 w-3.5 mr-1" />
              Bulk Activate
            </Button>

            {/* Bulk Freeze */}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setBulkActionConfirm({
                  action: "FREEZE",
                  title: `Freeze ${selectedIds.length} User Account(s)?`,
                  description:
                    "Frozen users will have their sessions terminated immediately and will not be able to place orders or make requests until unfrozen.",
                  isDestructive: false,
                })
              }
              className="h-8 text-xs text-cyan-700 border-cyan-300 hover:bg-cyan-50 dark:text-cyan-300 dark:border-cyan-800 dark:hover:bg-cyan-950/30"
            >
              <Snowflake className="h-3.5 w-3.5 mr-1" />
              Bulk Freeze
            </Button>

            {/* Bulk Unfreeze */}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setBulkActionConfirm({
                  action: "UNFREEZE",
                  title: `Unfreeze ${selectedIds.length} User Account(s)?`,
                  description: "This will restore the status of these user accounts to ACTIVE.",
                })
              }
              className="h-8 text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Bulk Unfreeze
            </Button>

            {/* Bulk Delete */}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setBulkActionConfirm({
                  action: "DELETE",
                  title: `Delete ${selectedIds.length} User Account(s)?`,
                  description:
                    "WARNING: This will permanently delete these user accounts, including all their orders, transactions, delivery reports, and API keys. This action cannot be reversed.",
                  isDestructive: true,
                })
              }
              className="h-8 text-xs text-rose-600 border-rose-300 hover:bg-rose-50 dark:text-rose-400 dark:border-rose-900/60 dark:hover:bg-rose-950/30"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Bulk Delete
            </Button>
          </div>
        </div>
      )}

      {/* Main Users Table */}
      <AdminUsersTable
        data={data}
        loading={loading}
        selectedIds={selectedIds}
        onSelect={handleSelect}
        onSelectAll={handleSelectAll}
        currentUserId={currentUser?.id}
        onActivate={handleActivate}
        onDelete={(u) => setDeleteConfirmUser(u)}
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

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">
            Page {page} of {pages} ({total} total)
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Single User Deletion Confirmation Dialog */}
      <Dialog
        open={Boolean(deleteConfirmUser)}
        onClose={() => setDeleteConfirmUser(null)}
        title="Delete User Account"
      >
        <div className="space-y-4 text-sm">
          <div className="flex items-start gap-3 rounded-xl bg-rose-50 p-3 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-900/60">
            <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs text-rose-700 dark:text-rose-300">
              <p className="font-bold">Permanent Deletion Warning</p>
              <p>
                Are you sure you want to permanently delete{" "}
                <span className="font-semibold text-slate-900 dark:text-white">
                  {deleteConfirmUser?.name}
                </span>{" "}
                ({deleteConfirmUser?.email})?
              </p>
              <p className="text-rose-600 dark:text-rose-400">
                This will delete all associated orders, transactions, delivery reports, and chat logs.
                This action cannot be undone.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmUser(null)}
              disabled={deletingSingle}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeleteConfirm}
              disabled={deletingSingle}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              {deletingSingle ? "Deleting…" : "Yes, Delete User"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Bulk Action Confirmation Dialog */}
      <Dialog
        open={Boolean(bulkActionConfirm)}
        onClose={() => setBulkActionConfirm(null)}
        title={bulkActionConfirm?.title || "Confirm Bulk Action"}
      >
        <div className="space-y-4 text-sm">
          <p className="text-slate-600 dark:text-slate-300 text-xs leading-relaxed">
            {bulkActionConfirm?.description}
          </p>

          {bulkActionConfirm?.isDestructive && (
            <div className="rounded-xl bg-rose-50 p-3 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>This operation affects {selectedIds.length} accounts and cannot be reversed.</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setBulkActionConfirm(null)}
              disabled={bulkProcessing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleExecuteBulkAction}
              disabled={bulkProcessing}
              className={
                bulkActionConfirm?.isDestructive
                  ? "bg-rose-600 text-white hover:bg-rose-700"
                  : "bg-brand-600 text-white hover:bg-brand-700"
              }
            >
              {bulkProcessing ? "Processing…" : "Confirm & Proceed"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Add / Edit User Dialog */}
      <UserFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        user={editing}
        profiles={profiles}
        onSaved={load}
      />

      {/* Manual Credit / Debit Dialog */}
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

