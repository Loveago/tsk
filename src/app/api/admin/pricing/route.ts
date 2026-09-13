import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { pricingProfileSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function GET() {
  try {
    await requireAdmin();
    const [profiles, packages, settings] = await Promise.all([
      prisma.pricingProfile.findMany({
        orderBy: { createdAt: "asc" },
        include: {
          tiers: { orderBy: { gbAmount: "asc" } },
          _count: { select: { users: true } },
        },
      }),
      prisma.dataPackage.findMany({
        orderBy: [{ network: "asc" }, { sortOrder: "asc" }, { gbAmount: "asc" }],
      }),
      prisma.systemSetting.findMany({
        where: { key: { startsWith: "pricing_profile_network_rates:" } },
      }),
    ]);

    const settingsMap = new Map(settings.map((s) => [s.key, s.value]));

    const enrichedProfiles = profiles.map((p) => {
      let networkTiers: Record<string, Array<{ gbAmount: number; priceGHS: number }>> = {
        MTN: [],
        TELECEL: [],
        AIRTELTIGO: [],
      };

      const raw = settingsMap.get(`pricing_profile_network_rates:${p.id}`);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          networkTiers = { ...networkTiers, ...parsed };
        } catch {
          // ignore
        }
      } else {
        // Build sensible initial network rates from profile tiers & packages
        const mtnPkgs = packages.filter((x) => x.network === "MTN");
        const telecelPkgs = packages.filter((x) => x.network === "TELECEL");
        const atPkgs = packages.filter((x) => x.network === "AIRTELTIGO");

        networkTiers.MTN = p.tiers.map((t) => ({ gbAmount: t.gbAmount, priceGHS: t.priceGHS }));

        networkTiers.TELECEL = telecelPkgs.map((pkg) => {
          const tierMatch = p.tiers.find((t) => t.gbAmount === pkg.gbAmount);
          return {
            gbAmount: pkg.gbAmount,
            priceGHS: pkg.retailPriceGHS ?? tierMatch?.priceGHS ?? 0,
          };
        });

        networkTiers.AIRTELTIGO = atPkgs.map((pkg) => {
          const tierMatch = p.tiers.find((t) => t.gbAmount === pkg.gbAmount);
          return {
            gbAmount: pkg.gbAmount,
            priceGHS: pkg.retailPriceGHS ?? tierMatch?.priceGHS ?? 0,
          };
        });
      }

      return {
        ...p,
        networkTiers,
      };
    });

    return NextResponse.json({
      profiles: enrichedProfiles,
      packages,
      networks: ["MTN", "TELECEL", "AIRTELTIGO"],
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdmin();
    const body = await request.json();
    const input = pricingProfileSchema.parse(body);

    const rawFallbackTiers =
      input.tiers?.length > 0
        ? input.tiers
        : input.networkTiers?.MTN?.length
        ? input.networkTiers.MTN
        : [{ gbAmount: 1, priceGHS: 3.5 }];

    // Deduplicate fallback tiers by gbAmount
    const fallbackMap = new Map<number, number>();
    for (const t of rawFallbackTiers) {
      fallbackMap.set(t.gbAmount, t.priceGHS);
    }
    const fallbackTiers = Array.from(fallbackMap.entries()).map(([gbAmount, priceGHS]) => ({
      gbAmount,
      priceGHS,
    }));

    const profile = await prisma.pricingProfile.create({
      data: {
        name: input.name,
        type: input.type,
        active: input.active,
        tiers: {
          create: fallbackTiers.map((t) => ({
            gbAmount: t.gbAmount,
            priceGHS: t.priceGHS,
          })),
        },
      },
      include: { tiers: true },
    });

    if (input.networkTiers) {
      await prisma.systemSetting.upsert({
        where: { key: `pricing_profile_network_rates:${profile.id}` },
        update: { value: JSON.stringify(input.networkTiers) },
        create: {
          key: `pricing_profile_network_rates:${profile.id}`,
          value: JSON.stringify(input.networkTiers),
        },
      });
    }

    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: "pricing_profile.create",
      target: `pricing_profile:${profile.id}`,
      newValue: JSON.stringify({ name: input.name, type: input.type }),
    });

    return NextResponse.json({
      profile: {
        ...profile,
        networkTiers: input.networkTiers ?? {
          MTN: fallbackTiers,
          TELECEL: [],
          AIRTELTIGO: [],
        },
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
