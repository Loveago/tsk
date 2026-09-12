import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { packageSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAdmin();
    const { id } = await params;
    const existing = await prisma.dataPackage.findUnique({ where: { id } });
    if (!existing) return apiError(404, "Package not found");

    const body = await request.json();
    const input = packageSchema.parse(body);

    const pkg = await prisma.dataPackage.update({
      where: { id },
      data: {
        network: input.network,
        name: input.name,
        gbAmount: input.gbAmount,
        description: input.description || null,
        providerProductId: input.providerProductId || null,
        retailPriceGHS: input.retailPriceGHS,
        active: input.active,
        sortOrder: input.sortOrder ?? existing.sortOrder,
      },
    });

    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: "package.update",
      target: `package:${id}`,
      previousValue: JSON.stringify({ active: existing.active, retailPriceGHS: existing.retailPriceGHS }),
      newValue: JSON.stringify({ active: input.active, retailPriceGHS: input.retailPriceGHS }),
    });

    return NextResponse.json({ package: pkg });
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
    const existing = await prisma.dataPackage.findUnique({ where: { id } });
    if (!existing) return apiError(404, "Package not found");

    const orderCount = await prisma.order.count({ where: { packageId: id } });
    if (orderCount > 0) {
      // Keep history intact: just deactivate instead of deleting
      await prisma.dataPackage.update({ where: { id }, data: { active: false } });
      await recordAudit({
        userId: actor.id,
        actorLabel: actor.email,
        action: "package.deactivate",
        target: `package:${id}`,
        newValue: JSON.stringify({ reason: "has orders" }),
      });
      return NextResponse.json({ ok: true, deactivated: true });
    }

    await prisma.dataPackage.delete({ where: { id } });
    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: "package.delete",
      target: `package:${id}`,
    });
    return NextResponse.json({ ok: true, deleted: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
