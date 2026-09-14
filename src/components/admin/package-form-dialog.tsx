"use client";

import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/shared";

export interface AdminPackage {
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

const DEFAULT_NETWORKS = ["MTN", "TELECEL", "AIRTELTIGO"];

export function PackageFormDialog({
  open,
  onClose,
  pkg,
  onSaved,
  categories = DEFAULT_NETWORKS,
}: {
  open: boolean;
  onClose: () => void;
  pkg: AdminPackage | null;
  onSaved: () => void;
  categories?: string[];
}) {
  const { toast } = useToast();
  const [network, setNetwork] = React.useState("MTN");
  const [customNetwork, setCustomNetwork] = React.useState("");
  const [isCustomNetwork, setIsCustomNetwork] = React.useState(false);
  const [name, setName] = React.useState("");
  const [gb, setGb] = React.useState("1");
  const [description, setDescription] = React.useState("");
  const [productId, setProductId] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [active, setActive] = React.useState(true);
  const [sortOrder, setSortOrder] = React.useState("0");
  const [saving, setSaving] = React.useState(false);

  const availableCategories = React.useMemo(() => {
    const set = new Set([...DEFAULT_NETWORKS, ...categories]);
    if (pkg?.network) set.add(pkg.network);
    return Array.from(set);
  }, [categories, pkg]);

  React.useEffect(() => {
    if (open) {
      const currentNet = pkg?.network ?? "MTN";
      if (availableCategories.includes(currentNet)) {
        setNetwork(currentNet);
        setIsCustomNetwork(false);
        setCustomNetwork("");
      } else {
        setNetwork("__CUSTOM__");
        setIsCustomNetwork(true);
        setCustomNetwork(currentNet);
      }
      setName(pkg?.name ?? "");
      setGb(String(pkg?.gbAmount ?? 1));
      setDescription(pkg?.description ?? "");
      setProductId(pkg?.providerProductId ?? "");
      setPrice(pkg?.retailPriceGHS != null ? String(pkg.retailPriceGHS) : "");
      setActive(pkg?.active ?? true);
      setSortOrder(String(pkg?.sortOrder ?? 0));
    }
  }, [open, pkg, availableCategories]);

  const save = async () => {
    const resolvedNetwork = isCustomNetwork ? customNetwork.trim().toUpperCase() : network;
    if (!resolvedNetwork) {
      return toast("Please specify a network/category", "error");
    }
    setSaving(true);
    try {
      const body = {
        network: resolvedNetwork,
        name,
        gbAmount: Number(gb),
        description,
        providerProductId: productId,
        retailPriceGHS: price === "" ? undefined : Number(price),
        active,
        sortOrder: Number(sortOrder),
      };
      const res = await fetch(pkg ? `/api/admin/packages/${pkg.id}` : "/api/admin/packages", {
        method: pkg ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) return toast(json.error ?? "Save failed", "error");
      toast(pkg ? "Package updated" : "Package created", "success");
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={pkg ? `Edit ${pkg.name}` : "Add package"}>
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Network / Category</Label>
            <Select
              value={isCustomNetwork ? "__CUSTOM__" : network}
              onChange={(e) => {
                if (e.target.value === "__CUSTOM__") {
                  setIsCustomNetwork(true);
                } else {
                  setIsCustomNetwork(false);
                  setNetwork(e.target.value);
                }
              }}
            >
              {availableCategories.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
              <option value="__CUSTOM__">+ Custom Category...</option>
            </Select>
            {isCustomNetwork && (
              <Input
                placeholder="e.g. SURFLINE"
                value={customNetwork}
                onChange={(e) => setCustomNetwork(e.target.value.toUpperCase())}
                className="mt-1.5 uppercase font-mono text-xs"
              />
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Data size (GB)</Label>
            <Input type="number" min="0.1" step="0.1" value={gb} onChange={(e) => setGb(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="MTN 1GB" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Retail price (GHS)</Label>
            <Input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Sort order</Label>
            <Input type="number" min="0" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Provider product ID</Label>
          <Input value={productId} onChange={(e) => setProductId(e.target.value)} placeholder="e.g. MTN-1GB-DATA" />
        </div>
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <span>Active (available for ordering)</span>
        </label>
        <Button className="w-full" onClick={save} disabled={saving}>
          {saving && <Spinner />} {pkg ? "Save changes" : "Create package"}
        </Button>
      </div>
    </Dialog>
  );
}
