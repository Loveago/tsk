"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Compass,
  ArrowRight,
  Store,
  Search,
  Sparkles,
  ShieldCheck,
  Zap,
  TrendingUp,
  ExternalLink,
} from "lucide-react";

export default function StorefrontIndexPage() {
  const router = useRouter();
  const [slugInput, setSlugInput] = useState("");
  const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN || "tsk05.net";

  function handleGoToStore(e: React.FormEvent) {
    e.preventDefault();
    const clean = slugInput.trim().toLowerCase().replace(/^@/, "");
    if (clean) {
      router.push(`/${clean}`);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-violet-500 selection:text-white">
      {/* Background ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-gradient-to-tr from-violet-600/20 via-fuchsia-600/15 to-transparent blur-3xl opacity-70" />
      </div>

      {/* Top navigation */}
      <header className="relative z-10 border-b border-white/10 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-white font-bold shadow-lg shadow-violet-600/30">
              <Store className="h-5 w-5" />
            </span>
            <span className="font-bold tracking-tight text-lg text-white">
              tskstore<span className="text-violet-400">.net</span>
            </span>
          </div>
          <a
            href={`https://${mainDomain}/login`}
            className="text-xs font-semibold text-slate-400 hover:text-white transition flex items-center gap-1.5"
          >
            Store Owner Portal
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </header>

      {/* Hero section */}
      <main className="relative z-10 max-w-4xl mx-auto px-6 py-16 text-center space-y-10 my-auto">
        {/* Playful Inquisitive Badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-1.5 text-xs font-medium text-violet-300">
          <Compass className="h-3.5 w-3.5 animate-spin text-violet-400" />
          Well, look who&apos;s inquisitive! 👀
        </div>

        <div className="space-y-4">
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
            Looking for something specific, <br />
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-300 to-pink-400 bg-clip-text text-transparent">
              or just exploring?
            </span>
          </h1>
          <p className="text-slate-400 text-base sm:text-lg max-w-2xl mx-auto">
            You&apos;ve landed on the engine behind Ghana&apos;s independent telecom reseller storefronts.
            Every store on <span className="text-violet-300 font-semibold">tskstore.net</span> is
            independently owned and powered by verified local entrepreneurs.
          </p>
        </div>

        {/* Quick Store Lookup Form */}
        <div className="max-w-xl mx-auto">
          <form
            onSubmit={handleGoToStore}
            className="flex flex-col sm:flex-row items-stretch gap-2 bg-slate-900/90 border border-white/10 rounded-2xl p-2 shadow-2xl backdrop-blur-md focus-within:border-violet-500/60 transition"
          >
            <div className="flex items-center flex-1 px-3 text-slate-400 text-sm">
              <span className="font-semibold text-slate-500 select-none mr-1">
                tskstore.net/
              </span>
              <input
                type="text"
                value={slugInput}
                onChange={(e) => setSlugInput(e.target.value)}
                placeholder="enter-store-slug"
                className="w-full bg-transparent text-white placeholder:text-slate-600 focus:outline-none text-sm font-medium"
                required
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 active:scale-[0.98] transition px-6 py-3 font-semibold text-sm text-white shadow-lg shadow-violet-600/30"
            >
              Visit Store
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
          <p className="text-xs text-slate-500 mt-2">
            Have a store link from someone? Type their name above to shop their packages.
          </p>
        </div>

        {/* Action Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left pt-6 max-w-3xl mx-auto">
          {/* Card 1: Track existing order */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 space-y-3 hover:border-violet-500/40 transition">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400">
              <Search className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-white">Already placed an order?</h3>
            <p className="text-sm text-slate-400">
              Tracking your bundle delivery status or looking for a payment receipt? If you know the store name, jump straight to their tracking page.
            </p>
            <div className="pt-2">
              <span className="text-xs text-slate-500 font-mono">
                Hint: tskstore.net/[store-name]/track
              </span>
            </div>
          </div>

          {/* Card 2: Create your own store CTA */}
          <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-950/40 via-slate-900/60 to-slate-900/60 p-6 space-y-3 hover:border-violet-500/50 transition">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/20 text-violet-300">
              <Sparkles className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-white">Want your own reseller storefront?</h3>
            <p className="text-sm text-slate-400">
              Sell MTN, Telecel, and AirtelTigo data bundles at your own retail prices and earn instant commissions into your mobile money wallet.
            </p>
            <div className="pt-2">
              <a
                href={`https://${mainDomain}/register`}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-400 hover:text-violet-300 underline underline-offset-4"
              >
                Launch your store on {mainDomain}
                <ArrowRight className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 py-6 text-center text-xs text-slate-600">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© {new Date().getFullYear()} tskstore.net. Platform infrastructure by Tskconnect.</p>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1 text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Storefront Gateway Live
            </span>
            <a href={`https://${mainDomain}`} className="hover:text-slate-400 transition">
              {mainDomain}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
