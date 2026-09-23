"use client";

import * as React from "react";
import {
  Loader2,
  X,
  ShoppingBag,
  Smartphone,
  Mail,
  ShieldCheck,
  Zap,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  ArrowRight,
} from "lucide-react";
import { NetworkLogo } from "@/components/store/network-logo";
import { NETWORK_BRANDS, ghs } from "@/components/store/brands";
import type { NetworkProvider } from "@/lib/types";

export interface Product {
  packageId: string;
  gbAmount: number;
  name: string;
  price: number; // GHS
}

interface NetworkBuyFormProps {
  slug: string;
  products: Product[];
  network?: NetworkProvider;
  storeName?: string;
}

/**
 * Interactive bundle size selector with a dedicated storefront-themed checkout modal.
 * When the customer selects a GB size (e.g. MTN 1GB), an aesthetic pop-up opens
 * to collect recipient phone and email for Paystack payment receipt and automated delivery.
 */
export function NetworkBuyForm({ slug, products, network, storeName }: NetworkBuyFormProps) {
  // Modal & selected bundle state
  const [modalOpen, setModalOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Product | null>(null);

  // Customer input state
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const phoneInputRef = React.useRef<HTMLInputElement>(null);

  // Restore saved email from previous checkout on mount
  React.useEffect(() => {
    try {
      const savedEmail = localStorage.getItem("storefront_customer_email");
      if (savedEmail) setEmail(savedEmail);
      const savedPhone = localStorage.getItem("storefront_customer_phone");
      if (savedPhone) setPhone(savedPhone);
    } catch {
      // Ignore localStorage read errors in private browsing
    }
  }, []);

  // Handle escape key & body scroll lock when modal is open
  React.useEffect(() => {
    if (!modalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        setModalOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    // Focus phone input automatically when opened
    const timer = setTimeout(() => {
      phoneInputRef.current?.focus();
    }, 150);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
      clearTimeout(timer);
    };
  }, [modalOpen, busy]);

  const phoneValid = /^0\d{9}$/.test(phone.trim());
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const openCheckout = (product: Product) => {
    setSelected(product);
    setError("");
    setModalOpen(true);
  };

  const closeCheckout = () => {
    if (busy) return;
    setModalOpen(false);
  };

  async function handleBuy(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;

    if (!phoneValid) {
      setError("Enter a valid 10-digit number starting with 0, e.g. 0241234567");
      phoneInputRef.current?.focus();
      return;
    }
    if (!emailValid) {
      setError("Enter a valid email address so Paystack can send your payment receipt.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      // Remember customer details for future checkouts
      try {
        localStorage.setItem("storefront_customer_email", email.trim().toLowerCase());
        localStorage.setItem("storefront_customer_phone", phone.trim());
      } catch {
        // Ignore localStorage write errors
      }

      const res = await fetch(`/api/store/${slug}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId: selected.packageId,
          customerPhone: phone.trim(),
          customerEmail: email.trim().toLowerCase(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start payment");

      // Redirect to Paystack hosted checkout
      window.location.href = data.authorizationUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start payment");
      setBusy(false);
    }
  }

  const fee = selected ? Math.round(selected.price * 0.02 * 100) / 100 : 0;
  const total = selected ? Math.round((selected.price + fee) * 100) / 100 : 0;
  const brand = network ? NETWORK_BRANDS[network] : null;

  return (
    <div className="mt-6">
      {/* Bundle Grid Header */}
      <div className="flex items-center justify-between pb-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            Available Packages
          </p>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
            Tap on any bundle to enter your details &amp; pay with MoMo
          </p>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-yellow-400/10 px-2.5 py-1 text-[11px] font-semibold text-yellow-700 dark:text-yellow-400">
          <Zap className="h-3 w-3 text-yellow-500" /> Instant Delivery
        </span>
      </div>

      {/* Compact Modern Bundle Cards Grid */}
      <div className="grid grid-cols-2 gap-2 sm:gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((p) => {
          return (
            <button
              type="button"
              key={p.packageId}
              onClick={() => openCheckout(p)}
              className="group relative flex flex-col justify-between overflow-hidden rounded-xl sm:rounded-2xl border border-slate-200/90 bg-white p-2.5 sm:p-3 text-center transition-all duration-150 hover:-translate-y-0.5 hover:border-yellow-400 hover:shadow-md hover:shadow-yellow-400/10 active:scale-[0.98] dark:border-white/10 dark:bg-white/5 dark:hover:border-yellow-400/70 dark:hover:bg-white/10 cursor-pointer"
            >
              {/* Subtle top indicator */}
              <div className="flex items-center justify-between text-[10px] font-medium text-slate-400 dark:text-slate-500">
                <span className="text-[10px]">Non-Expiry</span>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </div>

              {/* Data Size Display */}
              <div className="my-1 sm:my-1.5">
                <span className="block text-xl font-black tracking-tight text-slate-900 transition-colors group-hover:text-yellow-600 sm:text-2xl dark:text-white dark:group-hover:text-yellow-400">
                  {p.gbAmount}
                  <span className="text-xs font-bold tracking-normal ml-0.5">GB</span>
                </span>
              </div>

              {/* Price & Action Button */}
              <div className="pt-1.5 border-t border-slate-100 dark:border-white/5">
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                    ₵{p.price.toFixed(2)}
                  </span>
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-yellow-300 text-slate-900 shadow-2xs transition-transform duration-150 group-hover:scale-110 group-hover:bg-yellow-400">
                    <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Hint underneath grid */}
      <p className="mt-4 text-center text-xs text-slate-400 dark:text-slate-500">
        Prices include direct network delivery. Safe payment processed securely via Paystack.
      </p>

      {/* ========================================================================= */}
      {/* STOREFRONT CHECKOUT POPUP MODAL                                           */}
      {/* ========================================================================= */}
      {modalOpen && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          {/* Backdrop with blur */}
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
            onClick={closeCheckout}
            aria-hidden="true"
          />

          {/* Modal Container */}
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkout-modal-title"
            className="relative z-10 w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-2xl dark:border-white/10 dark:bg-[#111a2c] animate-in zoom-in-95 duration-200"
          >
            {/* Ambient decorative glow */}
            <div className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-yellow-400/20 blur-3xl dark:bg-yellow-400/10" />
            <div className="pointer-events-none absolute -bottom-20 -left-20 h-48 w-48 rounded-full bg-emerald-400/15 blur-3xl dark:bg-emerald-400/10" />

            {/* Modal Header */}
            <div className="relative flex items-center justify-between border-b border-slate-100 p-5 sm:p-6 dark:border-white/5">
              <div className="flex items-center gap-3">
                {network && (
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl ${brand?.tile ?? "bg-yellow-400 text-slate-900"} shadow-sm`}
                  >
                    <NetworkLogo network={network} className="h-full w-full" />
                  </div>
                )}
                <div>
                  <h3
                    id="checkout-modal-title"
                    className="font-serif text-lg font-bold text-slate-900 sm:text-xl dark:text-white"
                  >
                    Complete Your Order
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {storeName ? `${storeName} · ` : ""}Instant MoMo checkout
                  </p>
                </div>
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={closeCheckout}
                disabled={busy}
                className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 dark:hover:bg-white/10 dark:hover:text-slate-200 cursor-pointer"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleBuy} className="p-5 sm:p-6 space-y-4">
              {/* Selected Package Banner + Quick Size Switcher */}
              <div className="rounded-2xl border border-yellow-200/80 bg-gradient-to-r from-yellow-50/80 to-amber-50/50 p-3.5 dark:border-yellow-500/20 dark:from-yellow-500/10 dark:to-amber-500/5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-yellow-700 dark:text-yellow-400">
                      Selected Package
                    </span>
                    <p className="font-extrabold text-base text-slate-900 dark:text-white">
                      {brand?.label ? `${brand.label} ` : ""}
                      {selected.gbAmount}GB Bundle
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 block">
                      Price
                    </span>
                    <span className="font-black text-lg text-slate-900 dark:text-white">
                      ₵{selected.price.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Quick Switcher dropdown if multiple packages */}
                {products.length > 1 && (
                  <div className="mt-2.5 pt-2 border-t border-yellow-200/50 dark:border-white/5 flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-400 font-medium">
                      Want a different size?
                    </span>
                    <select
                      value={selected.packageId}
                      disabled={busy}
                      onChange={(e) => {
                        const next = products.find((p) => p.packageId === e.target.value);
                        if (next) setSelected(next);
                      }}
                      className="rounded-lg border border-slate-200 bg-white/90 px-2 py-1 text-xs font-semibold text-slate-800 shadow-xs outline-none focus:border-yellow-400 dark:border-white/10 dark:bg-slate-800 dark:text-white cursor-pointer"
                    >
                      {products.map((p) => (
                        <option key={p.packageId} value={p.packageId}>
                          {p.gbAmount}GB — ₵{p.price.toFixed(2)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Beneficiary Phone Number */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="popup-beneficiary"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                  >
                    Recipient Phone Number <span className="text-red-500">*</span>
                  </label>
                  {phone && (
                    <span
                      className={`text-[11px] font-semibold ${
                        phoneValid
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-amber-600 dark:text-amber-400"
                      }`}
                    >
                      {phoneValid ? "Valid 10-digit number" : `${phone.length}/10 digits`}
                    </span>
                  )}
                </div>

                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                    <Smartphone className="h-4 w-4" />
                  </div>
                  <input
                    ref={phoneInputRef}
                    id="popup-beneficiary"
                    type="tel"
                    inputMode="numeric"
                    disabled={busy}
                    value={phone}
                    onChange={(e) =>
                      setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                    }
                    placeholder="0XXXXXXXXX (e.g. 0241234567)"
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-10 text-base font-semibold tracking-wider text-slate-900 outline-none transition-colors placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20 caret-yellow-500 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-slate-500 dark:caret-yellow-400"
                    required
                  />
                  {phoneValid && (
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-emerald-500">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Data will be loaded directly onto this number.
                </p>
              </div>

              {/* Receipt Email Address */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="popup-receipt-email"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                  >
                    Email Address (Payment Receipt) <span className="text-red-500">*</span>
                  </label>
                  {email && emailValid && (
                    <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      Receipt email valid
                    </span>
                  )}
                </div>

                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                    <Mail className="h-4 w-4" />
                  </div>
                  <input
                    id="popup-receipt-email"
                    type="email"
                    autoComplete="email"
                    disabled={busy}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-10 text-base text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20 caret-yellow-500 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-slate-500 dark:caret-yellow-400"
                    required
                  />
                  {emailValid && (
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-emerald-500">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Your Paystack payment receipt &amp; order tracking link will be sent here.
                </p>
              </div>

              {/* Error Message */}
              {error && (
                <div className="flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300 animate-in fade-in duration-150">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                  <p className="leading-relaxed font-medium">{error}</p>
                </div>
              )}

              {/* Transparent Fee & Total Breakdown */}
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3.5 text-xs space-y-1.5 dark:border-white/10 dark:bg-white/5">
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>{selected.gbAmount}GB Bundle Price:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    ₵{selected.price.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Paystack Processing Fee (2%):</span>
                  <span className="font-medium text-amber-600 dark:text-amber-400">
                    +₵{fee.toFixed(2)}
                  </span>
                </div>
                <div className="border-t border-slate-200/80 pt-2 flex items-center justify-between text-sm font-bold text-slate-900 dark:text-white">
                  <span>Total Amount to Pay:</span>
                  <span className="text-base font-black text-yellow-600 dark:text-yellow-400">
                    ₵{total.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={busy || !phoneValid || !emailValid}
                className="h-13 w-full rounded-full bg-yellow-300 text-sm font-extrabold tracking-wide text-slate-900 shadow-lg shadow-yellow-400/25 transition-all hover:bg-yellow-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer"
                style={{ height: 52 }}
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Connecting to Paystack…</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4 text-slate-900" />
                    <span>Pay ₵{total.toFixed(2)} with MoMo</span>
                  </>
                )}
              </button>

              {/* Trust & Guarantee Info */}
              <div className="pt-1 text-center space-y-1">
                <p className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center justify-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Secured by Paystack · Accepts MoMo &amp; Cards</span>
                </p>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

