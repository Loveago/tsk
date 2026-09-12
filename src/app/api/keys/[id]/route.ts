import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const key = await prisma.apiKey.findUnique({ where: { id } });
    if (!key || key.userId !== user.id) return apiError(404, "Key not found");

    const updated = await prisma.apiKey.update({
      where: { id },
      data: { active: !key.active },
    });

    await recordAudit({
      userId: user.id,
      actorLabel: user.email,
      action: updated.active ? "api_key.enable" : "api_key.disable",
      target: `api_key:${id}`,
    });

    return NextResponse.json({ key: { id: updated.id, active: updated.active } });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const key = await prisma.apiKey.findUnique({ where: { id } });
    if (!key || key.userId !== user.id) return apiError(404, "Key not found");

    await prisma.apiKey.delete({ where: { id } });

    await recordAudit({
      userId: user.id,
      actorLabel: user.email,
      action: "api_key.delete",
      target: `api_key:${id}`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
