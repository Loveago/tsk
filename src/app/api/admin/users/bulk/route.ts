import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdmin();
    const body = await request.json();

    const { action, userIds, data } = body as {
      action: "FREEZE" | "UNFREEZE" | "ACTIVATE" | "DELETE" | "SET_ROLE" | "SET_PROFILE";
      userIds: string[];
      data?: {
        role?: string;
        pricingProfileId?: string;
      };
    };

    if (!action) return apiError(400, "Action is required");
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return apiError(400, "userIds array must contain at least 1 user ID");
    }

    // Never allow the calling admin to freeze or delete themselves via bulk action
    const targetUserIds = userIds.filter((id) => id !== actor.id);
    if (targetUserIds.length === 0) {
      return apiError(400, "Cannot perform this action on your own administrator account");
    }

    if (action === "FREEZE") {
      // Exclude admin accounts from being frozen
      const usersToFreeze = await prisma.user.findMany({
        where: { id: { in: targetUserIds }, role: { not: "ADMIN" } },
        select: { id: true, name: true, email: true },
      });

      const idsToFreeze = usersToFreeze.map((u) => u.id);
      if (idsToFreeze.length === 0) {
        return apiError(400, "No eligible non-admin accounts to freeze");
      }

      const res = await prisma.user.updateMany({
        where: { id: { in: idsToFreeze } },
        data: {
          status: "FROZEN",
          tokenVersion: { increment: 1 },
        },
      });

      await recordAudit({
        userId: actor.id,
        actorLabel: actor.email,
        action: "user.bulk_freeze",
        target: `users:${idsToFreeze.length}`,
        newValue: JSON.stringify({ count: res.count, ids: idsToFreeze }),
      });

      return NextResponse.json({
        ok: true,
        count: res.count,
        message: `Successfully frozen ${res.count} user account(s)`,
      });
    }

    if (action === "UNFREEZE") {
      const res = await prisma.user.updateMany({
        where: { id: { in: targetUserIds } },
        data: {
          status: "ACTIVE",
          tokenVersion: { increment: 1 },
        },
      });

      await recordAudit({
        userId: actor.id,
        actorLabel: actor.email,
        action: "user.bulk_unfreeze",
        target: `users:${targetUserIds.length}`,
        newValue: JSON.stringify({ count: res.count, ids: targetUserIds }),
      });

      return NextResponse.json({
        ok: true,
        count: res.count,
        message: `Successfully unfrozen ${res.count} user account(s)`,
      });
    }

    if (action === "ACTIVATE") {
      const res = await prisma.user.updateMany({
        where: { id: { in: targetUserIds } },
        data: {
          status: "ACTIVE",
          tokenVersion: { increment: 1 },
        },
      });

      // Approve pending signup fee records for activated users
      await prisma.walletTransaction.updateMany({
        where: {
          userId: { in: targetUserIds },
          type: "SIGNUP_FEE",
          status: "PENDING",
        },
        data: {
          status: "APPROVED",
          note: `Bulk activated by admin (${actor.email})`,
        },
      });

      await recordAudit({
        userId: actor.id,
        actorLabel: actor.email,
        action: "user.bulk_activate",
        target: `users:${targetUserIds.length}`,
        newValue: JSON.stringify({ count: res.count, ids: targetUserIds }),
      });

      return NextResponse.json({
        ok: true,
        count: res.count,
        message: `Successfully activated ${res.count} user account(s)`,
      });
    }

    if (action === "DELETE") {
      // Exclude admin accounts from being deleted
      const usersToDelete = await prisma.user.findMany({
        where: { id: { in: targetUserIds }, role: { not: "ADMIN" } },
        select: { id: true, name: true, email: true },
      });

      const idsToDelete = usersToDelete.map((u) => u.id);
      if (idsToDelete.length === 0) {
        return apiError(400, "No eligible non-admin accounts to delete");
      }

      await prisma.$transaction(async (tx) => {
        // Raw chat table cleanup
        for (const uid of idsToDelete) {
          try {
            await tx.$executeRawUnsafe(`DELETE FROM support_chat_messages WHERE user_id = $1`, uid);
          } catch {
            // silent
          }
        }

        // Api keys and logs
        const userKeys = await tx.apiKey.findMany({
          where: { userId: { in: idsToDelete } },
          select: { id: true },
        });
        if (userKeys.length > 0) {
          await tx.apiRequestLog.deleteMany({
            where: { apiKeyId: { in: userKeys.map((k) => k.id) } },
          });
          await tx.apiKey.deleteMany({ where: { userId: { in: idsToDelete } } });
        }

        // Delivery reports & events
        const reports = await tx.deliveryReport.findMany({
          where: { userId: { in: idsToDelete } },
          select: { id: true },
        });
        if (reports.length > 0) {
          await tx.deliveryReportEvent.deleteMany({
            where: { reportId: { in: reports.map((r) => r.id) } },
          });
          await tx.deliveryReport.deleteMany({ where: { userId: { in: idsToDelete } } });
        }

        // Orders & batches
        await tx.order.deleteMany({ where: { userId: { in: idsToDelete } } });
        await tx.orderBatch.deleteMany({ where: { userId: { in: idsToDelete } } });

        // Delete users (all other relations cascade)
        await tx.user.deleteMany({ where: { id: { in: idsToDelete } } });
      });

      await recordAudit({
        userId: actor.id,
        actorLabel: actor.email,
        action: "user.bulk_delete",
        target: `users:${idsToDelete.length}`,
        newValue: JSON.stringify({ count: idsToDelete.length, ids: idsToDelete }),
      });

      return NextResponse.json({
        ok: true,
        count: idsToDelete.length,
        message: `Successfully deleted ${idsToDelete.length} user account(s)`,
      });
    }

    if (action === "SET_ROLE") {
      const newRole = data?.role;
      if (!newRole || !["USER", "RESELLER", "MANAGER", "SECRETARY", "ADMIN"].includes(newRole)) {
        return apiError(400, "Valid role is required");
      }

      const res = await prisma.user.updateMany({
        where: { id: { in: targetUserIds } },
        data: { role: newRole },
      });

      await recordAudit({
        userId: actor.id,
        actorLabel: actor.email,
        action: "user.bulk_set_role",
        target: `users:${targetUserIds.length}`,
        newValue: JSON.stringify({ newRole, count: res.count }),
      });

      return NextResponse.json({
        ok: true,
        count: res.count,
        message: `Role changed to ${newRole} for ${res.count} user(s)`,
      });
    }

    if (action === "SET_PROFILE") {
      const profileId = data?.pricingProfileId || null;
      const res = await prisma.user.updateMany({
        where: { id: { in: targetUserIds } },
        data: { pricingProfileId: profileId },
      });

      await recordAudit({
        userId: actor.id,
        actorLabel: actor.email,
        action: "user.bulk_set_profile",
        target: `users:${targetUserIds.length}`,
        newValue: JSON.stringify({ profileId, count: res.count }),
      });

      return NextResponse.json({
        ok: true,
        count: res.count,
        message: `Pricing profile updated for ${res.count} user(s)`,
      });
    }

    return apiError(400, "Unknown action");
  } catch (err) {
    return handleRouteError(err);
  }
}
