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
  const [networkSettings, setNetworkSettings] = React.useState({
    mtn: true,
    telecel: true,
    airteltigo: true,
  });
  const [togglingNetwork, setTogglingNetwork] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const [pkgRes, setRes] = await Promise.all([
      fetch("/api/admin/packages"),
      fetch("/api/admin/settings"),
    ]);
    const pkgJson = await pkgRes.json();
    const setJson = await setRes.json();
    setPackages(pkgJson.packages ?? []);
    if (setJson.settings) {
      setNetworkSettings({
        mtn: setJson.settings.network_mtn_enabled !== "false",
        telecel: setJson.settings.network_telecel_enabled !== "false",
        airteltigo: setJson.settings.network_airteltigo_enabled !== "false",
      });
      if (setJson.settings.custom_package_categories) {
        try {
          const parsed = JSON.parse(setJson.settings.custom_package_categories);
          if (Array.isArray(parsed)) setCustomCategories(parsed);
        } catch {}
      }
    }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const toggleNetwork = async (net: "mtn" | "telecel" | "airteltigo") => {
    const keyMap = {
      mtn: "network_mtn_enabled",
      telecel: "network_telecel_enabled",
      airteltigo: "network_airteltigo_enabled",
    };
    const currentVal = networkSettings[net];
    const nextVal = !currentVal;
    const settingKey = keyMap[net];

    setTogglingNetwork(net);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [settingKey]: nextVal ? "true" : "false" }),
      });
      if (!res.ok) throw new Error("Failed to update network setting");
      setNetworkSettings((prev) => ({ ...prev, [net]: nextVal }));
      toast(
        nextVal
          ? `${net.toUpperCase()} ordering enabled`
          : `${net.toUpperCase()} ordering paused across all stores, API, and dashboards`,
        "success"
      );
    } catch {
      toast(`Failed to update ${net.toUpperCase()} status`, "error");
    } finally {
      setTogglingNetwork(null);
    }
  };

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
        title="Packages & Products"
        description="Manage the data bundle catalogue, individual bundle availability, and network pause switches"
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

      {/* Network Operational Controls Card */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#0d1526]">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Network Availability Controls</h2>
            <p className="text-xs text-slate-500">
              Instantly enable or pause ordering for an entire network across API, Dashboards, and Storefronts.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* MTN Toggle */}
          <div
            className={`flex items-center justify-between rounded-xl border p-3.5 transition-all ${
              networkSettings.mtn
                ? "border-amber-200 bg-amber-50/60 dark:border-amber-500/20 dark:bg-amber-500/5"
                : "border-red-200 bg-red-50/70 dark:border-red-500/20 dark:bg-red-500/10"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400 text-xs font-black text-slate-950 shadow-xs">
                MTN
              </span>
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">MTN Network</p>
                <p className={`text-[11px] font-semibold ${networkSettings.mtn ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                  {networkSettings.mtn ? "● Active" : "■ Paused"}
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={togglingNetwork === "mtn"}
              onClick={() => toggleNetwork("mtn")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all shadow-xs ${
                networkSettings.mtn
                  ? "bg-amber-600 text-white hover:bg-amber-700"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              } disabled:opacity-50`}
            >
              {togglingNetwork === "mtn" ? "Saving..." : networkSettings.mtn ? "Pause Network" : "Enable Network"}
            </button>
          </div>

          {/* Telecel Toggle */}
          <div
            className={`flex items-center justify-between rounded-xl border p-3.5 transition-all ${
              networkSettings.telecel
                ? "border-red-200 bg-red-50/50 dark:border-red-500/20 dark:bg-red-500/5"
                : "border-red-200 bg-red-50/70 dark:border-red-500/20 dark:bg-red-500/10"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-xs font-black text-white shadow-xs">
                TEL
              </span>
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">Telecel Network</p>
                <p className={`text-[11px] font-semibold ${networkSettings.telecel ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                  {networkSettings.telecel ? "● Active" : "■ Paused"}
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={togglingNetwork === "telecel"}
              onClick={() => toggleNetwork("telecel")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all shadow-xs ${
                networkSettings.telecel
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              } disabled:opacity-50`}
            >
              {togglingNetwork === "telecel" ? "Saving..." : networkSettings.telecel ? "Pause Network" : "Enable Network"}
            </button>
          </div>

          {/* AirtelTigo Toggle */}
          <div
            className={`flex items-center justify-between rounded-xl border p-3.5 transition-all ${
              networkSettings.airteltigo
                ? "border-blue-200 bg-blue-50/50 dark:border-blue-500/20 dark:bg-blue-500/5"
                : "border-red-200 bg-red-50/70 dark:border-red-500/20 dark:bg-red-500/10"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-xs font-black text-white shadow-xs">
                AT
              </span>
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">AirtelTigo Network</p>
                <p className={`text-[11px] font-semibold ${networkSettings.airteltigo ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                  {networkSettings.airteltigo ? "● Active" : "■ Paused"}
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={togglingNetwork === "airteltigo"}
              onClick={() => toggleNetwork("airteltigo")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all shadow-xs ${
                networkSettings.airteltigo
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              } disabled:opacity-50`}
            >
              {togglingNetwork === "airteltigo" ? "Saving..." : networkSettings.airteltigo ? "Pause Network" : "Enable Network"}
            </button>
          </div>
        </div>
      </div>

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
