import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const packages = await prisma.dataPackage.findMany({
      where: { active: true },
      orderBy: [{ network: "asc" }, { sortOrder: "asc" }],
    });

    const profileId = user.pricingProfileId ?? null;
    const profile = profileId
      ? await prisma.pricingProfile.findUnique({ where: { id: profileId } })
      : null;
    const isCustomProfile = profile && !profile.isDefault;

    const tiers = (isCustomProfile && profileId)
      ? await prisma.priceTier.findMany({ where: { profileId } })
      : [];
    const priceMap = new Map(tiers.map((t) => [t.gbAmount, t.priceGHS]));

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

    const { getSetting } = await import("@/lib/orders");
    const showPricesSetting = await getSetting("show_package_prices_to_users", "true");
    const showPrices = showPricesSetting !== "false";

    const data = packages.map((p) => {
      let distinctPrice: number | null = null;
      if (profileNetworkRates && Array.isArray(profileNetworkRates[p.network.toUpperCase()])) {
        const match = profileNetworkRates[p.network.toUpperCase()].find((t) => t.gbAmount === p.gbAmount);
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
        network: p.network,
        name: p.name,
        gbAmount: p.gbAmount,
        description: p.description,
        retailPriceGHS: showPrices ? p.retailPriceGHS : null,
        price: showPrices ? distinctPrice : null,
      };
    });

    const killSwitch = await prisma.systemSetting.findUnique({
      where: { key: "number_submission_page_enabled" },
    });
    const submissionEnabled = killSwitch?.value !== "false";

    return NextResponse.json({ packages: data, submissionEnabled });
  } catch (err) {
    return handleRouteError(err);
  }
}
