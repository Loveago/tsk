import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { updateUserSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAdmin();
    const { id } = await params;
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return apiError(404, "User not found");

    const body = await request.json();
    const input = updateUserSchema.parse(body);

    const email = input.email.toLowerCase();
    if (email !== existing.email) {
      const dup = await prisma.user.findUnique({ where: { email } });
      if (dup) return apiError(409, "A user with this email already exists");
    }

    const data: Record<string, unknown> = {
      name: input.name,
      email,
      role: input.role,
      status: input.status,
      balance: input.balance,
      pricingProfileId: input.pricingProfileId || null,
    };
    if (input.password) {
      data.passwordHash = await bcrypt.hash(input.password, 10);
      data.tokenVersion = { increment: 1 }; // force re-login everywhere
    }

    const updated = await prisma.user.update({ where: { id }, data });

    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: "user.update",
      target: `user:${id}`,
      previousValue: JSON.stringify({
        role: existing.role,
        status: existing.status,
        balance: existing.balance,
      }),
      newValue: JSON.stringify({ role: input.role, status: input.status, balance: input.balance }),
    });

    return NextResponse.json({
      user: { id: updated.id, email: updated.email, role: updated.role, status: updated.status },
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

    if (id === actor.id) {
      return apiError(400, "You cannot delete your own administrator account.");
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return apiError(404, "User not found");

    if (user.role === "ADMIN") {
      const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
      if (adminCount <= 1) {
        return apiError(400, "Cannot delete the only remaining administrator account.");
      }
    }

    await prisma.$transaction(async (tx) => {
      // Clean up raw chat table if present
      try {
        await tx.$executeRawUnsafe(`DELETE FROM support_chat_messages WHERE user_id = $1`, id);
      } catch {
        // silent
      }

      // API request logs via user's API keys
      const userKeys = await tx.apiKey.findMany({ where: { userId: id }, select: { id: true } });
      if (userKeys.length > 0) {
        await tx.apiRequestLog.deleteMany({ where: { apiKeyId: { in: userKeys.map((k) => k.id) } } });
        await tx.apiKey.deleteMany({ where: { userId: id } });
      }

      // Delivery reports and events
      const reports = await tx.deliveryReport.findMany({ where: { userId: id }, select: { id: true } });
      if (reports.length > 0) {
        await tx.deliveryReportEvent.deleteMany({ where: { reportId: { in: reports.map((r) => r.id) } } });
        await tx.deliveryReport.deleteMany({ where: { userId: id } });
      }

      // Orders and batches
      await tx.order.deleteMany({ where: { userId: id } });
      await tx.orderBatch.deleteMany({ where: { userId: id } });

      // Delete user
      await tx.user.delete({ where: { id } });
    });

    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: "user.delete",
      target: `user:${id}`,
      previousValue: JSON.stringify({ email: user.email, name: user.name, role: user.role }),
    });

    return NextResponse.json({
      ok: true,
      message: `User ${user.name} (${user.email}) deleted successfully`,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
