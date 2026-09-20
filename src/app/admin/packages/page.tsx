"use client";

import * as React from "react";
import { PageHeader, EmptyState, Spinner } from "@/components/shared";
import { PackageFormDialog, type AdminPackage } from "@/components/admin/package-form-dialog";
import { PackageTable } from "@/components/admin/package-table";
import { Button } from "@/components/ui/button";
import { ScrollableTabs } from "@/components/ui/scrollable-tabs";
import { useToast } from "@/components/toast";
import Link from "next/link";
import { Package, Pencil, Trash2, Plus, Receipt } from "lucide-react";

const DEFAULT_NETWORKS = ["MTN", "TELECEL", "AIRTELTIGO", "AIRTELTIGO_BIGTIME"];

export default function AdminPackagesPage() {
  const { toast } = useToast();
  const [packages, setPackages] = React.useState<AdminPackage[]>([]);
  const [network, setNetwork] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AdminPackage | null>(null);
  const [customCategories, setCustomCategories] = React.useState<string[]>([]);

  const load = React.useCallback(async () => {
    setLoading(true);
    const [pkgRes, setRes] = await Promise.all([
      fetch("/api/admin/packages"),
      fetch("/api/admin/settings"),
    ]);
    const pkgJson = await pkgRes.json();
    const setJson = await setRes.json();
    setPackages(pkgJson.packages ?? []);
    if (setJson.settings?.custom_package_categories) {
      try {
        const parsed = JSON.parse(setJson.settings.custom_package_categories);
        if (Array.isArray(parsed)) setCustomCategories(parsed);
      } catch {}
    }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const allCategories = React.useMemo(() => {
    const set = new Set([...DEFAULT_NETWORKS, ...customCategories]);
    for (const p of packages) {
      if (p.network) set.add(p.network);
    }
    return Array.from(set);
  }, [customCategories, packages]);

  const remove = async (pkgOrId: AdminPackage | string) => {
    const id = typeof pkgOrId === "object" ? pkgOrId.id : pkgOrId;
    if (!confirm("Are you sure you want to delete this package?")) return;
    const res = await fetch(`/api/admin/packages/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json();
      return toast(j.error ?? "Delete failed", "error");
    }
    toast("Package deleted", "success");
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

  const filtered = React.useMemo(() => {
    const list = network ? packages.filter((p) => p.network === network) : packages;
    return [...list].sort((a, b) => {
      if (!network && a.network !== b.network) {
        return a.network.localeCompare(b.network);
      }
      return a.gbAmount - b.gbAmount;
    });
  }, [packages, network]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Packages"
        description="Manage the data bundle catalogue"
        actions={
          <div className="flex items-center gap-2">
            <Link href="/admin/pricing">
              <Button variant="outline">
                <Receipt className="h-4 w-4 mr-1.5" /> Pricing Matrix
              </Button>
            </Link>
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" /> Add package
            </Button>
          </div>
        }
      />

      <ScrollableTabs
        tabs={[
          { key: "", label: "All Networks", badge: packages.length },
          ...allCategories.map((n) => ({
            key: n,
            label: n === "AIRTELTIGO" ? "AT iShare" : n === "AIRTELTIGO_BIGTIME" ? "AT Big Time" : n,
            badge: packages.filter((p) => p.network === n).length,
          })),
        ]}
        activeTab={network}
        onChange={setNetwork}
      />

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
        categories={allCategories}
      />
    </div>
  );
}
