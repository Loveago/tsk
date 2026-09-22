"use client";

import * as React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  ShoppingBag,
  Clock,
  Menu as MenuIcon,
  X,
  ChevronRight,
  Home,
  RotateCcw,
  ChevronDown,
  UserRound,
  Send,
} from "lucide-react";
import { NetworkLogo } from "./network-logo";
import { NETWORK_BRANDS, networkHref, storeHref } from "./brands";
import type { NetworkProvider } from "@/lib/types";

export interface StoreChromeProps {
  name: string;
  slug: string;
  description?: string | null;
  logoUrl?: string | null;
  whatsapp?: string | null;
  whatsappGroupLink?: string | null;
  email?: string | null;
  location?: string | null;
  contactText?: string | null;
  whatsappLabel?: string | null;
  notice?: string | null;
  networks: NetworkProvider[];
  children: React.ReactNode;
}

function whatsappLink(number: string | null | undefined, text?: string): string | null {
  if (!number) return null;
  const digits = number.replace(/\D/g, "");
  const intl = digits.startsWith("0") ? `233${digits.slice(1)}` : digits;
  return text ? `https://wa.me/${intl}?text=${encodeURIComponent(text)}` : `https://wa.me/${intl}`;
}

/** Official-style WhatsApp glyph (not in lucide). */
export function WhatsAppIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.1-.198.05-.371-.025-.52-.074-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

/**
 * Floating WhatsApp contact bubble (bottom-right, all store pages). Uses the
 * owner-editable contact text as its expanding label (§11).
 */
function WhatsAppBubble({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="group fixed bottom-5 right-5 z-50 flex items-center gap-0 rounded-full bg-[#25D366] p-4 text-white shadow-xl shadow-emerald-900/25 transition-all hover:shadow-2xl sm:bottom-6 sm:right-6"
    >
      <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-[#25D366] opacity-20 [animation-duration:2.5s]" />
      <WhatsAppIcon className="relative h-6 w-6" />
      <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-bold opacity-0 transition-all duration-300 group-hover:max-w-56 group-hover:pl-2 group-hover:opacity-100">
        {label}
      </span>
    </a>
  );
}

/** Small round brand logo used in menus/lists. */
function BrandDot({ network }: { network: NetworkProvider }) {
  return (
    <span
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full ${NETWORK_BRANDS[network].tile}`}
    >
      <NetworkLogo network={network} className="h-full w-full" />
    </span>
  );
}

/** Light/dark appearance switch styled like the screenshots' pill toggle. */
function AppearanceToggle({ className = "" }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <button
      type="button"
      aria-label="Toggle dark mode"
      onClick={() => setTheme(dark ? "light" : "dark")}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-slate-200 transition-colors dark:bg-slate-700 ${className}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${dark ? "translate-x-6" : "translate-x-1"}`}
      />
    </button>
  );
}

function StoreMark({
  name,
  logoUrl,
  size = "h-9 w-9",
}: {
  name: string;
  logoUrl?: string | null;
  size?: string;
}) {
  return (
    <span
      className={`inline-flex ${size} shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-900 ring-2 ring-white dark:ring-slate-800`}
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span className="text-sm font-black text-white">{name.slice(0, 2).toUpperCase()}</span>
      )}
    </span>
  );
}

