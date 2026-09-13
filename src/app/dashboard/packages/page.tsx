import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { PriceMask } from "@/components/price-mask";
import { NetworkPackageGrid, type PackageGroup } from "@/components/packages/network-package-grid";
import { BadgeCheck, Layers, Package, ShieldCheck } from "lucide-react";
import { formatGHS } from "@/lib/types";

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

  const isCustomProfile = profile && !profile.isDefault;

  // Check if custom profile has distinct per-network rates
  let profileNetworkRates: Record<string, Array<{ gbAmount: number; priceGHS: number }>> | null = null;
  if (isCustomProfile && profileId) {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: `pricing_profile_network_rates:${profileId}` },
    });
    if (setting?.value) {
      try {
        profileNetworkRates = JSON.parse(setting.value);
      } catch {
        // ignore
      }
    }
  }

  const groups: PackageGroup[] = (["MTN", "TELECEL", "AIRTELTIGO"] as const)
    .map((network) => ({
      network,
      packages: packages
        .filter((p) => p.network === network)
        .map((p) => {
          let distinctPrice: number | null = null;
          if (profileNetworkRates && Array.isArray(profileNetworkRates[network])) {
            const match = profileNetworkRates[network].find((t) => t.gbAmount === p.gbAmount);
            if (match && typeof match.priceGHS === "number" && match.priceGHS > 0) {
              distinctPrice = match.priceGHS;
            }
          }
          if (distinctPrice == null && isCustomProfile && priceMap.has(p.gbAmount)) {
            distinctPrice = priceMap.get(p.gbAmount)!;
          }
          if (distinctPrice == null) {
            distinctPrice = p.retailPriceGHS ?? (priceMap.has(p.gbAmount) ? priceMap.get(p.gbAmount)! : null);
          }

          return {
            id: p.id,
            name: p.name,
            gbAmount: p.gbAmount,
            price: showPrices ? distinctPrice : null,
          };
        }),
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
          View your assigned pricing profile and available data allocation options across all 3 networks.
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
              <span className="inline-flex items-center rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-sm dark:bg-white/5 dark:text-slate-300">
                3 Networks (MTN · Telecel · AirtelTigo)
              </span>
              <span className="inline-flex items-center rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-sm dark:bg-white/5 dark:text-slate-300">
                {packages.length} Bundles
              </span>
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

      {/* Pricing structure by network */}
      <div className="rounded-2xl border border-slate-200/70 bg-white shadow-sm dark:border-white/5 dark:bg-[#0d1526]">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 dark:border-white/5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
            <BadgeCheck className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-sm font-bold">Pricing Structure by Network</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Each network has distinct bundle allocations and rates:
            </p>
          </div>
        </div>

        {groups.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            No packages available yet — please contact support.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {groups.map((g) => (
              <div key={g.network} className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900 dark:text-white">
                      {g.network === "MTN" ? "MTN" : g.network === "TELECEL" ? "Telecel" : "AirtelTigo"}
                    </span>
                    <span className="text-xs text-slate-400">({g.packages.length} bundles)</span>
                  </div>
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {profileName} Profile
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {g.packages.map((pkg) => (
                    <div
                      key={pkg.id}
                      className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-2.5 text-xs dark:border-white/5 dark:bg-white/[0.02]"
                    >
                      <div>
                        <p className="font-semibold text-slate-800 dark:text-slate-200">{pkg.name}</p>
                        <p className="text-[10px] text-slate-400">{pkg.gbAmount} GB allocation</p>
                      </div>
                      <div>
                        {pkg.price != null ? (
                          <p className="font-mono font-bold text-slate-900 dark:text-white text-right">
                            {formatGHS(pkg.price)}
                          </p>
                        ) : (
                          <PriceMask className="text-right" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

