import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { fromPesewas } from "@/lib/storefront";
import { NetworkLogo } from "@/components/store/network-logo";
import { NETWORK_BRANDS, ghs, networkBySlug } from "@/components/store/brands";
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

  const storefront = await prisma.storefront.findUnique({ where: { slug } });
  if (!storefront || storefront.status !== "ENABLED") notFound();

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
        <Link href={`/store/${slug}`} className="hover:text-slate-800 dark:hover:text-slate-200">
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
