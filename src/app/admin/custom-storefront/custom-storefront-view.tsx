"use client";

import * as React from "react";
import Link from "next/link";
import {
  Globe,
  ExternalLink,
  Store,
  Package,
  Settings,
  ShoppingBag,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Loader2,
  Search,
  Filter,
  DollarSign,
  Phone,
  MessageSquare,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  ShieldCheck,
  ChevronRight,
  RotateCcw,
  Power,
  PauseCircle,
  Share2,
  Lock,
} from "lucide-react";
import { useToast } from "@/components/toast";

interface StorefrontData {
  id: string;
  name: string;
  slug: string;
  customDomain: string | null;
  description: string | null;
  phone: string | null;
  whatsapp: string | null;
  whatsappGroupLink: string | null;
  location: string | null;
  contactText: string | null;
  whatsappLabel: string | null;
  notice: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  status: string;
  isActive: boolean;
}

interface ProductItem {
  id: string;
  packageId: string;
  network: string;
  gbAmount: number;
  packageName: string;
  sellingPrice: number;
  cost: number;
  isActive: boolean;
}

interface PackageItem {
  id: string;
  network: string;
  gbAmount: number;
  name: string;
  cost: number;
}

interface OrderItem {
  id: string;
  seq: number;
  code: string;
  paymentReference: string;
  storeName: string;
  customerPhone: string;
  customerEmail?: string | null;
  network: string;
  gbAmount: number;
  packageName: string;
  sellingPrice: number;
  productCost: number;
  commission: number;
  status: string;
  paidAt: string | null;
  createdAt: string;
}

const NETWORK_BADGES: Record<string, string> = {
  MTN: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30",
  TELECEL: "bg-red-100 text-red-800 border-red-300 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/30",
  AIRTELTIGO: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30",
};

