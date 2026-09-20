"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

interface Pkg {
  id: string;
  network: string;
  gbAmount: number;
  name: string;
  cost: number; // GHS
}
interface Prod {
  packageId: string;
  sellingPrice: number; // GHS
  isActive: boolean;
}

const NETWORK_STYLES: Record<string, string> = {
  MTN: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300",
  TELECEL: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  AIRTELTIGO: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
};

export function PricingEditor({
  packages,
  products,
  minMarkup,
  maxMarkup,
  disabled,
}: {
  packages: Pkg[];
  products: Prod[];
  minMarkup: number;
  maxMarkup: number | null;
  disabled: boolean;
}) {
  const router = useRouter();
  const [packageList, setPackageList] = React.useState<Pkg[]>(packages);
  const [productList, setProductList] = React.useState<Prod[]>(products);
  const byId = React.useMemo(() => new Map(productList.map((p) => [p.packageId, p])), [productList]);

  const [prices, setPrices] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(packages.map((p) => [p.id, byId.get(p.id)?.sellingPrice?.toFixed(2) ?? ""]))
  );

  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [togglingId, setTogglingId] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkMarkup, setBulkMarkup] = React.useState("");
  const [filter, setFilter] = React.useState<string>("ALL");
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [bulkBusy, setBulkBusy] = React.useState(false);

  // Sync state if props change
  React.useEffect(() => {
    setPackageList(packages);
  }, [packages]);

  React.useEffect(() => {
    setProductList(products);
  }, [products]);

  // Non-blocking auto-sync on mount
  const refreshData = React.useCallback(async () => {
    try {
      const res = await fetch("/api/storefront/products");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.packages)) {
        setPackageList(data.packages);
      }
      if (Array.isArray(data.products)) {
        const prods: Prod[] = data.products.map((p: any) => ({
          packageId: p.packageId,
          sellingPrice: p.sellingPrice / 100,
          isActive: p.isActive,
        }));
        setProductList(prods);
        setPrices((prev) => {
          const next = { ...prev };
          for (const prod of prods) {
            if (!next[prod.packageId]) {
              next[prod.packageId] = prod.sellingPrice.toFixed(2);
            }
          }
          return next;
        });
      }
    } catch {
      // non-blocking
    }
  }, []);

  React.useEffect(() => {
    refreshData();
  }, [refreshData]);

  const visible = React.useMemo(() => {
    return [...packageList]
      .filter((p) => filter === "ALL" || p.network === filter)
      .sort((a, b) => {
        if (filter === "ALL" && a.network !== b.network) {
          return a.network.localeCompare(b.network);
        }
        return a.gbAmount - b.gbAmount;
      });
  }, [packageList, filter]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function savePrice(packageId: string) {
    const val = parseFloat(prices[packageId] || "0");
    if (isNaN(val) || val <= 0) {
      setMsg({ kind: "err", text: "Please enter a valid selling price" });
      return;
    }
    setSavingId(packageId);
    setMsg(null);
    try {
      const currentProd = byId.get(packageId);
      const res = await fetch("/api/storefront/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId,
          sellingPrice: val,
          isActive: currentProd?.isActive ?? true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setMsg({ kind: "ok", text: "Price saved" });
      setProductList((prev) => {
        const next = prev.filter((p) => p.packageId !== packageId);
        next.push({
          packageId,
          sellingPrice: data.product.sellingPrice / 100,
          isActive: data.product.isActive,
        });
        return next;
      });
      setPrices((prev) => ({ ...prev, [packageId]: (data.product.sellingPrice / 100).toFixed(2) }));
      router.refresh();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Failed to save" });
    } finally {
      setSavingId(null);
    }
  }

  async function toggleActive(packageId: string, isActive: boolean) {
    const currentPrice = parseFloat(prices[packageId] || "0") || (byId.get(packageId)?.sellingPrice ?? 0);
    setTogglingId(packageId);
    setMsg(null);
    try {
      const res = await fetch("/api/storefront/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId,
          sellingPrice: currentPrice,
          isActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update");
      setProductList((prev) => {
        const next = prev.filter((p) => p.packageId !== packageId);
        next.push({
          packageId,
          sellingPrice: data.product.sellingPrice / 100,
          isActive: data.product.isActive,
        });
        return next;
      });
      router.refresh();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Failed to update" });
    } finally {
      setTogglingId(null);
    }
  }

  async function applyBulk() {
    setBulkBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/storefront/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageIds: [...selected], markupPercent: parseFloat(bulkMarkup || "0") }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bulk update failed");
      setMsg({ kind: "ok", text: `Updated ${data.updated} products` });
      setSelected(new Set());
      await refreshData();
      router.refresh();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Bulk update failed" });
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {msg && (
        <p className={`rounded-lg px-3 py-2 text-sm ${msg.kind === "ok" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"}`}>
          {msg.text}
        </p>
      )}
      {disabled && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          Your storefront is not active — pricing is read-only.
        </p>
      )}

      {/* Bulk markup */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-[#0d1526]">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Bulk markup</span>
        <input
          value={bulkMarkup}
          onChange={(e) => setBulkMarkup(e.target.value)}
          placeholder="e.g. 2.00"
          inputMode="decimal"
          className="h-9 w-28 rounded-lg border border-slate-300 px-3 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-transparent dark:text-slate-100 dark:placeholder:text-slate-500"
        />
        <span className="text-sm text-slate-500">GHS added on top of cost for selected ({selected.size})</span>
        <button
          onClick={applyBulk}
          disabled={bulkBusy || selected.size === 0 || disabled}
          className="ml-auto inline-flex items-center gap-1.5 h-9 rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {bulkBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          <span>Apply to selected</span>
        </button>
      </div>

      {/* Network filter */}
      <div className="flex gap-2">
        {["ALL", "MTN", "TELECEL", "AIRTELTIGO"].map((n) => (
          <button
            key={n}
            onClick={() => setFilter(n)}
            className={`h-8 rounded-full px-3 text-xs font-bold ${filter === n ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"}`}
          >
            {n === "ALL" ? "All networks" : n}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((p) => {
          const prod = byId.get(p.id);
          const price = parseFloat(prices[p.id] || "0");
          const markup = prod || price > 0 ? (price || prod?.sellingPrice || 0) - p.cost : null;
          return (
            <ProductCard
              key={p.id}
              pkg={p}
              prod={prod}
              price={prices[p.id]}
              onPriceChange={(v) => setPrices((s) => ({ ...s, [p.id]: v }))}
              onSave={() => savePrice(p.id)}
              onToggleActive={() => prod && toggleActive(p.id, !prod.isActive)}
              checked={selected.has(p.id)}
              onSelect={() => toggle(p.id)}
              markup={markup}
              minMarkup={minMarkup}
              maxMarkup={maxMarkup}
              isSaving={savingId === p.id}
              isToggling={togglingId === p.id}
              disabled={disabled}
            />
          );
        })}
      </div>
    </div>
  );
}

function ProductCard({
  pkg,
  prod,
  price,
  onPriceChange,
  onSave,
  onToggleActive,
  checked,
  onSelect,
  markup,
  minMarkup,
  maxMarkup,
  isSaving,
  isToggling,
  disabled,
}: {
  pkg: Pkg;
  prod?: Prod;
  price: string;
  onPriceChange: (v: string) => void;
  onSave: () => void;
  onToggleActive: () => void;
  checked: boolean;
  onSelect: () => void;
  markup: number | null;
  minMarkup: number;
  maxMarkup: number | null;
  isSaving: boolean;
  isToggling: boolean;
  disabled: boolean;
}) {
  const isBusy = disabled || isSaving || isToggling;

  return (
    <div className={`rounded-xl border p-4 ${checked ? "border-violet-500 ring-1 ring-violet-500" : "border-slate-200"} bg-white dark:border-slate-800 dark:bg-[#0d1526]`}>
      <div className="flex items-center justify-between">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${NETWORK_STYLES[pkg.network] ?? "bg-slate-100"}`}>{pkg.network}</span>
        <label className="flex items-center gap-1 text-xs text-slate-500">
          <input type="checkbox" checked={checked} onChange={onSelect} disabled={isBusy} />
          select
        </label>
      </div>
      <p className="mt-2 font-bold text-slate-900 dark:text-white">{pkg.gbAmount}GB</p>
      <p className="text-xs text-slate-500">
        Wholesale Cost: <strong className="font-semibold text-slate-700 dark:text-slate-300">GHS {pkg.cost.toFixed(2)}</strong>
      </p>
      <div className="mt-3 flex items-center gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">GHS</span>
          <input
            value={price}
            onChange={(e) => onPriceChange(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            disabled={isBusy}
            className="h-9 w-full rounded-lg border border-slate-300 pl-10 pr-2 text-sm font-semibold text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-transparent dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>
        <button
          onClick={onSave}
          disabled={isBusy}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          <span>Save</span>
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className={markup != null && markup < minMarkup ? "text-red-500" : "text-emerald-600 dark:text-emerald-400 font-medium"}>
          {markup != null ? `Profit: GHS ${markup.toFixed(2)}` : "Not listed"}
        </span>
        {prod && (
          <button
            onClick={onToggleActive}
            disabled={isBusy}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold transition-opacity disabled:opacity-50 ${
              prod.isActive
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                : "bg-slate-100 text-slate-500 dark:bg-white/10"
            }`}
          >
            {isToggling && <Loader2 className="h-3 w-3 animate-spin" />}
            <span>{prod.isActive ? "Active" : "Hidden"}</span>
          </button>
        )}
      </div>
      {maxMarkup != null && (
        <p className="mt-1 text-[11px] text-slate-400">Allowed markup: GHS {minMarkup.toFixed(2)} – {maxMarkup.toFixed(2)}</p>
      )}
    </div>
  );
}
