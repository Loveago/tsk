import Link from "next/link";
import { notFound } from "next/navigation";
import { ShoppingBag, Clock, ShieldCheck, Zap, Wallet } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { fromPesewas } from "@/lib/storefront";
import { NetworkLogo } from "@/components/store/network-logo";
import { NetworkWheel } from "@/components/store/network-wheel";
import { NETWORK_BRANDS, NETWORK_ORDER, ghs, networkHref, storeHref } from "@/components/store/brands";
import { TrackForm } from "./track/track-form";
import type { NetworkProvider } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PublicStorePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ payment?: string; reference?: string }>;
}) {
  const { slug } = await params;
  const { payment, reference } = await searchParams;

  const [storefront, featureSetting] = await Promise.all([
    prisma.storefront.findUnique({ where: { slug } }),
    prisma.systemSetting.findUnique({ where: { key: "storefront_feature_enabled" } }),
  ]);
  if (!storefront || storefront.status !== "ENABLED") notFound();
  if (featureSetting?.value === "false") {
    return (
      <div className="mx-auto mt-20 max-w-md p-8 text-center bg-white rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Storefronts Temporarily Paused</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Reseller storefront orders are currently paused by administration for scheduled maintenance. Please check back soon.
        </p>
      </div>
    );
  }

  if (!storefront.isActive) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 sm:p-12 shadow-sm dark:border-slate-800 dark:bg-[#111a2c]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-500/15">
            <Clock className="h-8 w-8 text-amber-600 dark:text-amber-400" />
          </div>
          <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            Store Taking a Break
          </span>
          <h1 className="mt-4 font-serif text-3xl font-bold text-slate-900 sm:text-4xl dark:text-white">
            {storefront.name} is Temporarily Paused
          </h1>
          <p className="mt-3 text-sm text-slate-600 sm:text-base dark:text-slate-300">
            {storefront.description || "The store owner has temporarily paused new orders. Please check back shortly."}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={storeHref(slug, "track")}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-yellow-300 px-6 text-sm font-bold text-slate-900 shadow-md shadow-yellow-400/20 transition-colors hover:bg-yellow-400"
            >
              <Clock className="h-4 w-4" />
              Track existing order
            </Link>
            {storefront.whatsapp && (
              <a
                href={`https://wa.me/233${storefront.whatsapp.replace(/^0/, "").replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-6 text-sm font-bold text-slate-900 shadow-sm ring-1 ring-slate-900/10 transition-colors hover:bg-slate-50 dark:bg-white/10 dark:text-white dark:ring-white/10 dark:hover:bg-white/15"
              >
                Chat on WhatsApp
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  const products = await prisma.storefrontProduct.findMany({
    where: { storefrontId: storefront.id, isActive: true, dataPackage: { active: true } },
    include: { dataPackage: true },
  });

  const groups = NETWORK_ORDER.map((network) => {
    const items = products.filter((p) => p.dataPackage.network === network);
    if (items.length === 0) return null;
    return {
      network: network as NetworkProvider,
      count: items.length,
      min: Math.min(...items.map((p) => fromPesewas(p.sellingPrice))),
    };
  }).filter((g): g is NonNullable<typeof g> => g !== null);

  return (
    <div className="pb-4">
      {payment && (
        <div className="mx-auto mt-6 max-w-6xl px-4">
          <div
            className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
              payment === "success"
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"
            }`}
          >
            {payment === "success"
              ? `Payment received! Your bundle will be delivered to the number you entered shortly.${reference ? ` (Ref: ${reference})` : ""}`
              : "Payment was not completed. If you were debited, contact support with your reference."}
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-10 pt-8 lg:grid-cols-2 lg:pt-12">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-900/5 dark:bg-white/10 dark:text-slate-200 dark:ring-white/10">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {storefront.name} — trusted data marketplace
          </span>
          <h1 className="mt-4 font-serif text-4xl font-bold leading-tight text-slate-900 sm:text-5xl lg:text-6xl dark:text-white">
            Instant Data Bundles,{" "}
            <span className="text-yellow-500">Delivered Reliably</span>
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-slate-600 sm:text-base dark:text-slate-300">
            Select your network below to view available packages and checkout instantly with MoMo.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a
              href="#shop"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-yellow-300 px-6 text-sm font-bold text-slate-900 shadow-md shadow-yellow-400/20 transition-all hover:bg-yellow-400 hover:scale-105 active:scale-95"
            >
              <ShoppingBag className="h-4 w-4" />
              Buy Now
            </a>
            <a
              href="#track"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-6 text-sm font-bold text-slate-900 shadow-sm ring-1 ring-slate-900/10 transition-all hover:bg-slate-50 hover:scale-105 active:scale-95 dark:bg-white/10 dark:text-white dark:ring-white/10 dark:hover:bg-white/15"
            >
              <Clock className="h-4 w-4 text-yellow-500" />
              Track your order
            </a>
            {storefront.whatsapp && (
              <a
                href={`https://wa.me/233${storefront.whatsapp.replace(/^0/, "").replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-6 text-sm font-bold text-slate-900 shadow-sm ring-1 ring-slate-900/10 transition-colors hover:bg-slate-50 dark:bg-white/10 dark:text-white dark:ring-white/10 dark:hover:bg-white/15"
              >
                Chat on WhatsApp
              </a>
            )}
          </div>
        </div>

        {/* Spinning network wheel */}
        <NetworkWheel slug={slug} storeName={storefront.name} networks={groups.map((g) => g.network)} />
      </section>

      {/* Shop grid */}
      <section id="shop" className="mx-auto max-w-6xl scroll-mt-24 px-4 pb-12">
        {groups.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-white/5">
            This store has no bundles on sale right now. Check back soon.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {groups.map((g) => {
              const brand = NETWORK_BRANDS[g.network];
              return (
                <Link
                  key={g.network}
                  href={networkHref(slug, g.network)}
                  className="group rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-900/5 transition-shadow hover:shadow-lg sm:rounded-3xl sm:p-3 dark:bg-[#111a2c] dark:ring-white/10"
                >
                  <div className={`aspect-square overflow-hidden rounded-xl sm:rounded-2xl ${brand.tile}`}>
                    <NetworkLogo network={g.network} className="h-full w-full" />
                  </div>
                  <div className="px-1 pb-1 pt-2 sm:px-2 sm:pb-2 sm:pt-3">
                    <p className="font-serif text-sm font-bold text-slate-900 sm:text-base dark:text-white">{brand.label}</p>
                    <div className="mt-1 flex items-center justify-between">
                      <p className="text-[11px] leading-tight text-slate-500 sm:text-xs dark:text-slate-400">
                        From {ghs(g.min)} · {g.count} bundle{g.count === 1 ? "" : "s"}
                      </p>
                      <span className="text-xs font-bold text-yellow-500 transition-transform group-hover:translate-x-0.5 sm:text-sm">
                        Buy →
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Dedicated Order Tracking Section */}
      <section id="track" className="mx-auto max-w-4xl scroll-mt-24 px-4 pb-14">
        <div className="relative overflow-hidden rounded-3xl border border-slate-200/90 bg-white/85 p-6 sm:p-10 shadow-xl shadow-slate-200/40 backdrop-blur-md dark:border-white/10 dark:bg-[#111a2c]/85 dark:shadow-none">
          {/* Ambient decorative glow */}
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-yellow-400/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-emerald-400/15 blur-3xl" />

          <div className="relative z-10 mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-yellow-400/40 bg-yellow-400/10 px-3.5 py-1.5 text-xs font-bold text-yellow-700 dark:text-yellow-400">
              <Clock className="h-3.5 w-3.5 text-yellow-500" />
              Live Order Tracking
            </span>
            <h2 className="mt-3 font-serif text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
              Track Your Bundle Order
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 sm:text-base dark:text-slate-300">
              Enter your recipient phone number, receipt email, or Paystack order reference below to check real-time delivery status.
            </p>
          </div>

          <div className="relative z-10 mx-auto mt-8 max-w-xl">
            <TrackForm slug={slug} />
          </div>
        </div>
      </section>

      {/* Bottom info section */}
      <section className="mx-auto max-w-4xl px-4 pb-12 pt-4">
        <div className="rounded-3xl border border-slate-200/80 bg-white/70 p-8 sm:p-12 text-center backdrop-blur-sm shadow-sm dark:border-slate-800 dark:bg-[#111a2c]/70">
          <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-900/5 dark:bg-white/10 dark:text-slate-200 dark:ring-white/10">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {storefront.name} — trusted data marketplace
          </span>
          <h2 className="mt-5 font-serif text-3xl font-bold leading-tight text-slate-900 sm:text-4xl lg:text-5xl dark:text-white">
            Buy data for any number,{" "}
            <span className="block text-yellow-500">delivered reliably</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base dark:text-slate-300">
            {storefront.description ||
              "Secure MoMo checkout, reliable delivery across major networks, and bundles priced for everyday use. Timing can vary by network availability and number verification."}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <a
              href="#shop"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-yellow-300 px-6 text-sm font-bold text-slate-900 shadow-md shadow-yellow-400/20 transition-colors hover:bg-yellow-400"
            >
              <ShoppingBag className="h-4 w-4" />
              Buy bundles
            </a>
            <a
              href="#track"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-6 text-sm font-bold text-slate-900 shadow-sm ring-1 ring-slate-900/5 transition-colors hover:bg-slate-50 dark:bg-white/10 dark:text-white dark:ring-white/10 dark:hover:bg-white/15"
            >
              <Clock className="h-4 w-4" />
              Track your order
            </a>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {[
              { icon: Zap, label: "Reliable delivery" },
              { icon: Wallet, label: "MoMo & wallet" },
              { icon: ShieldCheck, label: "Secure checkout" },
            ].map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-900/5 dark:bg-white/10 dark:text-slate-200 dark:ring-white/10"
              >
                <Icon className="h-3.5 w-3.5 text-yellow-500" />
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}
