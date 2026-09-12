import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { signupCodeUpdateSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAdmin();
    const { id } = await params;
    const body = await request.json();
    const input = signupCodeUpdateSchema.parse(body);

    const existing = await prisma.signupCode.findUnique({ where: { id } });
    if (!existing) return apiError(404, "Signup code not found");

    const updateData: Record<string, unknown> = {};
    if (input.status !== undefined) updateData.status = input.status;
    if (input.maxUses !== undefined) updateData.maxUses = input.maxUses;
    if (input.expiresAt !== undefined) {
      updateData.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    }
    if (input.notes !== undefined) updateData.notes = input.notes || null;

    const updated = await prisma.signupCode.update({
      where: { id },
      data: updateData,
    });

    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: "signup_code.update",
      target: `signup-code:${id}`,
      previousValue: JSON.stringify({ status: existing.status, maxUses: existing.maxUses }),
      newValue: JSON.stringify(updateData),
    });

    return NextResponse.json({ code: updated });
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

    const existing = await prisma.signupCode.findUnique({ where: { id } });
    if (!existing) return apiError(404, "Signup code not found");

    await prisma.signupCode.delete({ where: { id } });

    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: "signup_code.delete",
      target: `signup-code:${id}`,
      previousValue: JSON.stringify({ code: existing.code }),
    });

    return NextResponse.json({ ok: true, message: "Signup code deleted" });
  } catch (err) {
    return handleRouteError(err);
  }
}

