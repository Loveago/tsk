"use client";

import * as React from "react";
import Link from "next/link";
import {
  Sparkles,
  CalendarCheck,
  Cloud,
  FileText,
  Cpu,
  Zap,
  KeyRound,
  ShieldCheck,
  Phone,
  Mail,
  Loader2,
  CheckCircle2,
  Lock,
  ArrowRight,
  HelpCircle,
  Clock,
  ArrowLeft,
} from "lucide-react";
import { GEMINI_PRO_PERKS, GeminiPerk } from "@/lib/gemini-pro-constants";

interface GeminiBuyFormProps {
  slug: string;
  storeName: string;
  price: number;
}

const ICON_MAP: Record<string, React.ElementType> = {
  CalendarCheck,
  Sparkles,
  Cloud,
  FileText,
  Cpu,
  Zap,
  KeyRound,
};

export function GeminiBuyForm({ slug, storeName, price }: GeminiBuyFormProps) {
  const [email, setEmail] = React.useState("");
  const [whatsapp, setWhatsapp] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  // Restore saved details from local storage
  React.useEffect(() => {
    try {
      const savedEmail = localStorage.getItem("storefront_customer_email");
      if (savedEmail) setEmail(savedEmail);
      const savedPhone = localStorage.getItem("storefront_customer_phone");
      if (savedPhone) setWhatsapp(savedPhone);
    } catch {
      // ignore
    }
  }, []);

  const feeGhs = Math.round(price * 0.02 * 100) / 100;
  const totalGhs = Math.round((price + feeGhs) * 100) / 100;

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const whatsappValid = whatsapp.trim().length >= 9;

  async function handleCheckout(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!emailValid) {
      setError("Please provide a valid email address for your order receipt.");
      return;
    }

    if (!whatsappValid) {
      setError("Please enter your valid WhatsApp phone number so admin can deliver your activation link.");
      return;
    }

    setBusy(true);

    try {
      try {
        localStorage.setItem("storefront_customer_email", email.trim().toLowerCase());
        localStorage.setItem("storefront_customer_phone", whatsapp.trim());
      } catch {
        // ignore
      }

      const res = await fetch(`/api/store/${slug}/gemini/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerEmail: email.trim().toLowerCase(),
          customerWhatsapp: whatsapp.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to initialize payment");
      }

      // Redirect to Paystack
      window.location.href = data.authorizationUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment initialization failed. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      {/* Back button */}
      <div className="mb-6">
        <Link
          href={`/store/${slug}`}
          className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-900/5 backdrop-blur-sm transition hover:bg-white dark:bg-white/10 dark:text-slate-200 dark:ring-white/10 dark:hover:bg-white/15"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Store
        </Link>
      </div>

      {/* Hero Badge & Title */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-purple-300/50 bg-gradient-to-r from-purple-500/10 via-indigo-500/10 to-pink-500/10 px-4 py-1.5 text-xs font-bold text-purple-700 dark:border-purple-500/30 dark:text-purple-300">
          <Sparkles className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400 animate-pulse" />
          Official 18-Month Activation Link
        </div>
        <h1 className="mt-4 font-serif text-3xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl dark:text-white">
          Google Gemini Pro <br />
          <span className="bg-gradient-to-r from-purple-600 via-indigo-500 to-pink-600 bg-clip-text text-transparent">
            18 Months Access
          </span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base dark:text-slate-300">
          Supercharge your intelligence, research, and workflows with 1.5 years of Google Gemini 1.5 Pro &amp; 2.0 Flash, 2TB Google One Cloud Storage, and full Google Workspace integration.
        </p>

        {/* Pricing Pill */}
        <div className="mt-6 inline-flex items-center gap-3 rounded-2xl bg-white px-5 py-3 shadow-md ring-1 ring-slate-900/5 dark:bg-[#111a2c] dark:ring-white/10">
          <div className="text-left">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              One-Time Payment
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-3xl font-black text-slate-900 dark:text-white">
                ₵{price.toFixed(2)}
              </span>
              <span className="text-xs font-bold text-purple-600 dark:text-purple-400">
                / 18 Months Total
              </span>
            </div>
          </div>
          <span className="rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
            Non-Recurring
          </span>
        </div>
      </div>

      {/* Main Grid: Perks on Left, Checkout Form on Right */}
      <div className="mt-12 grid gap-8 lg:grid-cols-12">
        {/* Left Column: Perks (7 cols) */}
        <div className="space-y-4 lg:col-span-7">
          <div className="flex items-center justify-between pb-2">
            <h2 className="font-serif text-xl font-bold text-slate-900 dark:text-white">
              What&apos;s Included In This Package
            </h2>
            <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">
              Full Suite Included
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {GEMINI_PRO_PERKS.map((perk, idx) => {
              const IconComp = ICON_MAP[perk.icon] || Sparkles;
              return (
                <div
                  key={idx}
                  className={`relative overflow-hidden rounded-2xl border p-4 transition-all hover:shadow-md ${
                    perk.highlight
                      ? "border-purple-300/80 bg-gradient-to-br from-purple-50/70 to-indigo-50/50 dark:border-purple-500/30 dark:from-purple-950/20 dark:to-indigo-950/20"
                      : "border-slate-200/90 bg-white/90 dark:border-white/10 dark:bg-[#111a2c]/90"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        perk.highlight
                          ? "bg-purple-600 text-white shadow-md shadow-purple-500/20"
                          : "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300"
                      }`}
                    >
                      <IconComp className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-serif text-sm font-bold text-slate-900 dark:text-white">
                        {perk.title}
                      </h3>
                      <p className="text-[11px] font-semibold text-purple-600 dark:text-purple-400">
                        {perk.subtitle}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                        {perk.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Guarantee card */}
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div>
                <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                  100% Genuine Activation Guarantee
                </p>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                  Direct official link sent to your WhatsApp &amp; Email. Simple 1-click activation to connect with your own Google account.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Checkout Card (5 cols) */}
        <div className="lg:col-span-5">
          <div className="sticky top-20 rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xl shadow-slate-200/40 backdrop-blur-md dark:border-white/10 dark:bg-[#111a2c] dark:shadow-none sm:p-8">
            <div className="border-b border-slate-100 pb-4 dark:border-white/10">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-100 px-3 py-1 text-xs font-bold text-purple-800 dark:bg-purple-500/20 dark:text-purple-300">
                <Sparkles className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                Instant Checkout
              </span>
              <h2 className="mt-2 font-serif text-2xl font-bold text-slate-900 dark:text-white">
                Get Your Activation Link
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Enter your details below. After payment, admin will send your 18-month link to your WhatsApp and email.
              </p>
            </div>

            <form onSubmit={handleCheckout} className="mt-5 space-y-4">
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                  {error}
                </div>
              )}

              {/* Email Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Recipient Email Address <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="yourname@gmail.com"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-purple-500 focus:bg-white focus:ring-2 focus:ring-purple-500/20 dark:border-slate-700 dark:bg-slate-900/50 dark:text-white dark:focus:border-purple-400"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Used for your Paystack receipt and backup delivery.
                </p>
              </div>

              {/* WhatsApp Phone Number */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  WhatsApp Phone Number <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="tel"
                    required
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="e.g. 0241234567"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-purple-500 focus:bg-white focus:ring-2 focus:ring-purple-500/20 dark:border-slate-700 dark:bg-slate-900/50 dark:text-white dark:focus:border-purple-400"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Admin will message and deliver your activation link to this WhatsApp number.
                </p>
              </div>

              {/* Price Breakdown */}
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs dark:border-white/5 dark:bg-white/5">
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Gemini Pro (18 Months)</span>
                  <span className="font-semibold text-slate-900 dark:text-white">₵{price.toFixed(2)}</span>
                </div>
                <div className="mt-1 flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Paystack processing (2%)</span>
                  <span>+₵{feeGhs.toFixed(2)}</span>
                </div>
                <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 font-bold text-slate-900 dark:border-white/10 dark:text-white">
                  <span>Total Payable</span>
                  <span className="text-sm font-black text-purple-700 dark:text-purple-300">
                    ₵{totalGhs.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={busy}
                className="group relative flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 py-3.5 px-6 text-sm font-bold text-white shadow-lg shadow-purple-600/30 transition-all hover:opacity-95 hover:shadow-purple-600/40 active:scale-[0.99] disabled:opacity-50 cursor-pointer"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Preparing Payment...</span>
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" />
                    <span>Pay ₵{totalGhs.toFixed(2)} with MoMo / Card</span>
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </button>

              <div className="flex items-center justify-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                <span>Secured by Paystack · MoMo &amp; Cards accepted</span>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* How it Works / FAQ Section */}
      <section className="mt-16 border-t border-slate-200 pt-10 dark:border-white/10">
        <div className="text-center">
          <span className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
            Simple 3-Step Process
          </span>
          <h2 className="mt-1 font-serif text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white">
            How It Works
          </h2>
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111a2c]">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-sm font-black text-purple-700 dark:bg-purple-500/20 dark:text-purple-300">
              1
            </div>
            <h3 className="mt-3 font-serif text-base font-bold text-slate-900 dark:text-white">
              Order &amp; Provide Details
            </h3>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Enter your email and WhatsApp number above and pay securely using Mobile Money or debit card.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111a2c]">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-sm font-black text-purple-700 dark:bg-purple-500/20 dark:text-purple-300">
              2
            </div>
            <h3 className="mt-3 font-serif text-base font-bold text-slate-900 dark:text-white">
              Admin Delivers Link
            </h3>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Our admin receives your order confirmation and sends your 18-month activation link directly to your WhatsApp.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111a2c]">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-sm font-black text-purple-700 dark:bg-purple-500/20 dark:text-purple-300">
              3
            </div>
            <h3 className="mt-3 font-serif text-base font-bold text-slate-900 dark:text-white">
              Instant 1-Click Activation
            </h3>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Open the link with your Google account. Your 18-month Gemini Pro status and 2TB cloud storage activate immediately!
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
