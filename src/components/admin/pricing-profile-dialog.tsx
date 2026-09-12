"use client";

import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/shared";
import { Plus, X } from "lucide-react";

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
  _count: { users: number };
}

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
  const [tiers, setTiers] = React.useState<{ gb: string; price: string }[]>([{ gb: "1", price: "" }]);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName(profile?.name ?? "");
      setType(profile?.type ?? "RESELLER");
      setActive(profile?.active ?? true);
      setTiers(
        profile?.tiers.length
          ? profile.tiers.map((t) => ({ gb: String(t.gbAmount), price: String(t.priceGHS) }))
          : [{ gb: "1", price: "" }]
      );
    }
  }, [open, profile]);

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        name,
        type,
        active,
        tiers: tiers
          .filter((t) => t.gb !== "" && t.price !== "")
          .map((t) => ({ gbAmount: Number(t.gb), priceGHS: Number(t.price) })),
      };
      const res = await fetch(profile ? `/api/admin/pricing/${profile.id}` : "/api/admin/pricing", {
        method: profile ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) return toast(json.error ?? "Save failed", "error");
      toast(profile ? "Profile updated" : "Profile created", "success");
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={profile ? `Edit ${profile.name}` : "New pricing profile"}>
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Profile name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Reseller Tier A" />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {["RETAIL", "RESELLER", "WHOLESALE", "MANAGER"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Price tiers (GB → GHS)</Label>
          {tiers.map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                type="number"
                min="0.1"
                step="0.1"
                placeholder="GB"
                value={t.gb}
                onChange={(e) =>
                  setTiers((prev) => prev.map((x, j) => (j === i ? { ...x, gb: e.target.value } : x)))
                }
              />
              <span className="text-slate-400">→</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="GHS"
                value={t.price}
                onChange={(e) =>
                  setTiers((prev) => prev.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))
                }
              />
              <button
                onClick={() => setTiers((prev) => prev.filter((_, j) => j !== i))}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Remove tier"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setTiers((prev) => [...prev, { gb: "", price: "" }])}
          >
            <Plus className="h-3.5 w-3.5" /> Add tier
          </Button>
        </div>

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <span>Active</span>
        </label>

        <Button className="w-full" onClick={save} disabled={saving}>
          {saving && <Spinner />} {profile ? "Save changes" : "Create profile"}
        </Button>
      </div>
    </Dialog>
  );
}
