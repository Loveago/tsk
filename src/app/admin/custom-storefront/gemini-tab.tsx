"use client";

import * as React from "react";
import {
  Sparkles,
  ToggleLeft,
  ToggleRight,
  ExternalLink,
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Search,
  Filter,
  Phone,
  Mail,
  Loader2,
  X,
  Send,
  MessageSquare,
  KeyRound,
  ShieldCheck,
  Save,
} from "lucide-react";
import { useToast } from "@/components/toast";

export interface GeminiOrderItem {
  id: string;
  seq: number;
  code: string;
  customerEmail: string;
  customerWhatsapp: string;
  amount: number;
  paymentReference: string;
  paystackStatus: string; // PENDING | PAID | FAILED
  fulfillmentStatus: string; // PENDING | SENT | CANCELLED
  activationLink: string | null;
  adminNotes: string | null;
  paidAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

interface GeminiTabProps {
  customDomain: string;
  initialSettings?: { enabled: boolean; price: number };
  onSettingsChange?: (settings: { enabled: boolean; price: number }) => void;
}

export function GeminiProAdminTab({
  customDomain,
  initialSettings = { enabled: false, price: 50 },
  onSettingsChange,
}: GeminiTabProps) {
  const { toast } = useToast();

  const [settings, setSettings] = React.useState(initialSettings);
  const [priceInput, setPriceInput] = React.useState(initialSettings.price.toFixed(2));
  const [savingPrice, setSavingPrice] = React.useState(false);
  const [togglingStatus, setTogglingStatus] = React.useState(false);

  // Orders & Stats state
  const [orders, setOrders] = React.useState<GeminiOrderItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [stats, setStats] = React.useState({
    totalOrders: 0,
    totalPaid: 0,
    pendingFulfillment: 0,
    totalRevenue: 0,
  });

  // Filters
  const [query, setQuery] = React.useState("");
  const [paymentFilter, setPaymentFilter] = React.useState("ALL");
  const [fulfillmentFilter, setFulfillmentFilter] = React.useState("ALL");

  // Edit / Fulfillment Modal state
  const [selectedOrder, setSelectedOrder] = React.useState<GeminiOrderItem | null>(null);
  const [editLink, setEditLink] = React.useState("");
  const [editFulfillment, setEditFulfillment] = React.useState<"PENDING" | "SENT" | "CANCELLED">("SENT");
  const [editNotes, setEditNotes] = React.useState("");
  const [savingOrder, setSavingOrder] = React.useState(false);
  const [copiedLink, setCopiedLink] = React.useState<string | null>(null);

  // Fetch Gemini Orders
  const fetchOrders = React.useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (paymentFilter && paymentFilter !== "ALL") params.set("paymentStatus", paymentFilter);
      if (fulfillmentFilter && fulfillmentFilter !== "ALL")
        params.set("fulfillmentStatus", fulfillmentFilter);
      if (query.trim()) params.set("q", query.trim());

      const res = await fetch(
        `/api/admin/custom-storefront/gemini/orders?${params.toString()}`
      );
      if (!res.ok) throw new Error("Failed to load Gemini orders");
      const data = await res.json();
      setOrders(data.orders);
      if (data.stats) setStats(data.stats);
      if (data.settings) {
        setSettings(data.settings);
        setPriceInput(data.settings.price.toFixed(2));
        onSettingsChange?.(data.settings);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error loading Gemini data", "error");
    } finally {
      setLoading(false);
    }
  }, [paymentFilter, fulfillmentFilter, query, toast, onSettingsChange]);

  React.useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Toggle Category Active Switch
  async function handleToggleEnabled() {
    try {
      setTogglingStatus(true);
      const nextVal = !settings.enabled;
      const res = await fetch("/api/admin/custom-storefront/gemini/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextVal }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update setting");

      setSettings((prev) => ({ ...prev, enabled: nextVal }));
      onSettingsChange?.({ ...settings, enabled: nextVal });
      toast(
        nextVal
          ? "Google Gemini Pro category is now live on Data Deals store!"
          : "Google Gemini Pro category turned OFF on Data Deals store.",
        "success"
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to toggle category", "error");
    } finally {
      setTogglingStatus(false);
    }
  }

  // Save Selling Price
  async function handleSavePrice(e: React.FormEvent) {
    e.preventDefault();
    const num = parseFloat(priceInput);
    if (isNaN(num) || num <= 0) {
      toast("Please enter a valid price (greater than 0)", "error");
      return;
    }

    try {
      setSavingPrice(true);
      const res = await fetch("/api/admin/custom-storefront/gemini/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price: num }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update price");

      setSettings((prev) => ({ ...prev, price: num }));
      onSettingsChange?.({ ...settings, price: num });
      toast(`Selling price updated to ₵${num.toFixed(2)}`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update price", "error");
    } finally {
      setSavingPrice(false);
    }
  }

  // Open Fulfillment Modal
  function openEditModal(order: GeminiOrderItem) {
    setSelectedOrder(order);
    setEditLink(order.activationLink || "");
    setEditFulfillment(
      (order.fulfillmentStatus as "PENDING" | "SENT" | "CANCELLED") || "SENT"
    );
    setEditNotes(order.adminNotes || "");
  }

  // Save Fulfillment Status & Link
  async function handleSaveOrderFulfillment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOrder) return;

    try {
      setSavingOrder(true);
      const res = await fetch(
        `/api/admin/custom-storefront/gemini/orders/${selectedOrder.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fulfillmentStatus: editFulfillment,
            activationLink: editLink,
            adminNotes: editNotes,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update order");

      setOrders((prev) =>
        prev.map((o) => (o.id === selectedOrder.id ? { ...o, ...data.order } : o))
      );
      if (editFulfillment === "SENT" && selectedOrder.fulfillmentStatus !== "SENT") {
        setStats((prev) => ({
          ...prev,
          pendingFulfillment: Math.max(0, prev.pendingFulfillment - 1),
        }));
      }
      toast("Order updated successfully", "success");
      setSelectedOrder(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save order", "error");
    } finally {
      setSavingOrder(false);
    }
  }

  // WhatsApp shortcut helper
  function openWhatsApp(order: GeminiOrderItem, linkOverride?: string) {
    const raw = order.customerWhatsapp.replace(/\D/g, "");
    const phone = raw.startsWith("0") ? "233" + raw.slice(1) : raw;
    const link = linkOverride || order.activationLink;
    const text = link
      ? `Hello! Thank you for purchasing the 18-month Google Gemini Pro from Data Deals.\n\nHere is your official activation link:\n${link}\n\nSimply open the link with your Google account to activate your 18 months of Gemini Pro & 2TB cloud storage! Let us know if you need any assistance.`
      : `Hello! Thank you for purchasing the 18-month Google Gemini Pro from Data Deals. We are preparing your activation link now and will send it shortly!`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank");
  }

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedLink(id);
    toast("Link copied to clipboard", "success");
    setTimeout(() => setCopiedLink(null), 2000);
  }

  return (
    <div className="space-y-6">
      {/* Category Configuration Banner */}
      <div className="rounded-3xl border border-purple-200/80 bg-gradient-to-br from-purple-900 via-indigo-950 to-slate-900 p-6 sm:p-8 text-white shadow-lg">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-purple-500/20 border border-purple-400/30 px-3 py-1 text-xs font-bold text-purple-200">
              <Sparkles className="h-3.5 w-3.5 text-purple-300" />
              Category Management
            </div>
            <h2 className="font-serif text-2xl font-bold tracking-tight sm:text-3xl">
              Google Gemini Pro Activation Links
            </h2>
            <p className="max-w-xl text-xs sm:text-sm text-purple-200/80 leading-relaxed">
              Sell 18-month Google Gemini Pro activation links on the Data Deals storefront. Turn the category ON or OFF, adjust the price, and deliver links to buyers via WhatsApp.
            </p>
          </div>

          {/* Toggle Switch */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <button
              type="button"
              disabled={togglingStatus}
              onClick={handleToggleEnabled}
              className={`inline-flex items-center gap-3 rounded-2xl px-5 py-3.5 text-sm font-bold shadow-md transition-all active:scale-95 cursor-pointer ${
                settings.enabled
                  ? "bg-emerald-500 text-white shadow-emerald-500/30 hover:bg-emerald-600"
                  : "bg-white/10 text-slate-300 ring-1 ring-white/20 hover:bg-white/15"
              }`}
            >
              {settings.enabled ? (
                <>
                  <ToggleRight className="h-6 w-6 text-white" />
                  <span>Category LIVE on Store</span>
                </>
              ) : (
                <>
                  <ToggleLeft className="h-6 w-6 text-slate-400" />
                  <span>Category Paused (Turn ON)</span>
                </>
              )}
            </button>

            <a
              href={`https://${customDomain}/gemini`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/20 active:scale-95"
            >
              <span>Preview Page</span>
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>

        {/* Price Configuration Form */}
        <div className="mt-6 border-t border-white/10 pt-6">
          <form
            onSubmit={handleSavePrice}
            className="flex flex-wrap items-center gap-3"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-purple-200">
                Selling Price (GHS):
              </span>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-xs">
                  ₵
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  className="w-28 rounded-xl border border-white/20 bg-white/10 py-1.5 pl-7 pr-3 text-sm font-mono font-bold text-white outline-none focus:border-purple-400 focus:bg-white/20"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={savingPrice}
              className="inline-flex items-center gap-1.5 rounded-xl bg-purple-500 px-4 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-purple-600 disabled:opacity-50 cursor-pointer"
            >
              {savingPrice ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              <span>Save Price</span>
            </button>

            <span className="text-[11px] text-purple-300/70">
              Default is ₵50.00. Configured price takes effect immediately on store.
            </span>
          </form>
        </div>
      </div>

      {/* Key Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total Orders
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400">
              <Sparkles className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {stats.totalOrders}
          </p>
          <p className="mt-1 text-xs text-slate-500">All customer checkout intents</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Paid Orders
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {stats.totalPaid}
          </p>
          <p className="mt-1 text-xs text-slate-500">Successfully verified on Paystack</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Awaiting Link
            </span>
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                stats.pendingFulfillment > 0
                  ? "bg-amber-100 text-amber-600 animate-pulse dark:bg-amber-500/20 dark:text-amber-400"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
              }`}
            >
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <p
            className={`mt-2 text-2xl font-bold ${
              stats.pendingFulfillment > 0
                ? "text-amber-600 dark:text-amber-400"
                : "text-slate-900 dark:text-white"
            }`}
          >
            {stats.pendingFulfillment}
          </p>
          <p className="mt-1 text-xs text-slate-500">Paid orders needing activation links</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total Revenue
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400">
              <DollarSign className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            ₵{stats.totalRevenue.toFixed(2)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Collected from Gemini sales</p>
        </div>
      </div>

      {/* Orders Filter & Search Bar */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search email, WhatsApp phone, or order reference..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3 text-xs outline-none transition focus:border-indigo-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Filter className="h-3.5 w-3.5" />
              <span>Payment:</span>
            </div>
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 py-1.5 px-2.5 text-xs font-semibold text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="ALL">All Payments</option>
              <option value="PAID">Paid Only</option>
              <option value="PENDING">Pending Payment</option>
              <option value="FAILED">Failed</option>
            </select>

            <div className="flex items-center gap-1.5 text-xs text-slate-500 ml-2">
              <span>Fulfillment:</span>
            </div>
            <select
              value={fulfillmentFilter}
              onChange={(e) => setFulfillmentFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 py-1.5 px-2.5 text-xs font-semibold text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="ALL">All Delivery States</option>
              <option value="PENDING">Awaiting Link</option>
              <option value="SENT">Link Sent</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
              <tr>
                <th className="px-6 py-3.5">Code / Date</th>
                <th className="px-6 py-3.5">Customer Email</th>
                <th className="px-6 py-3.5">WhatsApp Number</th>
                <th className="px-6 py-3.5">Amount</th>
                <th className="px-6 py-3.5">Payment</th>
                <th className="px-6 py-3.5">Fulfillment</th>
                <th className="px-6 py-3.5">Activation Link</th>
                <th className="px-6 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {orders.map((o) => {
                const isPaid = o.paystackStatus === "PAID";
                const isSent = o.fulfillmentStatus === "SENT";

                return (
                  <tr key={o.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <td className="px-6 py-4">
                      <p className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                        {o.code}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {new Date(o.createdAt).toLocaleString("en-GH", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </p>
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-800 dark:text-slate-200">
                        <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="truncate max-w-44">{o.customerEmail}</span>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 font-mono text-xs font-bold text-slate-900 dark:text-white">
                          <Phone className="h-3 w-3 text-slate-400 shrink-0" />
                          <span>{o.customerWhatsapp}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => openWhatsApp(o)}
                          title="Message on WhatsApp"
                          className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[#25D366]/15 text-[#25D366] hover:bg-[#25D366] hover:text-white transition"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <span className="font-mono text-xs font-black text-slate-900 dark:text-white">
                        ₵{o.amount.toFixed(2)}
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          isPaid
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                            : o.paystackStatus === "FAILED"
                            ? "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
                        }`}
                      >
                        {isPaid && <Check className="h-3 w-3" />}
                        {o.paystackStatus}
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          isSent
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                            : o.fulfillmentStatus === "CANCELLED"
                            ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
                        }`}
                      >
                        {isSent ? "LINK SENT" : o.fulfillmentStatus}
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      {o.activationLink ? (
                        <div className="flex items-center gap-1.5">
                          <span className="truncate max-w-36 font-mono text-[11px] text-purple-700 dark:text-purple-300">
                            {o.activationLink}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(o.activationLink!, o.id)}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            title="Copy link"
                          >
                            {copiedLink === o.id ? (
                              <Check className="h-3.5 w-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] italic text-slate-400">Not set</span>
                      )}
                    </td>

                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => openEditModal(o)}
                        className="inline-flex items-center gap-1 rounded-xl bg-purple-50 px-3 py-1.5 text-xs font-bold text-purple-700 hover:bg-purple-100 dark:bg-purple-500/15 dark:text-purple-300 dark:hover:bg-purple-500/25 transition cursor-pointer"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                        <span>Fulfill</span>
                      </button>
                    </td>
                  </tr>
                );
              })}

              {orders.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500 text-xs">
                    No Google Gemini Pro orders recorded yet.
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-purple-600" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Fulfillment Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#111a2c]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-white/10">
              <div>
                <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-[11px] font-bold text-purple-800 dark:bg-purple-500/20 dark:text-purple-300">
                  <Sparkles className="h-3 w-3" />
                  Order #{selectedOrder.code}
                </span>
                <h3 className="mt-1 font-serif text-lg font-bold text-slate-900 dark:text-white">
                  Send Activation Link
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Customer Details Summary */}
            <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-xs space-y-2 dark:bg-white/5">
              <div className="flex justify-between">
                <span className="text-slate-500">Customer Email:</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {selectedOrder.customerEmail}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">WhatsApp Phone:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  {selectedOrder.customerWhatsapp}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Amount Paid:</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  ₵{selectedOrder.amount.toFixed(2)} ({selectedOrder.paystackStatus})
                </span>
              </div>
            </div>

            <form onSubmit={handleSaveOrderFulfillment} className="mt-5 space-y-4">
              {/* Activation Link Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Google Gemini Pro Activation Link URL
                </label>
                <input
                  type="url"
                  placeholder="https://one.google.com/promo/..."
                  value={editLink}
                  onChange={(e) => setEditLink(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3 text-xs text-slate-900 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Paste the 18-month activation promo link here. Customer will see it on their order tracking page.
                </p>
              </div>

              {/* Status Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Fulfillment Status
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["PENDING", "SENT", "CANCELLED"] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setEditFulfillment(st)}
                      className={`rounded-xl py-2 text-xs font-bold transition ${
                        editFulfillment === st
                          ? st === "SENT"
                            ? "bg-emerald-600 text-white"
                            : st === "CANCELLED"
                            ? "bg-slate-600 text-white"
                            : "bg-amber-500 text-white"
                          : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      }`}
                    >
                      {st === "SENT" ? "Link Sent" : st === "PENDING" ? "Awaiting Link" : "Cancelled"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Admin Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Admin Internal Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Notes about this delivery..."
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-900 outline-none focus:border-purple-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2 pt-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => openWhatsApp(selectedOrder, editLink)}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#25D366] py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-500/20 transition hover:bg-[#20ba59]"
                >
                  <MessageSquare className="h-4 w-4" />
                  <span>Send via WhatsApp</span>
                </button>

                <button
                  type="submit"
                  disabled={savingOrder}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-purple-600 py-2.5 text-xs font-bold text-white shadow-md shadow-purple-500/20 transition hover:bg-purple-700 disabled:opacity-50"
                >
                  {savingOrder ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  <span>Save Status</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
