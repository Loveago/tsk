"use client";

import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/shared";
import { Plus, X, Copy, Info } from "lucide-react";

export interface Tier {
  gbAmount: number;
  priceGHS: number;
}

export interface PricingProfile {
  id: string;
  name: string;
  type: string;
  active: boolean;
  isDefault: boolean;
  tiers: Tier[];
  networkTiers?: Record<string, Tier[]>;
  _count: { users: number };
}

const NETWORKS = [
  {
    id: "MTN",
    label: "MTN",
    badge: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-300",
    tabActive: "border-yellow-500 text-yellow-700 dark:text-yellow-400 bg-yellow-50/50 dark:bg-yellow-500/10",
  },
  {
    id: "TELECEL",
    label: "Telecel",
    badge: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300",
    tabActive: "border-red-500 text-red-700 dark:text-red-400 bg-red-50/50 dark:bg-red-500/10",
  },
  {
    id: "AIRTELTIGO",
    label: "AT iShare",
    badge: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300",
    tabActive: "border-blue-500 text-blue-700 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-500/10",
  },
  {
    id: "AIRTELTIGO_BIGTIME",
    label: "AT Big Time",
    badge: "bg-cyan-100 text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-300",
    tabActive: "border-cyan-500 text-cyan-700 dark:text-cyan-400 bg-cyan-50/50 dark:bg-cyan-500/10",
  },
] as const;

type NetworkId = (typeof NETWORKS)[number]["id"];