export function CustomStorefrontView({
  initialStorefront,
}: {
  initialStorefront: StorefrontData;
}) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = React.useState<"overview" | "products" | "settings" | "orders">("overview");
  const [storefront, setStorefront] = React.useState<StorefrontData>(initialStorefront);
  const [products, setProducts] = React.useState<ProductItem[]>([]);
  const [packages, setPackages] = React.useState<PackageItem[]>([]);
  const [stats, setStats] = React.useState({
    totalOrders: 0,
    completedOrders: 0,
    pendingOrders: 0,
    totalRevenue: 0,
    totalCommission: 0,
    pendingCommission: 0,
  });

  const [networkSettings, setNetworkSettings] = React.useState({
    mtn: true,
    telecel: true,
    airteltigo: true,
  });
  const [togglingNetwork, setTogglingNetwork] = React.useState<string | null>(null);

  const [loading, setLoading] = React.useState(true);
  const [savingSettings, setSavingSettings] = React.useState(false);
  const [copiedLink, setCopiedLink] = React.useState(false);

  // Settings form state
  const [settingsForm, setSettingsForm] = React.useState({
    name: initialStorefront.name || "",
    description: initialStorefront.description || "",
    phone: initialStorefront.phone || "",
    whatsapp: initialStorefront.whatsapp || "",
    whatsappGroupLink: initialStorefront.whatsappGroupLink || "",
    location: initialStorefront.location || "",
    contactText: initialStorefront.contactText || "",
    whatsappLabel: initialStorefront.whatsappLabel || "",
    notice: initialStorefront.notice || "",
    logoUrl: initialStorefront.logoUrl || "",
    bannerUrl: initialStorefront.bannerUrl || "",
    isActive: initialStorefront.isActive,
  });

  // Product Pricing state
  const [pricingInputs, setPricingInputs] = React.useState<Record<string, string>>({});
  const [selectedNetwork, setSelectedNetwork] = React.useState<string>("ALL");
  const [savingPackageId, setSavingPackageId] = React.useState<string | null>(null);
  const [togglingPackageId, setTogglingPackageId] = React.useState<string | null>(null);
  const [bulkMarkup, setBulkMarkup] = React.useState<string>("2.00");
  const [bulkApplying, setBulkApplying] = React.useState(false);

  // Orders Tab state
  const [orders, setOrders] = React.useState<OrderItem[]>([]);
  const [ordersLoading, setOrdersLoading] = React.useState(false);
  const [orderQuery, setOrderQuery] = React.useState("");
  const [orderStatusFilter, setOrderStatusFilter] = React.useState("ALL");

  const customDomain = storefront.customDomain || "data-deals.com";
  const publicStoreUrl = `https://${customDomain}`;

  // Fetch initial full data
  const fetchData = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/custom-storefront");
      if (!res.ok) throw new Error("Failed to load storefront data");
      const data = await res.json();
      setStorefront(data.storefront);
      setProducts(data.products);
      setPackages(data.packages);
      setStats(data.stats);
      if (data.networkSettings) {
        setNetworkSettings(data.networkSettings);
      }

      const priceMap: Record<string, string> = {};
      data.products.forEach((p: ProductItem) => {
        priceMap[p.packageId] = p.sellingPrice.toFixed(2);
      });
      data.packages.forEach((pkg: PackageItem) => {
        if (!priceMap[pkg.id]) {
          priceMap[pkg.id] = (pkg.cost + 2).toFixed(2);
        }
      });
      setPricingInputs(priceMap);

      setSettingsForm({
        name: data.storefront.name || "",
        description: data.storefront.description || "",
        phone: data.storefront.phone || "",
        whatsapp: data.storefront.whatsapp || "",
        whatsappGroupLink: data.storefront.whatsappGroupLink || "",
        location: data.storefront.location || "",
        contactText: data.storefront.contactText || "",
        whatsappLabel: data.storefront.whatsappLabel || "",
        notice: data.storefront.notice || "",
        logoUrl: data.storefront.logoUrl || "",
        bannerUrl: data.storefront.bannerUrl || "",
        isActive: data.storefront.isActive,
      });
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Error loading data", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch orders
  const fetchOrders = React.useCallback(async () => {
    try {
      setOrdersLoading(true);
      const params = new URLSearchParams();
      if (orderStatusFilter && orderStatusFilter !== "ALL") params.set("status", orderStatusFilter);
      if (orderQuery.trim()) params.set("q", orderQuery.trim());

      const res = await fetch(`/api/admin/custom-storefront/orders?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load storefront orders");
      const data = await res.json();
      setOrders(data.orders);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to load orders", "error");
    } finally {
      setOrdersLoading(false);
    }
  }, [orderStatusFilter, orderQuery, toast]);

  React.useEffect(() => {
    fetchData();
    fetchOrders();
  }, [fetchData, fetchOrders]);

  React.useEffect(() => {
    if (activeTab === "orders") {
      fetchOrders();
    }
  }, [activeTab, fetchOrders]);

  // Network master pause switches (MTN, Telecel, AirtelTigo)
  async function handleToggleNetwork(net: "mtn" | "telecel" | "airteltigo") {
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
          ? `${net.toUpperCase()} ordering enabled across all stores`
          : `${net.toUpperCase()} ordering paused across all storefronts and API`,
        "success"
      );
    } catch {
      toast(`Failed to update ${net.toUpperCase()} status`, "error");
    } finally {
      setTogglingNetwork(null);
    }
  }

  // Toggle individual bundle listing in this custom store
  async function handleToggleProductActive(packageId: string, currentActive: boolean) {
    const rawVal = pricingInputs[packageId];
    const numVal = parseFloat(rawVal) || 0;
    const nextActive = !currentActive;

    setTogglingPackageId(packageId);
    try {
      const res = await fetch("/api/admin/custom-storefront", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId,
          sellingPrice: numVal > 0 ? numVal : undefined,
          isActive: nextActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update bundle status");

      setProducts((prev) => {
        const next = prev.filter((p) => p.packageId !== packageId);
        if (data.product) {
          const pkg = packages.find((k) => k.id === packageId);
          next.push({
            id: data.product.id,
            packageId: data.product.packageId,
            network: pkg?.network || "",
            gbAmount: pkg?.gbAmount || 0,
            packageName: pkg?.name || "",
            sellingPrice: data.product.sellingPrice / 100,
            cost: pkg?.cost || 0,
            isActive: data.product.isActive,
          });
        }
        return next;
      });
      toast(nextActive ? "Bundle listed on store" : "Bundle hidden from store", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to toggle bundle", "error");
    } finally {
      setTogglingPackageId(null);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicStoreUrl);
      setCopiedLink(true);
      toast("Store link copied to clipboard", "success");
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // ignore
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSavingSettings(true);
      const res = await fetch("/api/admin/custom-storefront", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update settings");
      setStorefront(data.storefront);
      toast("Data Deals settings updated successfully", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to update settings", "error");
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleToggleStoreActive() {
    try {
      const nextActive = !storefront.isActive;
      const res = await fetch("/api/admin/custom-storefront", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: nextActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to toggle status");
      setStorefront(data.storefront);
      setSettingsForm((prev) => ({ ...prev, isActive: nextActive }));
      toast(nextActive ? "Store is now LIVE and accepting orders" : "Store paused", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to update status", "error");
    }
  }

  async function handleSavePrice(packageId: string) {
    const rawVal = pricingInputs[packageId];
    const numVal = parseFloat(rawVal);
    if (isNaN(numVal) || numVal <= 0) {
      toast("Please enter a valid price in GHS", "error");
      return;
    }

    try {
      setSavingPackageId(packageId);
      const res = await fetch("/api/admin/custom-storefront", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId, sellingPrice: numVal, isActive: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update price");

      toast("Retail price updated", "success");
      fetchData();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to update price", "error");
    } finally {
      setSavingPackageId(null);
    }
  }

  async function handleApplyBulkMarkup() {
    const markupVal = parseFloat(bulkMarkup);
    if (isNaN(markupVal)) {
      toast("Enter a valid markup value in GHS", "error");
      return;
    }

    const targetPackages = packages.filter((p) =>
      selectedNetwork === "ALL" ? true : p.network === selectedNetwork
    );

    if (targetPackages.length === 0) {
      toast("No packages found to update", "error");
      return;
    }

    try {
      setBulkApplying(true);
      const res = await fetch("/api/admin/custom-storefront", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bulk: true,
          packageIds: targetPackages.map((p) => p.id),
          markup: markupVal,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to bulk update prices");

      toast(`Updated ${targetPackages.length} package prices with +GHS ${markupVal.toFixed(2)} markup`, "success");
      fetchData();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to bulk update", "error");
    } finally {
      setBulkApplying(false);
    }
  }

  const filteredPackages = packages.filter((p) =>
    selectedNetwork === "ALL" ? true : p.network === selectedNetwork
  );

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 p-6 text-white shadow-xl dark:border-indigo-500/20 sm:p-8">
        <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-semibold text-indigo-300 ring-1 ring-inset ring-indigo-400/30">
              <Globe className="h-3.5 w-3.5 text-indigo-400" />
              <span>Dedicated Custom Domain Storefront</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
              {storefront.name}
            </h1>
            <p className="max-w-2xl text-sm text-slate-300">
              Exclusive secondary storefront mapped directly to{" "}
              <span className="font-mono font-bold text-amber-300">{customDomain}</span>. Owned and controlled exclusively by the Administrator.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleToggleStoreActive}
              className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold transition-all shadow-md ${
                storefront.isActive
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30"
                  : "bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30"
              }`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${storefront.isActive ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
              {storefront.isActive ? "Store is Active" : "Store Paused"}
            </button>

            <a
              href={publicStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-xs font-bold text-slate-950 shadow-md transition-all hover:bg-slate-100 active:scale-95"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Visit {customDomain}</span>
            </a>

            <button
              type="button"
              onClick={copyLink}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-3.5 py-2.5 text-xs font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/20 active:scale-95"
            >
              {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedLink ? "Copied" : "Copy URL"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab("overview")}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition-colors ${
            activeTab === "overview"
              ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <TrendingUp className="h-4 w-4" />
          Overview
        </button>
        <button
          onClick={() => setActiveTab("products")}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition-colors ${
            activeTab === "products"
              ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <Package className="h-4 w-4" />
          Products & Retail Pricing
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition-colors ${
            activeTab === "settings"
              ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <Settings className="h-4 w-4" />
          Store Settings & Branding
        </button>
        <button
          onClick={() => setActiveTab("orders")}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition-colors ${
            activeTab === "orders"
              ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <ShoppingBag className="h-4 w-4" />
          Orders ({stats.totalOrders})
        </button>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Key Stat Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Sales Volume</span>
                <span className="rounded-xl bg-indigo-50 p-2 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                  <ShoppingBag className="h-5 w-5" />
                </span>
              </div>
              <p className="mt-3 text-2xl font-black text-slate-900 dark:text-white">
                GHS {stats.totalRevenue.toFixed(2)}
              </p>
              <p className="mt-1 text-xs text-slate-500">{stats.totalOrders} total buyer checkouts</p>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Store Wallet Balance</span>
                <span className="rounded-xl bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                  <DollarSign className="h-5 w-5" />
                </span>
              </div>
              <p className="mt-3 text-2xl font-black text-emerald-600 dark:text-emerald-400">
                GHS {stats.totalCommission.toFixed(2)}
              </p>
              <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                <span>Earned profit from store</span>
                {stats.pendingCommission > 0 && (
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    +GHS {stats.pendingCommission.toFixed(2)} pending
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Completed Deliveries</span>
                <span className="rounded-xl bg-blue-50 p-2 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
              </div>
              <p className="mt-3 text-2xl font-black text-slate-900 dark:text-white">
                {stats.completedOrders}
              </p>
              <p className="mt-1 text-xs text-slate-500">Successfully dispatched bundles</p>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Active Packages</span>
                <span className="rounded-xl bg-amber-50 p-2 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
                  <Package className="h-5 w-5" />
                </span>
              </div>
              <p className="mt-3 text-2xl font-black text-slate-900 dark:text-white">
                {products.filter((p) => p.isActive).length} / {packages.length}
              </p>
              <p className="mt-1 text-xs text-slate-500">Bundles listed on {customDomain}</p>
            </div>
          </div>

          {/* Quick Domain & Routing Check Info */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Domain Mapping & Routing Architecture
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              This secondary store serves public customers on its custom domain while keeping the main admin storefront intact.
            </p>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                  <Globe className="h-4 w-4 text-indigo-500" />
                  Primary Domain
                </div>
                <p className="mt-2 text-sm font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                  {customDomain}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Visitors on this host are automatically rewritten to the dedicated store root.
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  Admin Route Protection
                </div>
                <p className="mt-2 text-sm font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                  Protected & Blocked
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Access to /admin or /dashboard on {customDomain} redirects safely to the main platform.
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                  <Store className="h-4 w-4 text-amber-500" />
                  Store Slug
                </div>
                <p className="mt-2 text-sm font-mono font-semibold text-amber-600 dark:text-amber-400">
                  /store/{storefront.slug}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Internal slug path powering the custom domain seamless rewrites.
                </p>
              </div>
            </div>
          </div>

          {/* Recent Orders Overview */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Recent Sales Activity
                </h3>
                <p className="text-sm text-slate-500">
                  Latest customer orders placed on {customDomain}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("orders");
                  fetchOrders();
                }}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                <span>View all {stats.totalOrders} orders</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-slate-100 dark:border-slate-800">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-800/50">
                    <tr>
                      <th className="px-4 py-3">Order Ref</th>
                      <th className="px-4 py-3">Customer Phone</th>
                      <th className="px-4 py-3">Bundle</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {orders.slice(0, 5).map((o) => (
                      <tr key={o.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-3 font-mono text-xs font-bold text-slate-900 dark:text-white">
                          {o.code}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">
                          {o.customerPhone}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-md border px-1.5 py-0.5 text-[10px] font-black ${
                              NETWORK_BADGES[o.network] || "bg-slate-100 text-slate-800"
                            }`}
                          >
                            {o.network} {o.gbAmount}GB
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs font-bold text-slate-900 dark:text-white">
                          GHS {(o.sellingPrice / 100).toFixed(2)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              o.status === "COMPLETED"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                                : o.status === "PROCESSING"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300"
                                : o.status === "PENDING"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
                                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                            }`}
                          >
                            {o.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-slate-500">
                          {new Date(o.createdAt).toLocaleDateString("en-GH", {
                            month: "short",
                            day: "numeric",
                          })}
                        </td>
                      </tr>
                    ))}
                    {orders.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-xs text-slate-400">
                          No orders placed yet on {customDomain}.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PRODUCTS & RETAIL PRICING */}
      {activeTab === "products" && (
        <div className="space-y-6">
          {/* Network Operational Controls Card */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Store & Network Availability Controls</h2>
                <p className="text-xs text-slate-500">
                  Enable or pause networks across {customDomain} and the platform. If a network is paused, it automatically displays maintenance notices.
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
                  onClick={() => handleToggleNetwork("mtn")}
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
                  onClick={() => handleToggleNetwork("telecel")}
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
                  onClick={() => handleToggleNetwork("airteltigo")}
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

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Retail Pricing & Products for {customDomain}
              </h2>
              <p className="text-sm text-slate-500">
                Set customer selling prices exclusively for this storefront. Packages without a custom price use default markup.
              </p>
            </div>

            {/* Network Filter */}
            <div className="flex items-center gap-2">
              {["ALL", "MTN", "TELECEL", "AIRTELTIGO"].map((net) => (
                <button
                  key={net}
                  type="button"
                  onClick={() => setSelectedNetwork(net)}
                  className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                    selectedNetwork === net
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  }`}
                >
                  {net}
                </button>
              ))}
            </div>
          </div>

          {/* Bulk Pricing Quick Tool */}
          <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 dark:border-indigo-900/40 dark:bg-indigo-950/20">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-950 dark:text-indigo-200">
              <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <span>Bulk Markup:</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Cost + GHS</span>
              <input
                type="number"
                step="0.5"
                value={bulkMarkup}
                onChange={(e) => setBulkMarkup(e.target.value)}
                className="w-24 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <button
              type="button"
              disabled={bulkApplying}
              onClick={handleApplyBulkMarkup}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition-all hover:bg-indigo-700 disabled:opacity-50"
            >
              {bulkApplying && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Apply to {selectedNetwork === "ALL" ? "All Networks" : selectedNetwork}
            </button>
          </div>

          {/* Packages Table */}
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
                  <tr>
                    <th className="px-6 py-4">Network &amp; Bundle</th>
                    <th className="px-6 py-4">Wholesale Cost</th>
                    <th className="px-6 py-4">Store Selling Price</th>
                    <th className="px-6 py-4">Retail Margin</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredPackages.map((pkg) => {
                    const priceStr = pricingInputs[pkg.id] ?? (pkg.cost + 2).toFixed(2);
                    const priceNum = parseFloat(priceStr) || 0;
                    const margin = priceNum - pkg.cost;
                    const isSaving = savingPackageId === pkg.id;
                    const isToggling = togglingPackageId === pkg.id;
                    const productRecord = products.find((p) => p.packageId === pkg.id);
                    const isProductActive = productRecord ? productRecord.isActive : true;

                    return (
                      <tr key={pkg.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <span
                              className={`rounded-lg border px-2 py-0.5 text-[11px] font-black ${
                                NETWORK_BADGES[pkg.network] || "bg-slate-100 text-slate-800"
                              }`}
                            >
                              {pkg.network}
                            </span>
                            <div>
                              <p className="font-bold text-slate-900 dark:text-white">
                                {pkg.name || `${pkg.gbAmount} GB`}
                              </p>
                              <p className="text-xs text-slate-400">{pkg.gbAmount} GB High-Speed Data</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono font-medium text-slate-600 dark:text-slate-300">
                          GHS {pkg.cost.toFixed(2)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-400">GHS</span>
                            <input
                              type="number"
                              step="0.5"
                              value={priceStr}
                              onChange={(e) =>
                                setPricingInputs((prev) => ({ ...prev, [pkg.id]: e.target.value }))
                              }
                              className="w-24 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-mono text-sm font-bold text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                            />
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono font-bold">
                          <span
                            className={
                              margin >= 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-rose-600 dark:text-rose-400"
                            }
                          >
                            +{margin.toFixed(2)} GHS
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                              isProductActive
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                isProductActive ? "bg-emerald-500" : "bg-slate-400"
                              }`}
                            />
                            {isProductActive ? "Active" : "Hidden"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              disabled={isToggling}
                              onClick={() => handleToggleProductActive(pkg.id, isProductActive)}
                              className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-all border ${
                                isProductActive
                                  ? "border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                  : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                              } disabled:opacity-50`}
                              title={isProductActive ? "Hide bundle from storefront" : "Show bundle on storefront"}
                            >
                              {isToggling ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Power className="h-3 w-3" />
                              )}
                              <span>{isProductActive ? "Hide" : "Show"}</span>
                            </button>

                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => handleSavePrice(pkg.id)}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition-all hover:bg-slate-800 disabled:opacity-50 dark:bg-indigo-600 dark:hover:bg-indigo-700"
                            >
                              {isSaving && <Loader2 className="h-3 w-3 animate-spin" />}
                              Save
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredPackages.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        No packages found for this network.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: STORE SETTINGS & BRANDING */}
      {activeTab === "settings" && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Store Identity</h3>
            <p className="text-sm text-slate-500">
              Customize the name, notice banner, and support details shown on {customDomain}.
            </p>

            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  Store Public Name
                </label>
                <input
                  type="text"
                  required
                  value={settingsForm.name}
                  onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  WhatsApp Support Phone
                </label>
                <input
                  type="text"
                  placeholder="e.g. 0551234567"
                  value={settingsForm.whatsapp}
                  onChange={(e) => setSettingsForm({ ...settingsForm, whatsapp: e.target.value })}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  Top Announcement Notice Banner
                </label>
                <input
                  type="text"
                  placeholder="e.g. ⚡ Instant bundle processing 24/7. MTN & Telecel active!"
                  value={settingsForm.notice}
                  onChange={(e) => setSettingsForm({ ...settingsForm, notice: e.target.value })}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  Store Description / Subtitle
                </label>
                <textarea
                  rows={2}
                  value={settingsForm.description}
                  onChange={(e) => setSettingsForm({ ...settingsForm, description: e.target.value })}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  WhatsApp Chat Bubble Label
                </label>
                <input
                  type="text"
                  placeholder="e.g. Need Help?"
                  value={settingsForm.whatsappLabel}
                  onChange={(e) => setSettingsForm({ ...settingsForm, whatsappLabel: e.target.value })}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  WhatsApp Group Community Link
                </label>
                <input
                  type="url"
                  placeholder="https://chat.whatsapp.com/..."
                  value={settingsForm.whatsappGroupLink}
                  onChange={(e) => setSettingsForm({ ...settingsForm, whatsappGroupLink: e.target.value })}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  Logo Image URL
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={settingsForm.logoUrl}
                  onChange={(e) => setSettingsForm({ ...settingsForm, logoUrl: e.target.value })}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  Banner Image URL
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={settingsForm.bannerUrl}
                  onChange={(e) => setSettingsForm({ ...settingsForm, bannerUrl: e.target.value })}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end border-t border-slate-100 pt-6 dark:border-slate-800">
              <button
                type="submit"
                disabled={savingSettings}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:bg-indigo-700 disabled:opacity-50"
              >
                {savingSettings && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        </form>
      )}

      {/* TAB 4: ORDERS */}
      {activeTab === "orders" && (
        <div className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Orders on {customDomain}
              </h2>
              <p className="text-sm text-slate-500">
                Customer purchases made through Paystack checkout on the Data Deals storefront.
              </p>
            </div>

            {/* Filter controls */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Phone or Paystack ref..."
                  value={orderQuery}
                  onChange={(e) => setOrderQuery(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white pl-9 pr-3.5 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <select
                value={orderStatusFilter}
                onChange={(e) => setOrderStatusFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="ALL">All Statuses</option>
                <option value="COMPLETED">Completed</option>
                <option value="PROCESSING">Processing</option>
                <option value="PENDING">Pending (Paid)</option>
                <option value="AWAITING_PAYMENT">Awaiting Payment</option>
                <option value="FAILED">Failed</option>
              </select>

              <button
                type="button"
                onClick={fetchOrders}
                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
                  <tr>
                    <th className="px-6 py-4">Order Ref</th>
                    <th className="px-6 py-4">Customer</th>
                    <th className="px-6 py-4">Network / Bundle</th>
                    <th className="px-6 py-4">Amount</th>
                    <th className="px-6 py-4">Profit</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {orders.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                      <td className="px-6 py-4">
                        <div className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                          {o.code}
                        </div>
                        <div className="font-mono text-[11px] text-slate-400">
                          {o.paymentReference}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-mono text-xs font-semibold text-slate-900 dark:text-white">
                          {o.customerPhone}
                        </div>
                        {o.customerEmail && (
                          <div className="text-[11px] text-slate-400">{o.customerEmail}</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-md border px-1.5 py-0.5 text-[10px] font-black ${
                              NETWORK_BADGES[o.network] || "bg-slate-100 text-slate-800"
                            }`}
                          >
                            {o.network}
                          </span>
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {o.gbAmount} GB
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono font-bold text-slate-900 dark:text-white">
                        GHS {(o.sellingPrice / 100).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        +GHS {(o.commission / 100).toFixed(2)}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            o.status === "COMPLETED"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                              : o.status === "PROCESSING"
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300"
                              : o.status === "PENDING"
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
                              : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                          }`}
                        >
                          {o.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500">
                        {new Date(o.createdAt).toLocaleString("en-GH", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </td>
                    </tr>
                  ))}
                  {orders.length === 0 && !ordersLoading && (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-500">
                        No orders recorded on {customDomain} yet.
                      </td>
                    </tr>
                  )}
                  {ordersLoading && (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-500">
                        <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-600" />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
