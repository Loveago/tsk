import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { packageSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function GET() {
  try {
    await requireAdmin();
    const packages = await prisma.dataPackage.findMany({
      orderBy: [{ network: "asc" }, { gbAmount: "asc" }, { sortOrder: "asc" }],
    });
    return NextResponse.json({ packages });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdmin();
    const body = await request.json();
    const input = packageSchema.parse(body);

    const existing = await prisma.dataPackage.findUnique({
      where: { network_gbAmount: { network: input.network, gbAmount: input.gbAmount } },
    });
    if (existing) return apiError(409, "A package with this network and size already exists");

    const pkg = await prisma.dataPackage.create({
      data: {
        network: input.network,
        name: input.name,
        gbAmount: input.gbAmount,
        description: input.description || null,
        providerProductId: input.providerProductId || null,
        retailPriceGHS: input.retailPriceGHS,
        active: input.active,
        sortOrder: input.sortOrder ?? 0,
      },
    });

    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: "package.create",
      target: `package:${pkg.id}`,
      newValue: JSON.stringify({ network: input.network, gbAmount: input.gbAmount }),
    });

    return NextResponse.json({ package: pkg });
  } catch (err) {
    return handleRouteError(err);
  }
}