export function PricingProfileDialog({
  open,
  onClose,
  profile,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  profile: PricingProfile | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState("RESELLER");
  const [active, setActive] = React.useState(true);
  const [activeNetwork, setActiveNetwork] = React.useState<NetworkId>("MTN");
  const [netTiers, setNetTiers] = React.useState<Record<NetworkId, { gb: string; price: string }[]>>({
    MTN: [{ gb: "1", price: "" }],
    TELECEL: [{ gb: "1", price: "" }],
    AIRTELTIGO: [{ gb: "1", price: "" }],
    AIRTELTIGO_BIGTIME: [{ gb: "1", price: "" }],
  });
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName(profile?.name ?? "");
      setType(profile?.type ?? "RESELLER");
      setActive(profile?.active ?? true);
      setActiveNetwork("MTN");

      const defaultMtn = profile
        ? (profile.networkTiers?.MTN
            ? profile.networkTiers.MTN.map((t) => ({ gb: String(t.gbAmount), price: String(t.priceGHS) }))
            : (profile.tiers ?? []).map((t) => ({ gb: String(t.gbAmount), price: String(t.priceGHS) })))
        : [
            { gb: "1", price: "3.0" },
            { gb: "2", price: "5.5" },
            { gb: "5", price: "13.0" },
            { gb: "10", price: "24.0" },
          ];

      const defaultTelecel = profile
        ? (profile.networkTiers?.TELECEL ?? []).map((t) => ({ gb: String(t.gbAmount), price: String(t.priceGHS) }))
        : [
            { gb: "1", price: "2.9" },
            { gb: "2", price: "5.2" },
            { gb: "5", price: "12.5" },
          ];

      const defaultAirtelTigo = profile
        ? (profile.networkTiers?.AIRTELTIGO ?? []).map((t) => ({ gb: String(t.gbAmount), price: String(t.priceGHS) }))
        : [
            { gb: "1", price: "2.8" },
            { gb: "2", price: "5.0" },
            { gb: "5", price: "12.0" },
          ];

      const defaultAirtelTigoBigtime = profile
        ? (profile.networkTiers?.AIRTELTIGO_BIGTIME ?? []).map((t) => ({ gb: String(t.gbAmount), price: String(t.priceGHS) }))
        : [
            { gb: "1", price: "2.8" },
            { gb: "2", price: "5.0" },
            { gb: "5", price: "12.0" },
          ];

      setNetTiers({
        MTN: defaultMtn,
        TELECEL: defaultTelecel,
        AIRTELTIGO: defaultAirtelTigo,
        AIRTELTIGO_BIGTIME: defaultAirtelTigoBigtime,
      });
    }
  }, [open, profile]);

  const copyFromMtn = (targetNet: NetworkId) => {
    const mtnList = netTiers.MTN;
    setNetTiers((prev) => ({
      ...prev,
      [targetNet]: mtnList.map((t) => ({ ...t })),
    }));
    toast(`Copied MTN tiers to ${targetNet}`, "info");
  };

  const currentList = netTiers[activeNetwork] || [];

  const updateTier = (index: number, field: "gb" | "price", val: string) => {
    setNetTiers((prev) => ({
      ...prev,
      [activeNetwork]: prev[activeNetwork].map((item, i) =>
        i === index ? { ...item, [field]: val } : item
      ),
    }));
  };

  const removeTier = (index: number) => {
    setNetTiers((prev) => ({
      ...prev,
      [activeNetwork]: prev[activeNetwork].filter((_, i) => i !== index),
    }));
  };

  const addTier = () => {
    setNetTiers((prev) => ({
      ...prev,
      [activeNetwork]: [...prev[activeNetwork], { gb: "", price: "" }],
    }));
  };

  const save = async () => {
    if (!name.trim()) {
      return toast("Please enter a profile name", "error");
    }

    setSaving(true);
    try {
      const parseAndDeduplicateTiers = (tiers: { gb: string; price: string }[], netLabel: string): Tier[] => {
        const map = new Map<number, number>();
        for (const t of tiers) {
          if (!t.gb.trim() && !t.price.trim()) continue;
          const gbAmount = Number(t.gb);
          const priceGHS = Number(t.price);
          if (isNaN(gbAmount) || gbAmount <= 0) {
            throw new Error(`Invalid GB size "${t.gb}" in ${netLabel}`);
          }
          if (isNaN(priceGHS) || priceGHS < 0) {
            throw new Error(`Invalid price "${t.price}" for ${gbAmount}GB in ${netLabel}`);
          }
          map.set(gbAmount, priceGHS);
        }
        return Array.from(map.entries())
          .map(([gbAmount, priceGHS]) => ({ gbAmount, priceGHS }))
          .sort((a, b) => a.gbAmount - b.gbAmount);
      };

      let formattedNetworkTiers: Record<string, Tier[]>;
      try {
        formattedNetworkTiers = {
          MTN: parseAndDeduplicateTiers(netTiers.MTN, "MTN"),
          TELECEL: parseAndDeduplicateTiers(netTiers.TELECEL, "Telecel"),
          AIRTELTIGO: parseAndDeduplicateTiers(netTiers.AIRTELTIGO, "AirtelTigo"),
        };
      } catch (err: any) {
        return toast(err.message, "error");
      }

      // Base tiers fallback for legacy code
      const fallbackTiers =
        formattedNetworkTiers.MTN.length > 0
          ? formattedNetworkTiers.MTN
          : formattedNetworkTiers.TELECEL.length > 0
          ? formattedNetworkTiers.TELECEL
          : formattedNetworkTiers.AIRTELTIGO;

      if (fallbackTiers.length === 0) {
        return toast("Please configure at least one tier for at least one network", "error");
      }

      const body = {
        name,
        type,
        active,
        tiers: fallbackTiers,
        networkTiers: formattedNetworkTiers,
      };

      const res = await fetch(profile ? `/api/admin/pricing/${profile.id}` : "/api/admin/pricing", {
        method: profile ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) return toast(json.error ?? "Save failed", "error");
      toast(profile ? "Profile updated with distinct network pricing" : "Profile created with distinct network pricing", "success");
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={profile ? `Edit ${profile.name}` : "New Pricing Profile"}
    >
      <div className="space-y-4 text-sm max-h-[80vh] overflow-y-auto pr-1">
        {/* Basic profile details */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Profile name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Reseller Gold Tier"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Profile Type</Label>
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {["RETAIL", "RESELLER", "WHOLESALE", "MANAGER"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Network guidance notice */}
        <div className="flex items-start gap-2 rounded-xl border border-blue-200/60 bg-blue-50/60 p-3 text-xs text-blue-900 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200">
          <Info className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
          <p>
            Each of Ghana&apos;s 3 networks (<strong>MTN</strong>, <strong>Telecel</strong>,{" "}
            <strong>AirtelTigo</strong>) has distinct wholesale costs and bundle sizes. Configure specific
            rates for each network below.
          </p>
        </div>

        {/* Network tabs */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
            <div className="flex space-x-1">
              {NETWORKS.map((n) => {
                const isCurrent = activeNetwork === n.id;
                const tierCount = (netTiers[n.id] || []).filter((t) => t.gb && t.price).length;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => setActiveNetwork(n.id)}
                    className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition-all ${
                      isCurrent
                        ? n.tabActive
                        : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:hover:text-slate-200"
                    }`}
                  >
                    <span>{n.label}</span>
                    <span className="rounded-full bg-slate-200 px-1.5 py-0.2 text-[10px] dark:bg-slate-700">
                      {tierCount}
                    </span>
                  </button>
                );
              })}
            </div>

            {activeNetwork !== "MTN" && (
              <button
                type="button"
                onClick={() => copyFromMtn(activeNetwork)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400"
                title="Copy all MTN rates into this network tab as a quick baseline"
              >
                <Copy className="h-3 w-3" /> Copy MTN rates
              </button>
            )}
          </div>

          {/* Active Network Tiers */}
          <div className="space-y-2 rounded-xl bg-slate-50/70 p-3.5 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {activeNetwork} Rates (GB → GHS)
              </span>
              <span className="text-[11px] text-slate-400">Specify price for each GB amount</span>
            </div>

            {currentList.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">
                No tiers added yet for {activeNetwork}. Click &quot;Add tier&quot; or copy from MTN.
              </p>
            ) : (
              currentList.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Input
                      type="number"
                      min="0.1"
                      step="0.1"
                      placeholder="Size in GB"
                      value={t.gb}
                      onChange={(e) => updateTier(i, "gb", e.target.value)}
                      className="pr-8"
                    />
                    <span className="pointer-events-none absolute right-2.5 top-2.5 text-xs text-slate-400">
                      GB
                    </span>
                  </div>
                  <span className="text-slate-400">→</span>
                  <div className="relative flex-1">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Price in GHS"
                      value={t.price}
                      onChange={(e) => updateTier(i, "price", e.target.value)}
                      className="pl-9"
                    />
                    <span className="pointer-events-none absolute left-2.5 top-2.5 text-xs font-medium text-slate-400">
                      GH₵
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeTier(i)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-red-500 dark:hover:bg-slate-700"
                    aria-label="Remove tier"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}

            <Button size="sm" variant="outline" onClick={addTier} className="w-full mt-2 gap-1 text-xs">
              <Plus className="h-3.5 w-3.5" /> Add {activeNetwork} tier
            </Button>
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-xs font-medium">Profile is active (available for user assignment)</span>
        </label>

        <Button className="w-full" onClick={save} disabled={saving}>
          {saving && <Spinner className="mr-1.5" />} {profile ? "Save Profile Changes" : "Create Pricing Profile"}
        </Button>
      </div>
    </Dialog>
  );
}
