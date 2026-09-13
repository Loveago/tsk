import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { PriceMask } from "@/components/price-mask";
import { NetworkPackageGrid, type PackageGroup } from "@/components/packages/network-package-grid";
import { BadgeCheck, Layers, Package, ShieldCheck } from "lucide-react";

export default async function PackagesPage() {
  const user = await getCurrentUser();

  const profileId =
    user?.pricingProfileId ??
    (await prisma.pricingProfile.findFirst({ where: { isDefault: true }, select: { id: true } }))?.id ??
    null;
  const profile = profileId
    ? await prisma.pricingProfile.findUnique({ where: { id: profileId } })
    : null;
  const tiers = profileId
    ? await prisma.priceTier.findMany({ where: { profileId }, orderBy: { gbAmount: "asc" } })
    : [];
  const firstTier = tiers[0];
  const profileName = profile?.name ?? "Standard";

  // Available packages grouped by network, with the user's profile price attached
  const packages = await prisma.dataPackage.findMany({
    where: { active: true },
    orderBy: [{ network: "asc" }, { gbAmount: "asc" }],
  });
  const priceMap = new Map(tiers.map((t) => [t.gbAmount, t.priceGHS]));
  const { getSetting } = await import("@/lib/orders");
  const showPricesSetting = await getSetting("show_package_prices_to_users", "true");
  const showPrices = showPricesSetting !== "false";

  const groups: PackageGroup[] = (["MTN", "TELECEL", "AIRTELTIGO"] as const)
    .map((network) => ({
      network,
      packages: packages
        .filter((p) => p.network === network)
        .map((p) => ({
          id: p.id,
          name: p.name,
          gbAmount: p.gbAmount,
          price: showPrices ? (priceMap.has(p.gbAmount) ? priceMap.get(p.gbAmount)! : (p.retailPriceGHS ?? null)) : null,
        })),
    }))
    .filter((g) => g.packages.length > 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Centered page header, as per the reference design */}
      <div className="flex flex-col items-center gap-2 pt-2 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 text-white shadow-lg shadow-blue-600/30">
          <Package className="h-6 w-6" />
        </span>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Available Packages</h1>
        <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">
          View your assigned pricing profile and available data allocation options.
        </p>
      </div>

      {/* Assigned pricing profile */}
      <div className="overflow-hidden rounded-2xl border border-brand-200/70 bg-gradient-to-br from-brand-50 via-white to-violet-50 shadow-sm dark:border-brand-500/30 dark:from-brand-500/15 dark:via-[#0d1526] dark:to-violet-500/15">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-brand-500 dark:text-brand-400">
              Your Pricing Profile
            </p>
            <h2 className="mt-1 truncate text-lg font-bold">{profileName}</h2>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                <Layers className="h-3 w-3" /> Tiered Pricing
              </span>
              {firstTier && (
                <span className="inline-flex items-center rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-sm dark:bg-white/5 dark:text-slate-300">
                  {firstTier.gbAmount}gb @ {firstTier.priceGHS}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2.5 rounded-xl border border-brand-200/70 bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/5">
            <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-500" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Profile
              </p>
              <p className="text-sm font-bold">{profileName}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Available packages by network */}
      <NetworkPackageGrid groups={groups} />

      {/* Pricing structure */}
      <div className="rounded-2xl border border-slate-200/70 bg-white shadow-sm dark:border-white/5 dark:bg-[#0d1526]">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 dark:border-white/5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
            <BadgeCheck className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-sm font-bold">Pricing Structure</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Your profile&apos;s data allocations and rates:
            </p>
          </div>
        </div>
        {tiers.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            No pricing assigned yet — please contact support.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {tiers.map((t) => (
              <li key={t.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <p className="text-sm font-bold">{t.gbAmount} GB</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Data allocation: {t.gbAmount} GB
                  </p>
                </div>
                <PriceMask />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
