import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { packageToggleSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";

/**
 * Quick enable/disable for a package. Deactivated packages disappear from the
 * user dashboard, the send-order page and the public API, and are rejected at
 * order time.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAdmin();
    const { id } = await params;
    const existing = await prisma.dataPackage.findUnique({ where: { id } });
    if (!existing) return apiError(404, "Package not found");

    const input = packageToggleSchema.parse(await request.json());
    if (input.active === existing.active) {
      return NextResponse.json({ package: existing, unchanged: true });
    }

    const pkg = await prisma.dataPackage.update({
      where: { id },
      data: { active: input.active },
    });

    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: input.active ? "package.enable" : "package.disable",
      target: `package:${id}`,
      previousValue: JSON.stringify({ active: existing.active }),
      newValue: JSON.stringify({ active: input.active }),
    });

    return NextResponse.json({ package: pkg });
  } catch (err) {
    return handleRouteError(err);
  }
}