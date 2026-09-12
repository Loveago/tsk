import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { pricingProfileSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function GET() {
  try {
    await requireAdmin();
    const profiles = await prisma.pricingProfile.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        tiers: { orderBy: { gbAmount: "asc" } },
        _count: { select: { users: true } },
      },
    });
    return NextResponse.json({ profiles });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdmin();
    const body = await request.json();
    const input = pricingProfileSchema.parse(body);

    const profile = await prisma.pricingProfile.create({
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

    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: "pricing_profile.create",
      target: `pricing_profile:${profile.id}`,
      newValue: JSON.stringify({ name: input.name, type: input.type }),
    });

    return NextResponse.json({ profile });
  } catch (err) {
    return handleRouteError(err);
  }
}
