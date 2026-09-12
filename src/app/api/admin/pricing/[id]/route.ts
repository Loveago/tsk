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
            create: input.tiers.map((t) => ({
              gbAmount: t.gbAmount,
              priceGHS: t.priceGHS,
            })),
          },
        },
        include: { tiers: true },
      });
    });

    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: "pricing_profile.update",
      target: `pricing_profile:${id}`,
      previousValue: JSON.stringify({ name: existing.name, tiers: existing.tiers.length }),
      newValue: JSON.stringify({ name: input.name, tiers: input.tiers.length }),
    });

    return NextResponse.json({ profile });
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
