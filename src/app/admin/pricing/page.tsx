"use client";

import * as React from "react";
import { PageHeader, EmptyState, Spinner } from "@/components/shared";
import {
  PricingProfileDialog,
  type PricingProfile,
} from "@/components/admin/pricing-profile-dialog";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { formatGHS } from "@/lib/types";
import {
  Receipt,
  Pencil,
  Trash2,
  Plus,
  Star,
  Signal,
  Layers,
  ArrowRightLeft,
  Check,
  Power,
  RefreshCw,
} from "lucide-react";

interface AdminPackage {
  id: string;
  network: string;
  name: string;
  gbAmount: number;
  description: string | null;
  providerProductId: string | null;
  retailPriceGHS: number | null;
  active: boolean;
  sortOrder: number;
}

const NETWORKS = [
  {
    id: "MTN",
    label: "MTN",
    badge: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-300",
    border: "border-yellow-400/40",
    accent: "text-amber-600 dark:text-amber-400",
    bgLight: "bg-yellow-50/50 dark:bg-yellow-500/5",
  },
  {
    id: "TELECEL",
    label: "Telecel",
    badge: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300",
    border: "border-red-400/40",
    accent: "text-red-600 dark:text-red-400",
    bgLight: "bg-red-50/50 dark:bg-red-500/5",
  },
  {
    id: "AIRTELTIGO",
    label: "AT iShare",
    badge: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300",
    border: "border-blue-400/40",
    accent: "text-blue-600 dark:text-blue-400",
    bgLight: "bg-blue-50/50 dark:bg-blue-500/5",
  },
  {
    id: "AIRTELTIGO_BIGTIME",
    label: "AT Big Time",
    badge: "bg-cyan-100 text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-300",
    border: "border-cyan-400/40",
    accent: "text-cyan-600 dark:text-cyan-400",
    bgLight: "bg-cyan-50/50 dark:bg-cyan-500/5",
  },
] as const;

