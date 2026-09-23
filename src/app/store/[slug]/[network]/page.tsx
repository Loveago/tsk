import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { fromPesewas } from "@/lib/storefront";
import { NetworkLogo } from "@/components/store/network-logo";
import { NETWORK_BRANDS, ghs, networkBySlug, storeHref } from "@/components/store/brands";
import { NetworkBuyForm } from "./buy-form";

export const dynamic = "force-dynamic";

export default async function NetworkPage({
  params,
}: {
  params: Promise<{ slug: string; network: string }>;
}) {
  const { slug, network: networkSlug } = await params;
  const network = networkBySlug(networkSlug);
  if (!network) notFound();

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
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-[#111a2c]">
          <h2 className="font-serif text-2xl font-bold text-slate-900 dark:text-white">Store Temporarily Paused</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {storefront.name} is not accepting new orders at this time.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href={storeHref(slug)}
              className="inline-flex h-10 items-center rounded-full bg-yellow-300 px-5 text-sm font-bold text-slate-900 transition-colors hover:bg-yellow-400"
            >
              Back to store
            </Link>
            <Link
              href={storeHref(slug, "track")}
              className="inline-flex h-10 items-center rounded-full border border-slate-200 bg-white px-5 text-sm font-bold text-slate-900 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-white/10 dark:text-white"
            >
              Track order
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const products = await prisma.storefrontProduct.findMany({
    where: { storefrontId: storefront.id, isActive: true, dataPackage: { active: true, network } },
    include: { dataPackage: true },
  });
  if (products.length === 0) notFound();

  products.sort(
    (a, b) => a.dataPackage.gbAmount - b.dataPackage.gbAmount || a.sellingPrice - b.sellingPrice
  );
  const prices = products.map((p) => fromPesewas(p.sellingPrice));
  const brand = NETWORK_BRANDS[network];

  return (
    <div className="mx-auto max-w-6xl px-4 pb-6">
      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-2 py-3 text-xs text-slate-500 sm:py-4 sm:text-sm dark:text-slate-400">
        <Link href={storeHref(slug)} className="hover:text-slate-800 dark:hover:text-slate-200">
          Home
        </Link>
        <span>/</span>
        <span>{brand.label}</span>
        <span>/</span>
        <span className="font-medium text-slate-800 dark:text-slate-200">{brand.label} Data Bundles</span>
      </nav>

      <div className="grid items-start gap-4 sm:gap-6 lg:grid-cols-2">
        {/* Brand logo card — desktop only; mobile keeps the page compact */}
        <div className={`sticky top-24 hidden rounded-3xl lg:block ${brand.dim} p-8 sm:p-14`}>
          <div className={`mx-auto aspect-square max-w-sm overflow-hidden rounded-2xl ${brand.tile}`}>
            <NetworkLogo network={network} className="h-full w-full" />
          </div>
        </div>

        {/* Packages + buy form */}
        <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-900/5 sm:p-8 dark:bg-[#111a2c] dark:ring-white/10">
          <div className={`mx-auto mb-4 aspect-square w-24 overflow-hidden rounded-2xl sm:hidden ${brand.tile}`}>
            <NetworkLogo network={network} className="h-full w-full" />
          </div>
          <h1 className="font-serif text-2xl font-bold text-slate-900 sm:text-3xl lg:text-4xl dark:text-white">
            {brand.label} Data Bundles
          </h1>
          <p className="mt-2 text-lg font-bold text-slate-900 dark:text-white">
            {ghs(Math.min(...prices))} <span className="font-normal text-slate-400">–</span> {ghs(Math.max(...prices))}
          </p>
          <NetworkBuyForm
            slug={slug}
            network={network}
            storeName={storefront.name}
            products={products.map((p) => ({
              packageId: p.packageId,
              gbAmount: p.dataPackage.gbAmount,
              name: p.dataPackage.name,
              price: fromPesewas(p.sellingPrice),
            }))}
          />
        </div>
      </div>
    </div>
  );
}
