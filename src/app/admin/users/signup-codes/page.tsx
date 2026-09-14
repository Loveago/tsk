"use client";

import * as React from "react";
import { PageHeader, StatCard, EmptyState, Spinner } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/toast";
import { formatDateTime } from "@/lib/types";
import {
  Ticket,
  Plus,
  Layers,
  Download,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Trash2,
  Ban,
  Check,
  Eye,
  Settings,
} from "lucide-react";

interface SignupCodeItem {
  id: string;
  code: string;
  status: string;
  maxUses: number | null;
  usageCount: number;
  expiresAt: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  _count: { usages: number };
}

interface Analytics {
  totalCodes: number;
  activeCodes: number;
  expiredCodes: number;
  exhaustedCodes: number;
  totalRegistrations: number;
}

interface CodeUsage {
  id: string;
  usedAt: string;
  ipAddress: string | null;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    balance: number;
    createdAt: string;
  };
}

export default function AdminSignupCodesPage() {
  const { toast } = useToast();
  const [data, setData] = React.useState<SignupCodeItem[]>([]);
  const [analytics, setAnalytics] = React.useState<Analytics>({
    totalCodes: 0,
    activeCodes: 0,
    expiredCodes: 0,
    exhaustedCodes: 0,
    totalRegistrations: 0,
  });
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [pages, setPages] = React.useState(1);
  const [status, setStatus] = React.useState("");
  const [q, setQ] = React.useState("");
  const [loading, setLoading] = React.useState(true);

  // Global mode
  const [mode, setMode] = React.useState<"DISABLED" | "OPTIONAL" | "REQUIRED">("OPTIONAL");
  const [savingMode, setSavingMode] = React.useState(false);

  // Dialogs
  const [createOpen, setCreateOpen] = React.useState(false);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [usagesOpen, setUsagesOpen] = React.useState(false);
  const [activeCodeForUsages, setActiveCodeForUsages] = React.useState<string | null>(null);
  const [usages, setUsages] = React.useState<CodeUsage[]>([]);
  const [loadingUsages, setLoadingUsages] = React.useState(false);

  // Create form state
  const [newCode, setNewCode] = React.useState("");
  const [newMaxUses, setNewMaxUses] = React.useState("");
  const [newExpiresAt, setNewExpiresAt] = React.useState("");
  const [newNotes, setNewNotes] = React.useState("");
  const [savingCreate, setSavingCreate] = React.useState(false);

  // Bulk form state
  const [bulkQuantity, setBulkQuantity] = React.useState("50");
  const [bulkPrefix, setBulkPrefix] = React.useState("CLICK");
  const [bulkLength, setBulkLength] = React.useState("8");
  const [bulkMaxUses, setBulkMaxUses] = React.useState("1");
  const [bulkExpiresAt, setBulkExpiresAt] = React.useState("");
  const [bulkNotes, setBulkNotes] = React.useState("");
  const [savingBulk, setSavingBulk] = React.useState(false);

  const loadMode = React.useCallback(async () => {
    try {
      const res = await fetch("/api/admin/signup-codes/settings");
      const json = await res.json();
      if (json.mode) setMode(json.mode);
    } catch {}
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (status) params.set("status", status);
    if (q.trim()) params.set("q", q.trim());

    try {
      const res = await fetch(`/api/admin/signup-codes?${params}`);
      const json = await res.json();
      setData(json.data ?? []);
      setTotal(json.total ?? 0);
      setPages(json.pages ?? 1);
      if (json.analytics) setAnalytics(json.analytics);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [page, status, q]);

  React.useEffect(() => {
    loadMode();
  }, [loadMode]);

  React.useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const handleUpdateMode = async (newMode: "DISABLED" | "OPTIONAL" | "REQUIRED") => {
    setSavingMode(true);
    try {
      const res = await fetch("/api/admin/signup-codes/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: newMode }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? "Failed to change mode", "error");
        return;
      }
      setMode(json.mode);
      toast(`Signup code requirement set to ${json.mode}`, "success");
    } catch {
      toast("Error updating signup code requirement", "error");
    } finally {
      setSavingMode(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.trim()) return toast("Enter a code", "error");

    setSavingCreate(true);
    try {
      const res = await fetch("/api/admin/signup-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: newCode.trim(),
          maxUses: newMaxUses ? Number(newMaxUses) : null,
          expiresAt: newExpiresAt ? new Date(newExpiresAt).toISOString() : null,
          notes: newNotes.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? "Failed to create code", "error");
        return;
      }

      toast(`Code "${json.code.code}" created successfully`, "success");
      setCreateOpen(false);
      setNewCode("");
      setNewMaxUses("");
      setNewExpiresAt("");
      setNewNotes("");
      load();
    } catch {
      toast("Error creating signup code", "error");
    } finally {
      setSavingCreate(false);
    }
  };

  const handleBulkGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBulk(true);
    try {
      const res = await fetch("/api/admin/signup-codes/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantity: Number(bulkQuantity),
          prefix: bulkPrefix.trim(),
          length: Number(bulkLength),
          maxUses: bulkMaxUses ? Number(bulkMaxUses) : null,
          expiresAt: bulkExpiresAt ? new Date(bulkExpiresAt).toISOString() : null,
          notes: bulkNotes.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? "Failed to generate codes", "error");
        return;
      }

      toast(`Successfully generated ${json.count} unique signup codes`, "success");
      setBulkOpen(false);
      load();
    } catch {
      toast("Error bulk generating codes", "error");
    } finally {
      setSavingBulk(false);
    }
  };

  const handleToggleStatus = async (item: SignupCodeItem) => {
    const nextStatus = item.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    try {
      const res = await fetch(`/api/admin/signup-codes/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        toast("Failed to update status", "error");
        return;
      }
      toast(`Code ${item.code} is now ${nextStatus}`, "success");
      load();
    } catch {
      toast("Error updating status", "error");
    }
  };

  const handleDelete = async (item: SignupCodeItem) => {
    if (!confirm(`Delete signup code ${item.code}?`)) return;
    try {
      const res = await fetch(`/api/admin/signup-codes/${item.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast("Failed to delete code", "error");
        return;
      }
      toast(`Code ${item.code} deleted`, "info");
      load();
    } catch {
      toast("Error deleting code", "error");
    }
  };

  const openUsages = async (item: SignupCodeItem) => {
    setActiveCodeForUsages(item.code);
    setUsagesOpen(true);
    setLoadingUsages(true);
    try {
      const res = await fetch(`/api/admin/signup-codes/${item.id}/usages`);
      const json = await res.json();
      setUsages(json.usages ?? []);
    } catch {
      setUsages([]);
    } finally {
      setLoadingUsages(false);
    }
  };

  const exportCodesCsv = () => {
    if (data.length === 0) return toast("No codes to export", "info");
    const headers = ["Code", "Status", "Usage Count", "Max Uses", "Remaining", "Expires At", "Created At", "Notes"];
    const rows = data.map((c) => {
      const remaining = c.maxUses !== null ? Math.max(0, c.maxUses - c.usageCount) : "Unlimited";
      return [
        c.code,
        c.status,
        c.usageCount,
        c.maxUses ?? "Unlimited",
        remaining,
        c.expiresAt ? new Date(c.expiresAt).toISOString() : "None",
        new Date(c.createdAt).toISOString(),
        `"${(c.notes ?? "").replace(/"/g, '""')}"`,
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `signup-codes-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Signup Codes"
        description="Manage invitation & referral signup codes and registration requirements"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={exportCodesCsv}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            <Button variant="outline" onClick={() => setBulkOpen(true)}>
              <Layers className="h-4 w-4" /> Bulk Generate
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Create Code
            </Button>
          </div>
        }
      />

      {/* Global Signup Requirement Setting Banner */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-[#0d1526]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold text-brand-600 dark:text-brand-400 uppercase tracking-wider flex items-center gap-1.5">
              <Settings className="h-3.5 w-3.5" /> Registration Policy
            </span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
              Signup Code Requirement
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Controls whether new users need a code to register on Tskconnect. Changes apply immediately.
            </p>
          </div>

          <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 p-1 dark:border-white/10 bg-slate-50 dark:bg-white/5">
            {(["DISABLED", "OPTIONAL", "REQUIRED"] as const).map((m) => (
              <button
                key={m}
                type="button"
                disabled={savingMode}
                onClick={() => handleUpdateMode(m)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  mode === m
                    ? "bg-brand-600 text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Analytics Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard title="Total Codes" value={String(analytics.totalCodes)} icon={Ticket} />
        <StatCard title="Active Codes" value={String(analytics.activeCodes)} icon={CheckCircle2} />
        <StatCard title="Expired" value={String(analytics.expiredCodes)} icon={Clock} />
        <StatCard title="Exhausted" value={String(analytics.exhaustedCodes)} icon={Ban} />
        <StatCard title="Code Registrations" value={String(analytics.totalRegistrations)} icon={Users} />
      </div>

      {/* Search & Filter */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">Filter by Status</Label>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All Statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="DISABLED">DISABLED</option>
            <option value="EXHAUSTED">EXHAUSTED</option>
            <option value="EXPIRED">EXPIRED</option>
          </Select>
        </div>

        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Search Code / Notes</Label>
          <Input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Search code e.g. WELCOME2026 or notes..."
          />
        </div>
      </div>

      {/* Codes Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-white/5 dark:bg-[#0d1526]">
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner className="h-6 w-6 text-brand-600" />
          </div>
        ) : data.length === 0 ? (
          <EmptyState
            icon={Ticket}
            title="No signup codes found"
            description="Create or bulk generate signup codes for registration."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/50 text-xs text-slate-500 dark:border-white/5 dark:bg-white/[0.02]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Code</th>
                  <th className="px-4 py-3 font-semibold">Uses / Limit</th>
                  <th className="px-4 py-3 font-semibold">Remaining</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Expiration</th>
                  <th className="px-4 py-3 font-semibold">Notes</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {data.map((item) => {
                  const remaining = item.maxUses !== null ? Math.max(0, item.maxUses - item.usageCount) : "∞";
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-white/[0.02]">
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-brand-600 dark:text-brand-400 text-sm">
                          {item.code}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs font-medium">
                        {item.usageCount} / {item.maxUses ?? "Unlimited"}
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold">
                        {remaining}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            item.status === "ACTIVE"
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                              : item.status === "EXHAUSTED"
                              ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
                              : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {item.expiresAt ? formatDateTime(item.expiresAt) : "Never"}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 max-w-[150px] truncate" title={item.notes ?? ""}>
                        {item.notes ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {formatDateTime(item.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openUsages(item)}
                            className="h-7 text-xs"
                            title="View registered users"
                          >
                            <Users className="h-3 w-3" /> ({item.usageCount})
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleToggleStatus(item)}
                            className="h-7 text-xs"
                            title={item.status === "ACTIVE" ? "Disable code" : "Enable code"}
                          >
                            {item.status === "ACTIVE" ? <Ban className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDelete(item)}
                            className="h-7 text-xs text-red-600 hover:bg-red-50"
                            title="Delete code"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs dark:border-white/5">
            <span className="text-slate-500">
              Page {page} of {pages} ({total} codes)
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
      </div>

      {/* Single Code Creation Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Create Signup Code">
        <form onSubmit={handleCreate} className="space-y-4 text-sm">
          <div className="space-y-1.5">
            <Label htmlFor="codeStr">Code *</Label>
            <Input
              id="codeStr"
              placeholder="e.g. WELCOME2026"
              className="uppercase font-mono font-bold"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              required
            />
            <p className="text-[11px] text-slate-500">Case-insensitive. Automatically converted to uppercase.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="maxUses">Maximum Uses (Optional)</Label>
            <Input
              id="maxUses"
              type="number"
              min="1"
              placeholder="Leave blank for unlimited"
              value={newMaxUses}
              onChange={(e) => setNewMaxUses(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="expiresAt">Expiration Date (Optional)</Label>
            <Input
              id="expiresAt"
              type="datetime-local"
              value={newExpiresAt}
              onChange={(e) => setNewExpiresAt(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes / Purpose</Label>
            <Input
              id="notes"
              placeholder="e.g. Promo campaign Q4"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={savingCreate}>
              {savingCreate && <Spinner />} Create Code
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Bulk Generator Dialog */}
      <Dialog open={bulkOpen} onClose={() => setBulkOpen(false)} title="Bulk Generate Signup Codes">
        <form onSubmit={handleBulkGenerate} className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bQuantity">Quantity *</Label>
              <Input
                id="bQuantity"
                type="number"
                min="1"
                max="500"
                value={bulkQuantity}
                onChange={(e) => setBulkQuantity(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bPrefix">Prefix</Label>
              <Input
                id="bPrefix"
                className="uppercase font-mono"
                placeholder="CLICK"
                value={bulkPrefix}
                onChange={(e) => setBulkPrefix(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bLength">Random Code Length</Label>
              <Input
                id="bLength"
                type="number"
                min="4"
                max="16"
                value={bulkLength}
                onChange={(e) => setBulkLength(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bMaxUses">Max Uses Per Code</Label>
              <Input
                id="bMaxUses"
                type="number"
                min="1"
                placeholder="1 (single use)"
                value={bulkMaxUses}
                onChange={(e) => setBulkMaxUses(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bExpires">Expiration Date (Optional)</Label>
            <Input
              id="bExpires"
              type="datetime-local"
              value={bulkExpiresAt}
              onChange={(e) => setBulkExpiresAt(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bNotes">Notes</Label>
            <Input
              id="bNotes"
              placeholder="e.g. University campus distribution batch"
              value={bulkNotes}
              onChange={(e) => setBulkNotes(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setBulkOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={savingBulk}>
              {savingBulk && <Spinner />} Generate Codes
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Code Usages Dialog */}
      <Dialog
        open={usagesOpen}
        onClose={() => setUsagesOpen(false)}
        title={`Registrations using ${activeCodeForUsages ?? ""}`}
      >
        <div className="space-y-4 text-sm max-h-[70vh] overflow-y-auto pr-1">
          {loadingUsages ? (
            <div className="flex justify-center py-10">
              <Spinner className="h-6 w-6 text-brand-600" />
            </div>
          ) : usages.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No registrations yet"
              description="No user has registered using this code yet."
            />
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {usages.map((u) => (
                <div key={u.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-semibold text-slate-800 dark:text-slate-200">{u.user.name}</p>
                    <p className="text-slate-500">{u.user.email}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400 block">{formatDateTime(u.usedAt)}</span>
                    <span className="text-[10px] rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5">
                      {u.user.role}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
}

