import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { pricingProfileSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAdmin();
    const { id } = await params;
    const existing = await prisma.pricingProfile.findUnique({
      where: { id },
      include: { tiers: true },
    });
    if (!existing) return apiError(404, "Profile not found");

    const body = await request.json();
    const input = pricingProfileSchema.parse(body);

    const rawFallbackTiers =
      input.tiers?.length > 0
        ? input.tiers
        : input.networkTiers?.MTN?.length
        ? input.networkTiers.MTN
        : existing.tiers;

    // Deduplicate fallback tiers by gbAmount
    const fallbackMap = new Map<number, number>();
    for (const t of rawFallbackTiers) {
      fallbackMap.set(t.gbAmount, t.priceGHS);
    }
    const fallbackTiers = Array.from(fallbackMap.entries()).map(([gbAmount, priceGHS]) => ({
      gbAmount,
      priceGHS,
    }));

    // Replace all tiers in one transaction
    const profile = await prisma.$transaction(async (tx) => {
      await tx.priceTier.deleteMany({ where: { profileId: id } });
      return tx.pricingProfile.update({
        where: { id },
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
    });

    if (input.networkTiers) {
      await prisma.systemSetting.upsert({
        where: { key: `pricing_profile_network_rates:${id}` },
        update: { value: JSON.stringify(input.networkTiers) },
        create: {
          key: `pricing_profile_network_rates:${id}`,
          value: JSON.stringify(input.networkTiers),
        },
      });
    }

    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: "pricing_profile.update",
      target: `pricing_profile:${id}`,
      previousValue: JSON.stringify({ name: existing.name, tiers: existing.tiers.length }),
      newValue: JSON.stringify({ name: input.name, tiers: fallbackTiers.length }),
    });

    return NextResponse.json({
      profile: {
        ...profile,
        networkTiers: input.networkTiers ?? undefined,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAdmin();
    const { id } = await params;
    const existing = await prisma.pricingProfile.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!existing) return apiError(404, "Profile not found");
    if (existing._count.users > 0) {
      return apiError(400, "Profile has users assigned — reassign them first");
    }

    await prisma.pricingProfile.delete({ where: { id } });
    await prisma.systemSetting.deleteMany({
      where: { key: `pricing_profile_network_rates:${id}` },
    });
    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: "pricing_profile.delete",
      target: `pricing_profile:${id}`,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
