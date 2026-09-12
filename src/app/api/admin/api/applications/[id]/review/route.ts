import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { sendApiApprovalEmail, sendApiRejectionEmail, sendApiSuspensionEmail } from "@/lib/email";
import { z } from "zod";

const reviewSchema = z.object({
  action: z.enum(["APPROVE", "REJECT", "SUSPEND", "REINSTATE", "REVOKE", "ADD_NOTES"]),
  adminNotes: z.string().max(1000).optional().or(z.literal("")),
  allowedScopes: z.string().optional(),
  rateLimitPerMin: z.coerce.number().int().min(5).max(1000).optional(),
  dailyRequestLimit: z.coerce.number().int().min(100).max(100000).optional(),
  maxOrderVolume: z.coerce.number().int().min(10).max(100000).optional(),
  ipRestrictions: z.string().max(300).optional().or(z.literal("")),
  webhookPermissions: z.boolean().optional(),
  sandboxAccess: z.boolean().optional(),
  productionAccess: z.boolean().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await request.json();
    const input = reviewSchema.parse(body);

    const application = await prisma.apiApplication.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!application) {
      return apiError(404, "Application not found");
    }

    let targetStatus = application.status;
    const updateData: any = {};

    if (input.action === "APPROVE") {
      targetStatus = "APPROVED";
      updateData.status = "APPROVED";
      updateData.productionAccess = input.productionAccess ?? true;
      updateData.sandboxAccess = input.sandboxAccess ?? true;
    } else if (input.action === "REJECT") {
      targetStatus = "REJECTED";
      updateData.status = "REJECTED";
    } else if (input.action === "SUSPEND") {
      targetStatus = "SUSPENDED";
      updateData.status = "SUSPENDED";
    } else if (input.action === "REINSTATE") {
      targetStatus = "APPROVED";
      updateData.status = "APPROVED";
    } else if (input.action === "REVOKE") {
      targetStatus = "REVOKED";
      updateData.status = "REVOKED";
    }

    if (input.adminNotes !== undefined) updateData.adminNotes = input.adminNotes || null;
    if (input.allowedScopes) updateData.allowedScopes = input.allowedScopes;
    if (input.rateLimitPerMin !== undefined) updateData.rateLimitPerMin = input.rateLimitPerMin;
    if (input.dailyRequestLimit !== undefined) updateData.dailyRequestLimit = input.dailyRequestLimit;
    if (input.maxOrderVolume !== undefined) updateData.maxOrderVolume = input.maxOrderVolume;
    if (input.ipRestrictions !== undefined) updateData.ipRestrictions = input.ipRestrictions || null;
    if (input.webhookPermissions !== undefined) updateData.webhookPermissions = input.webhookPermissions;
    if (input.sandboxAccess !== undefined) updateData.sandboxAccess = input.sandboxAccess;
    if (input.productionAccess !== undefined) updateData.productionAccess = input.productionAccess;

    updateData.reviewedAt = new Date();
    updateData.reviewedBy = admin.email;

    const updated = await prisma.apiApplication.update({
      where: { id },
      data: updateData,
    });

    // If suspended or revoked, optionally update credentials
    if (targetStatus === "SUSPENDED" || targetStatus === "REVOKED") {
      await prisma.apiCredential.updateMany({
        where: { userId: application.userId, environment: "PRODUCTION" },
        data: { status: targetStatus === "REVOKED" ? "REVOKED" : "DISABLED" },
      });
    }

    // Centralized email notifications (§44, §45)
    if (application.user?.email) {
      if (input.action === "APPROVE" || input.action === "REINSTATE") {
        sendApiApprovalEmail(application.user.email, application.user.name, application.businessName).catch(() => undefined);
      } else if (input.action === "REJECT") {
        sendApiRejectionEmail(application.user.email, application.user.name, application.businessName, input.adminNotes).catch(() => undefined);
      } else if (input.action === "SUSPEND") {
        sendApiSuspensionEmail(application.user.email, application.user.name, application.businessName, input.adminNotes).catch(() => undefined);
      }
    }

    await recordAudit({
      userId: admin.id,
      actorLabel: admin.email,
      action: `api_application.${input.action.toLowerCase()}`,
      target: `api_application:${application.id}`,
      previousValue: application.status,
      newValue: JSON.stringify({
        status: targetStatus,
        notes: input.adminNotes,
        rateLimit: input.rateLimitPerMin,
        scopes: input.allowedScopes,
      }),
    });

    return NextResponse.json({
      success: true,
      application: updated,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