export default function AdminPricingPage() {
  const { toast } = useToast();
  const [profiles, setProfiles] = React.useState<PricingProfile[]>([]);
  const [packages, setPackages] = React.useState<AdminPackage[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [activeMainTab, setActiveMainTab] = React.useState<"rates" | "profiles">("rates");
  const [activeNetworkFilter, setActiveNetworkFilter] = React.useState<string>("ALL");

  // Profile Dialog
  const [profileDialogOpen, setProfileDialogOpen] = React.useState(false);
  const [editingProfile, setEditingProfile] = React.useState<PricingProfile | null>(null);

  // Quick Package Price Dialog
  const [editingPackage, setEditingPackage] = React.useState<AdminPackage | null>(null);
  const [packagePriceInput, setPackagePriceInput] = React.useState("");
  const [savingPackagePrice, setSavingPackagePrice] = React.useState(false);

  // Per-profile selected network tab preview in cards
  const [profilePreviewNetwork, setProfilePreviewNetwork] = React.useState<Record<string, string>>({});

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [pricingRes, packagesRes] = await Promise.all([
        fetch("/api/admin/pricing"),
        fetch("/api/admin/packages"),
      ]);
      const pricingJson = await pricingRes.json();
      const packagesJson = await packagesRes.json();

      setProfiles(pricingJson.profiles ?? []);
      setPackages(packagesJson.packages ?? []);
    } catch {
      toast("Failed to load pricing data", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const removeProfile = async (p: PricingProfile) => {
    if (p._count.users > 0) {
      return toast(`${p._count.users} user(s) still assigned to this profile`, "error");
    }
    if (!confirm(`Delete pricing profile "${p.name}"?`)) return;
    const res = await fetch(`/api/admin/pricing/${p.id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) return toast(json.error ?? "Delete failed", "error");
    toast("Profile deleted", "success");
    load();
  };

  const openEditPackagePrice = (pkg: AdminPackage) => {
    setEditingPackage(pkg);
    setPackagePriceInput(pkg.retailPriceGHS != null ? String(pkg.retailPriceGHS) : "");
  };

  const savePackagePrice = async () => {
    if (!editingPackage) return;
    setSavingPackagePrice(true);
    try {
      const priceNum = packagePriceInput.trim() === "" ? null : Number(packagePriceInput);
      if (priceNum !== null && (isNaN(priceNum) || priceNum < 0)) {
        return toast("Please enter a valid price in GHS", "error");
      }

      const res = await fetch(`/api/admin/packages/${editingPackage.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editingPackage,
          retailPriceGHS: priceNum,
        }),
      });
      const json = await res.json();
      if (!res.ok) return toast(json.error ?? "Update failed", "error");
      toast(`Updated ${editingPackage.network} ${editingPackage.gbAmount}GB price to ${priceNum != null ? formatGHS(priceNum) : "None"}`, "success");
      setEditingPackage(null);
      load();
    } finally {
      setSavingPackagePrice(false);
    }
  };

  const togglePackageActive = async (pkg: AdminPackage) => {
    try {
      const res = await fetch(`/api/admin/packages/${pkg.id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !pkg.active }),
      });
      const json = await res.json();
      if (!res.ok) return toast(json.error ?? "Failed to toggle package status", "error");
      toast(pkg.active ? `${pkg.name} disabled` : `${pkg.name} enabled`, "success");
      load();
    } catch {
      toast("Failed to toggle package status", "error");
    }
  };

  // Distinct GB amounts across all active packages
  const comparisonSizes = React.useMemo(() => {
    const sizes = new Set<number>();
    packages.forEach((p) => sizes.add(p.gbAmount));
    return Array.from(sizes).sort((a, b) => a - b);
  }, [packages]);

  // Network stats calculation
  const networkStats = React.useMemo(() => {
    return NETWORKS.map((n) => {
      const netPkgs = packages.filter((p) => p.network === n.id);
      const activePkgs = netPkgs.filter((p) => p.active);
      const prices = activePkgs
        .map((p) => p.retailPriceGHS)
        .filter((p): p is number => p != null && p > 0);
      const minPrice = prices.length ? Math.min(...prices) : null;
      const maxPrice = prices.length ? Math.max(...prices) : null;
      const oneGb = netPkgs.find((p) => p.gbAmount === 1);

      return {
        ...n,
        total: netPkgs.length,
        active: activePkgs.length,
        minPrice,
        maxPrice,
        oneGbPrice: oneGb?.retailPriceGHS ?? null,
      };
    });
  }, [packages]);

  // Filtered packages
  const filteredPackages = React.useMemo(() => {
    if (activeNetworkFilter === "ALL") return packages;
    return packages.filter((p) => p.network === activeNetworkFilter);
  }, [packages, activeNetworkFilter]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pricing & Network Rates"
        description="Configure distinct pricing across Ghana's 3 networks (MTN, Telecel, AirtelTigo) and reseller profiles."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} title="Refresh pricing data">
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
            <Button
              onClick={() => {
                setEditingProfile(null);
                setProfileDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" /> New Pricing Profile
            </Button>
          </div>
        }
      />

      {/* 3 Networks Distinct Rates Banner Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {networkStats.map((stat) => (
          <div
            key={stat.id}
            className={`rounded-2xl border p-4 transition-all ${stat.border} ${stat.bgLight} bg-white dark:bg-slate-900/60 shadow-sm`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Signal className={`h-4 w-4 ${stat.accent}`} />
                <h4 className="font-bold text-sm text-slate-900 dark:text-white">{stat.label}</h4>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${stat.badge}`}>
                {stat.active} Active Bundles
              </span>
            </div>

            <div className="mt-3 flex items-baseline justify-between border-t border-slate-100 pt-3 dark:border-slate-800/80">
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">1GB Base Rate</p>
                <p className="text-base font-bold text-slate-900 dark:text-white">
                  {stat.oneGbPrice != null ? formatGHS(stat.oneGbPrice) : "Not set"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Range</p>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {stat.minPrice != null && stat.maxPrice != null
                    ? `${formatGHS(stat.minPrice)} – ${formatGHS(stat.maxPrice)}`
                    : "—"}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Primary Section Switcher */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setActiveMainTab("rates")}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition-all ${
            activeMainTab === "rates"
              ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
              : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          <ArrowRightLeft className="h-4 w-4" /> 3-Network Comparison & Rates
        </button>
        <button
          type="button"
          onClick={() => setActiveMainTab("profiles")}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition-all ${
            activeMainTab === "profiles"
              ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
              : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          <Layers className="h-4 w-4" /> Pricing Profiles ({profiles.length})
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7 text-brand-600" />
        </div>
      ) : activeMainTab === "rates" ? (
        <div className="space-y-6">
          {/* Side-by-side Cross Network Comparison Matrix */}
          <div className="rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-800/40">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    3-Network Price Comparison Matrix
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Compare retail prices side-by-side across MTN, Telecel, and AirtelTigo. Click any price to edit.
                  </p>
                </div>
                <span className="text-xs text-slate-400">
                  {comparisonSizes.length} bundle sizes configured
                </span>
              </div>
            </div>

            {comparisonSizes.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No packages configured yet. Create packages to populate the comparison matrix.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/30 text-left text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-800/20">
                      <th className="px-4 py-3">Bundle Size</th>
                      <th className="px-4 py-3 text-amber-700 dark:text-amber-400">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-yellow-400" /> MTN Price
                        </span>
                      </th>
                      <th className="px-4 py-3 text-red-700 dark:text-red-400">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-red-500" /> Telecel Price
                        </span>
                      </th>
                      <th className="px-4 py-3 text-blue-700 dark:text-blue-400">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-blue-500" /> AirtelTigo Price
                        </span>
                      </th>
                      <th className="px-4 py-3 text-right">Pricing Difference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {comparisonSizes.map((gb) => {
                      const mtnPkg = packages.find((p) => p.network === "MTN" && p.gbAmount === gb);
                      const telecelPkg = packages.find(
                        (p) => p.network === "TELECEL" && p.gbAmount === gb
                      );
                      const atPkg = packages.find(
                        (p) => p.network === "AIRTELTIGO" && p.gbAmount === gb
                      );

                      const rates = [
                        mtnPkg?.retailPriceGHS,
                        telecelPkg?.retailPriceGHS,
                        atPkg?.retailPriceGHS,
                      ].filter((r): r is number => r != null && r > 0);

                      const isDiff = rates.length > 1 && new Set(rates).size > 1;

                      return (
                        <tr key={gb} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50">
                          <td className="px-4 py-3.5 font-bold text-slate-900 dark:text-white">
                            {gb} GB
                          </td>

                          {/* MTN */}
                          <td className="px-4 py-3.5">
                            {mtnPkg ? (
                              <button
                                type="button"
                                onClick={() => openEditPackagePrice(mtnPkg)}
                                className="group inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-800 hover:bg-yellow-50 hover:text-amber-700 dark:text-slate-200 dark:hover:bg-yellow-500/10 dark:hover:text-amber-400 border border-transparent hover:border-yellow-200"
                                title="Click to edit MTN price"
                              >
                                <span>{mtnPkg.retailPriceGHS != null ? formatGHS(mtnPkg.retailPriceGHS) : "—"}</span>
                                <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400" />
                              </button>
                            ) : (
                              <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
                            )}
                          </td>

                          {/* Telecel */}
                          <td className="px-4 py-3.5">
                            {telecelPkg ? (
                              <button
                                type="button"
                                onClick={() => openEditPackagePrice(telecelPkg)}
                                className="group inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-800 hover:bg-red-50 hover:text-red-700 dark:text-slate-200 dark:hover:bg-red-500/10 dark:hover:text-red-400 border border-transparent hover:border-red-200"
                                title="Click to edit Telecel price"
                              >
                                <span>{telecelPkg.retailPriceGHS != null ? formatGHS(telecelPkg.retailPriceGHS) : "—"}</span>
                                <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400" />
                              </button>
                            ) : (
                              <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
                            )}
                          </td>

                          {/* AirtelTigo */}
                          <td className="px-4 py-3.5">
                            {atPkg ? (
                              <button
                                type="button"
                                onClick={() => openEditPackagePrice(atPkg)}
                                className="group inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-800 hover:bg-blue-50 hover:text-blue-700 dark:text-slate-200 dark:hover:bg-blue-500/10 dark:hover:text-blue-400 border border-transparent hover:border-blue-200"
                                title="Click to edit AirtelTigo price"
                              >
                                <span>{atPkg.retailPriceGHS != null ? formatGHS(atPkg.retailPriceGHS) : "—"}</span>
                                <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400" />
                              </button>
                            ) : (
                              <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
                            )}
                          </td>

                          {/* Status / Difference */}
                          <td className="px-4 py-3.5 text-right">
                            {isDiff ? (
                              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                                Distinct Rates
                              </span>
                            ) : rates.length > 1 ? (
                              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                Flat Rates
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">Single Network</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Network-specific Package Table with Quick Editing */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Network Packages & Retail Prices
              </h3>

              {/* Filter by Network */}
              <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-xl dark:bg-slate-800/80">
                <button
                  type="button"
                  onClick={() => setActiveNetworkFilter("ALL")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                    activeNetworkFilter === "ALL"
                      ? "bg-white shadow text-slate-900 dark:bg-slate-700 dark:text-white"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  All Networks ({packages.length})
                </button>
                {NETWORKS.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => setActiveNetworkFilter(n.id)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                      activeNetworkFilter === n.id
                        ? "bg-white shadow text-slate-900 dark:bg-slate-700 dark:text-white"
                        : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    }`}
                  >
                    {n.label} ({packages.filter((p) => p.network === n.id).length})
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500 dark:border-slate-800">
                      <th className="px-4 py-3">Package Name</th>
                      <th className="px-4 py-3">Network</th>
                      <th className="px-4 py-3">Data Size</th>
                      <th className="px-4 py-3">Retail Price (GHS)</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredPackages.map((pkg) => {
                      const netMeta = NETWORKS.find((n) => n.id === pkg.network);
                      return (
                        <tr key={pkg.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50">
                          <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                            {pkg.name}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${netMeta?.badge}`}>
                              {pkg.network}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-semibold">{pkg.gbAmount} GB</td>
                          <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">
                            {pkg.retailPriceGHS != null ? formatGHS(pkg.retailPriceGHS) : "Not configured"}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                pkg.active
                                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                                  : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                              }`}
                            >
                              {pkg.active ? "ACTIVE" : "INACTIVE"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openEditPackagePrice(pkg)}
                                className="h-8 gap-1 text-xs"
                              >
                                <Pencil className="h-3 w-3" /> Edit Price
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => togglePackageActive(pkg)}
                                className="h-8 gap-1 text-xs"
                                title={pkg.active ? "Deactivate package" : "Activate package"}
                              >
                                <Power className={`h-3 w-3 ${pkg.active ? "text-emerald-600" : "text-slate-400"}`} />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Profiles View with 3-Network Awareness */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Pricing profiles allow configuring custom tiered data rates for Resellers and Wholesale accounts across each of the 3 networks.
            </p>
          </div>

          {profiles.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No pricing profiles"
              description="Create one to assign to resellers or wholesale accounts."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {profiles.map((p) => {
                const curNet = profilePreviewNetwork[p.id] || "MTN";
                const netTiers = p.networkTiers?.[curNet] ?? p.tiers ?? [];

                return (
                  <div
                    key={p.id}
                    className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-sm flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-slate-900 dark:text-white">{p.name}</h3>
                            {p.isDefault && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                                <Star className="h-3 w-3" /> Default
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {p.type} · {p._count.users} user{p._count.users === 1 ? "" : "s"} ·{" "}
                            {p.active ? (
                              <span className="text-emerald-600 dark:text-emerald-400">Active</span>
                            ) : (
                              <span className="text-slate-400">Inactive</span>
                            )}
                          </p>
                        </div>
                        <div className="flex gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingProfile(p);
                              setProfileDialogOpen(true);
                            }}
                            title="Edit profile & rates"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => removeProfile(p)} title="Delete profile">
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                          </Button>
                        </div>
                      </div>

                      {/* Network Switcher on the Card */}
                      <div className="mt-4 flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                        <div className="flex space-x-1">
                          {NETWORKS.map((n) => {
                            const isSelected = curNet === n.id;
                            const count = (p.networkTiers?.[n.id] || []).length;
                            return (
                              <button
                                key={n.id}
                                type="button"
                                onClick={() =>
                                  setProfilePreviewNetwork((prev) => ({ ...prev, [p.id]: n.id }))
                                }
                                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                                  isSelected
                                    ? n.badge
                                    : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                }`}
                              >
                                {n.label} {count > 0 ? `(${count})` : ""}
                              </button>
                            );
                          })}
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {curNet} Rates
                        </span>
                      </div>

                      {/* Tiers for the selected network */}
                      <div className="mt-3">
                        {netTiers.length === 0 ? (
                          <p className="py-4 text-center text-xs text-slate-400">
                            No distinct tiers set for {curNet} (falls back to default package retail).
                          </p>
                        ) : (
                          <div className="grid grid-cols-3 gap-2 text-xs sm:grid-cols-4">
                            {netTiers.map((t) => (
                              <div
                                key={`${t.gbAmount}-${t.priceGHS}`}
                                className="rounded-xl bg-slate-50 px-2.5 py-2 text-center dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800"
                              >
                                <p className="font-semibold text-slate-900 dark:text-white">{t.gbAmount}GB</p>
                                <p className="text-slate-500 dark:text-slate-400">{formatGHS(t.priceGHS)}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Edit Pricing Profile Dialog */}
      <PricingProfileDialog
        open={profileDialogOpen}
        onClose={() => setProfileDialogOpen(false)}
        profile={editingProfile}
        onSaved={load}
      />

      {/* Quick Edit Package Price Dialog */}
      <Dialog
        open={!!editingPackage}
        onClose={() => setEditingPackage(null)}
        title={editingPackage ? `Edit Price: ${editingPackage.network} ${editingPackage.gbAmount}GB` : "Edit Price"}
      >
        <div className="space-y-4 text-sm">
          <p className="text-xs text-slate-500">
            Update the retail price for <strong>{editingPackage?.name}</strong>. This rate applies to all users on standard retail pricing.
          </p>

          <div className="space-y-1.5">
            <Label>Retail Price (GH₵)</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-2.5 text-xs font-semibold text-slate-400">
                GH₵
              </span>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 3.50"
                value={packagePriceInput}
                onChange={(e) => setPackagePriceInput(e.target.value)}
                className="pl-10 text-base font-bold"
                autoFocus
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditingPackage(null)} disabled={savingPackagePrice}>
              Cancel
            </Button>
            <Button onClick={savePackagePrice} disabled={savingPackagePrice}>
              {savingPackagePrice && <Spinner className="mr-1.5" />} Save Price
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
