"use client";

import * as React from "react";
import { PageHeader, EmptyState, Spinner } from "@/components/shared";
import { PackageFormDialog, type AdminPackage } from "@/components/admin/package-form-dialog";
import { PackageTable } from "@/components/admin/package-table";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { formatGHS } from "@/lib/types";
import { Package, Pencil, Trash2, Plus } from "lucide-react";

const NETWORKS = ["MTN", "TELECEL", "AIRTELTIGO"];

export default function AdminPackagesPage() {
  const { toast } = useToast();
  const [packages, setPackages] = React.useState<AdminPackage[]>([]);
  const [network, setNetwork] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AdminPackage | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/packages");
    const json = await res.json();
    setPackages(json.packages ?? []);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const remove = async (pkg: AdminPackage) => {
    if (!confirm(`Delete "${pkg.name}"? Packages with orders are deactivated instead.`)) return;
    const res = await fetch(`/api/admin/packages/${pkg.id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) return toast(json.error ?? "Delete failed", "error");
    toast(json.deactivated ? "Package deactivated (has orders)" : "Package deleted", "success");
    load();
  };

  const toggle = async (pkg: AdminPackage) => {
    const res = await fetch(`/api/admin/packages/${pkg.id}/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !pkg.active }),
    });
    const json = await res.json();
    if (!res.ok) return toast(json.error ?? "Update failed", "error");
    toast(json.unchanged ? "No change" : pkg.active ? `${pkg.name} disabled — hidden from users` : `${pkg.name} enabled`, "success");
    load();
  };

  const filtered = network ? packages.filter((p) => p.network === network) : packages;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Packages"
        description="Manage the data bundle catalogue"
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Add package
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setNetwork("")}
          className={`rounded-full px-3 py-1.5 text-xs font-medium ${
            network === "" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
          }`}
        >
          All ({packages.length})
        </button>
        {NETWORKS.map((n) => (
          <button
            key={n}
            onClick={() => setNetwork(n)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              network === n ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            {n} ({packages.filter((p) => p.network === n).length})
          </button>
        ))}
      </div>

      <PackageTable
        packages={filtered}
        loading={loading}
        onEdit={(p) => {
          setEditing(p);
          setDialogOpen(true);
        }}
        onDelete={remove}
        onToggle={toggle}
      />

      <PackageFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        pkg={editing}
        onSaved={load}
      />
    </div>
  );
}