export function StoreChrome(props: StoreChromeProps) {
  const {
    name,
    slug,
    description,
    logoUrl,
    whatsapp,
    whatsappGroupLink,
    email,
    location,
    contactText,
    whatsappLabel,
    notice,
    networks,
    children,
  } = props;
  const [shopOpen, setShopOpen] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [promoVisible, setPromoVisible] = React.useState(true);
  const [chatBoxOpen, setChatBoxOpen] = React.useState(false);
  const [chatMessage, setChatMessage] = React.useState("");

  // Direct clean admin WhatsApp link (no pre-written message)
  const wa = whatsappLink(whatsapp);

  // WhatsApp Channel link: uses configured group link or falls back to admin WhatsApp
  const channelUrl = whatsappGroupLink || wa;
  const bannerText = (notice?.trim()) || "🔥 Secure MoMo checkout — bundles delivered to any number, reliably.";

  return (
    <div className="min-h-screen bg-[#e9ebf5] dark:bg-[#0a101e]">
      {/* Promo bar / Announcement banner */}
      {promoVisible && (
        <div
          className="banner-container relative bg-slate-950 px-10 py-2 text-center text-xs font-medium text-white overflow-hidden"
          role="region"
          aria-label="Store Announcement"
        >
          <div className="relative flex w-full overflow-hidden justify-center">
            <div className="animate-banner-slide py-0.5 text-xs sm:text-sm font-medium tracking-wide text-white">
              <span className="inline-flex items-center gap-2 px-6">
                <span className="rounded-full bg-yellow-400/20 border border-yellow-400/40 px-2 py-0.5 text-[10px] uppercase tracking-wider font-extrabold text-yellow-300">
                  Notice
                </span>
                <span>{bannerText}</span>
              </span>
            </div>
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setPromoVisible(false)}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 rounded-full p-1 bg-slate-950/80 backdrop-blur-xs text-white/60 hover:bg-white/15 hover:text-white transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Pill navigation */}
      <div className="sticky top-0 z-40 px-3 pt-3">
        <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between rounded-full bg-white pl-3 pr-2 shadow-lg shadow-slate-900/5 dark:bg-[#111a2c]">
          <Link href={storeHref(slug)} className="flex items-center gap-2.5">
            <StoreMark name={name} logoUrl={logoUrl} />
            <span className="font-serif text-lg font-bold text-slate-900 dark:text-white">{name}</span>
          </Link>

          {/* Desktop center links */}
          <div className="relative hidden items-center gap-1 md:flex">
            <button
              type="button"
              onClick={() => setShopOpen((v) => !v)}
              className={`flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10 ${shopOpen ? "bg-slate-100 dark:bg-white/10" : ""}`}
            >
              <ShoppingBag className="h-4 w-4" />
              Shop
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${shopOpen ? "rotate-180" : ""}`} />
            </button>
            <Link
              href={storeHref(slug, "track")}
              className="flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10"
            >
              <Clock className="h-4 w-4" />
              Track
            </Link>

            {shopOpen && (
              <>
                <button
                  type="button"
                  aria-label="Close shop menu"
                  className="fixed inset-0 z-10 cursor-default"
                  onClick={() => setShopOpen(false)}
                />
                <div className="absolute left-0 top-12 z-20 w-96 rounded-2xl bg-white p-4 shadow-2xl shadow-slate-900/10 ring-1 ring-slate-900/5 dark:bg-[#111a2c] dark:ring-white/10">
                  <div className="grid grid-cols-2 gap-1">
                    {networks.map((n) => (
                      <Link
                        key={n}
                        href={networkHref(slug, n)}
                        onClick={() => setShopOpen(false)}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/10"
                      >
                        <BrandDot network={n} />
                        {NETWORK_BRANDS[n].label}
                      </Link>
                    ))}
                    {networks.length === 0 && (
                      <p className="px-3 py-2 text-sm text-slate-500">No bundles on sale right now.</p>
                    )}
                  </div>
                  <div className="mt-2 border-t border-slate-100 pt-2 dark:border-white/10">
                    <Link href={storeHref(slug, "#shop")} onClick={() => setShopOpen(false)} className="block rounded-xl px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/10">
                      Advanced browse →
                    </Link>
                    <Link href={storeHref(slug, "#track")} onClick={() => setShopOpen(false)} className="block rounded-xl px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/10">
                      Track an order →
                    </Link>
                    {wa && (
                      <a href={wa} target="_blank" rel="noopener noreferrer" className="block rounded-xl px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/10">
                        AFA registration & help →
                      </a>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <AppearanceToggle className="mx-1 hidden sm:inline-flex" />
            <button type="button" onClick={() => setDrawerOpen(true)} className="flex h-10 items-center gap-2 rounded-full border border-slate-200 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-white/15 dark:text-white dark:hover:bg-white/10">
              <MenuIcon className="h-4 w-4" />
              Menu
            </button>
          </div>
        </nav>
      </div>

      <main>{children}</main>

      {/* Footer */}
      <footer className="mt-16 px-4 pb-10">
        <div className="mx-auto max-w-6xl rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-900/5 sm:p-10 dark:bg-[#111a2c] dark:ring-white/10">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <div className="flex items-center gap-2.5">
                <StoreMark name={name} logoUrl={logoUrl} />
                <span className="font-serif text-xl font-bold text-slate-900 dark:text-white">{name}</span>
              </div>
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                {description || "Buy data with reliable delivery"}
              </p>
              {location && <p className="mt-2 text-xs text-slate-400">{location}</p>}
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-yellow-500">Shop</p>
              <ul className="mt-4 space-y-2.5">
                {networks.map((n) => (
                  <li key={n}>
                    <Link
                      href={networkHref(slug, n)}
                      className="flex items-center gap-3 text-sm font-medium text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
                    >
                      <BrandDot network={n} />
                      {NETWORK_BRANDS[n].label}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    href={storeHref(slug, "#shop")}
                    className="block text-sm font-medium text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
                  >
                    Browse all packages →
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-yellow-500">Company</p>
              <ul className="mt-4 space-y-2.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                <li>
                  <Link href={storeHref(slug, "#track")} className="hover:text-slate-950 dark:hover:text-white">
                    Track Order
                  </Link>
                </li>
                {wa && (
                  <li>
                    <a href={wa} target="_blank" rel="noopener noreferrer" className="hover:text-slate-950 dark:hover:text-white">
                      WhatsApp support
                    </a>
                  </li>
                )}
                {email && (
                  <li>
                    <a href={`mailto:${email}`} className="hover:text-slate-950 dark:hover:text-white">
                      {email}
                    </a>
                  </li>
                )}
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col gap-2 border-t border-slate-100 pt-6 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between dark:border-white/10">
            <p>
              {name} © {new Date().getFullYear()}
            </p>
            <p>Secure Mobile Money checkout</p>
          </div>
        </div>
      </footer>

      {/* Floating support buttons & Admin Chat Box */}
      <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
        {/* Admin Chat Box Popup */}
        {chatBoxOpen && (
          <div
            role="dialog"
            aria-label="Chat with Admin"
            className="w-[calc(100vw-2.5rem)] sm:w-88 md:w-96 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xl transition-all duration-200 animate-in fade-in zoom-in-95 dark:border-white/10 dark:bg-[#111a2c]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <div className="flex items-center gap-2.5">
                <StoreMark name={name} logoUrl={logoUrl} size="h-8 w-8" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Chat with Admin
                  </h3>
                  <p className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Direct support for {name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close chat box"
                onClick={() => setChatBoxOpen(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Prompt Notice: Go straight to the point */}
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/80 p-2.5 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <div className="flex items-start gap-2">
                <span className="text-sm">⚡</span>
                <div>
                  <p className="font-bold">Go straight to the point</p>
                  <p className="text-[11px] text-amber-800 dark:text-amber-300">
                    Please state your question, complaint, or order reference directly so we can assist you quickly.
                  </p>
                </div>
              </div>
            </div>

            {/* Input Form: No pre-written message */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = chatMessage.trim();
                const target = trimmed ? whatsappLink(whatsapp, trimmed) : wa;
                if (target) {
                  window.open(target, "_blank", "noopener,noreferrer");
                  setChatBoxOpen(false);
                  setChatMessage("");
                }
              }}
              className="mt-3 space-y-3"
            >
              <textarea
                rows={3}
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                placeholder="Type your message here..."
                autoFocus
                className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-amber-400"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                  Opens directly in WhatsApp
                </span>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-600 px-4 py-2 text-xs font-bold text-slate-950 shadow-md shadow-amber-500/20 transition-all hover:from-yellow-400 hover:to-amber-500 hover:scale-[1.02] active:scale-95"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Send to Admin</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Floating buttons stack: Chat icon & WhatsApp bubble */}
        <div className="flex flex-col gap-2.5 items-end">
          {/* Button 1: Chat icon leading to Admin Chat Box */}
          {wa && (
            <button
              type="button"
              aria-label="Chat with Admin"
              onClick={() => setChatBoxOpen((v) => !v)}
              className="group relative flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-yellow-500 via-amber-600 to-yellow-700 text-white shadow-lg shadow-amber-900/25 transition-all hover:scale-105 active:scale-95"
            >
              {chatBoxOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <svg viewBox="0 0 24 24" className="h-6 w-6 fill-white">
                  <path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
                  <circle cx="8.5" cy="10.5" r="1" fill="#7c5e00" />
                  <circle cx="12" cy="10.5" r="1" fill="#7c5e00" />
                  <circle cx="15.5" cy="10.5" r="1" fill="#7c5e00" />
                </svg>
              )}
              <span className="pointer-events-none absolute right-full mr-2.5 hidden whitespace-nowrap rounded-lg bg-slate-900/90 px-2.5 py-1 text-xs font-semibold text-white shadow-md backdrop-blur-xs sm:group-hover:inline-block">
                {chatBoxOpen ? "Close chat" : "Chat with Admin"}
              </span>
            </button>
          )}

          {/* Button 2: WhatsApp bubble leading to WhatsApp Channel */}
          {channelUrl && (
            <a
              href={channelUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="WhatsApp Channel"
              className="group relative flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-emerald-900/25 transition-all hover:scale-105 active:scale-95"
            >
              <WhatsAppIcon className="h-6 w-6" />
              <span className="pointer-events-none absolute right-full mr-2.5 hidden whitespace-nowrap rounded-lg bg-slate-900/90 px-2.5 py-1 text-xs font-semibold text-white shadow-md backdrop-blur-xs sm:group-hover:inline-block">
                Join WhatsApp Channel
              </span>
            </a>
          )}
        </div>
      </div>

      {/* Mobile / menu drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute right-0 top-0 flex h-full w-[88%] max-w-sm flex-col overflow-y-auto bg-white shadow-2xl dark:bg-[#111a2c]">
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="font-serif text-xl font-bold text-slate-900 dark:text-white">Menu</h2>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setDrawerOpen(false)}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-4">
              <div className="flex items-center gap-3 rounded-2xl bg-yellow-300 p-4 text-slate-900">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/80">
                  <UserRound className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">Storefront Customer</p>
                  <p className="text-xs opacity-75">Instant MoMo checkout & delivery</p>
                </div>
                <ChevronRight className="h-4 w-4" />
              </div>
            </div>

            <p className="px-6 pb-1 pt-6 text-[11px] font-bold uppercase tracking-widest text-slate-400">Main</p>
            <nav className="px-4">
              <Link
                href={storeHref(slug)}
                onClick={() => setDrawerOpen(false)}
                className="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-100 dark:text-white dark:hover:bg-white/10"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-yellow-300">
                  <Home className="h-4 w-4 text-slate-900" />
                </span>
                Home
                <ChevronRight className="ml-auto h-4 w-4 text-slate-300" />
              </Link>
              <Link
                href={storeHref(slug, "#track")}
                onClick={() => setDrawerOpen(false)}
                className="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-100 dark:text-white dark:hover:bg-white/10"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-yellow-300">
                  <Clock className="h-4 w-4 text-slate-900" />
                </span>
                Track Orders
                <ChevronRight className="ml-auto h-4 w-4 text-slate-300" />
              </Link>
              {wa && (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-100 dark:text-white dark:hover:bg-white/10"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-yellow-300">
                    <RotateCcw className="h-4 w-4 text-slate-900" />
                  </span>
                  Request Refund
                  <ChevronRight className="ml-auto h-4 w-4 text-slate-300" />
                </a>
              )}
            </nav>

            <p className="px-6 pb-1 pt-6 text-[11px] font-bold uppercase tracking-widest text-slate-400">Buy data</p>
            <nav className="px-4">
              {networks.map((n) => (
                <Link
                  key={n}
                  href={networkHref(slug, n)}
                  onClick={() => setDrawerOpen(false)}
                  className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-100 dark:text-white dark:hover:bg-white/10"
                >
                  <BrandDot network={n} />
                  {NETWORK_BRANDS[n].label}
                  <ChevronRight className="ml-auto h-4 w-4 text-slate-300" />
                </Link>
              ))}
              {networks.length === 0 && <p className="px-3 py-2 text-sm text-slate-500">No bundles on sale right now.</p>}
            </nav>

            <div className="mt-auto space-y-3 px-4 pb-6 pt-8">
              <div className="flex items-center justify-between rounded-2xl px-3 py-2">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Appearance</span>
                <AppearanceToggle />
              </div>
              {wa && (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full rounded-full border border-slate-200 py-3 text-center text-sm font-bold text-slate-800 hover:bg-slate-50 dark:border-white/15 dark:text-white dark:hover:bg-white/10"
                >
                  {whatsappLabel || "Need help?"}
                </a>
              )}
              <div className="flex items-center justify-between px-3 text-xs text-slate-400">
                <span>Secure Checkout</span>
                <span>
                  {name} © {new Date().getFullYear()}
                </span>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

