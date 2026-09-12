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

    const data = packages.map((p) => ({
      id: p.id,
      network: p.network,
      name: p.name,
      gbAmount: p.gbAmount,
      description: p.description,
      retailPriceGHS: p.retailPriceGHS,
      price: priceMap.has(p.gbAmount) ? priceMap.get(p.gbAmount) : p.retailPriceGHS ?? null,
    }));

    return NextResponse.json({ packages: data });
  } catch (err) {
    return handleRouteError(err);
  }
}
