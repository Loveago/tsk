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

    // Attach the user's profile price to each package
    const profileId =
      user.pricingProfileId ??
      (await prisma.pricingProfile.findFirst({ where: { isDefault: true }, select: { id: true } }))?.id ??
      null;

    const tiers = profileId
      ? await prisma.priceTier.findMany({ where: { profileId } })
      : [];
    const priceMap = new Map(tiers.map((t) => [t.gbAmount, t.priceGHS]));

    const { getSetting } = await import("@/lib/orders");
    const showPricesSetting = await getSetting("show_package_prices_to_users", "true");
    const showPrices = showPricesSetting !== "false";

    const data = packages.map((p) => ({
      id: p.id,
      network: p.network,
      name: p.name,
      gbAmount: p.gbAmount,
      description: p.description,
      retailPriceGHS: showPrices ? p.retailPriceGHS : null,
      price: showPrices ? (priceMap.has(p.gbAmount) ? priceMap.get(p.gbAmount) : (p.retailPriceGHS ?? null)) : null,
    }));

    const killSwitch = await prisma.systemSetting.findUnique({
      where: { key: "number_submission_page_enabled" },
    });
    const submissionEnabled = killSwitch?.value !== "false";

    return NextResponse.json({ packages: data, submissionEnabled });
  } catch (err) {
    return handleRouteError(err);
  }
}
