import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import {
  promoteBlockedToAccepted,
  submitBlockedForVerification,
} from "@/lib/mtn-verification";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { recordAudit } from "@/lib/audit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await request.json();
    const { action, reason } = body;

    const blocked = await prisma.blockedMtnNumber.findUnique({ where: { id } });
    if (!blocked) {
      return apiError(404, "Blocked number not found");
    }

    if (action === "ADD_ACCEPTED" || action === "MARK_VERIFIED") {
      const accepted = await promoteBlockedToAccepted(id, admin.email);
      return NextResponse.json({ success: true, accepted, status: "ACCEPTED" });
    }

    if (action === "SUBMIT_VERIFICATION") {
      const res = await submitBlockedForVerification(id, admin.email);
      return NextResponse.json({ success: true, status: "SUBMITTED", result: res });
    }

    if (action === "REJECT") {
      await prisma.blockedMtnNumber.update({
        where: { id },
        data: { status: "REJECTED" },
      });

      await recordAudit({
        actorLabel: admin.email,
        action: "ADMIN_REJECTED_BLOCKED_MTN_NUMBER",
        target: `blocked:${blocked.normalizedNumber}`,
        newValue: JSON.stringify({ reason }),
      });

      return NextResponse.json({ success: true, status: "REJECTED" });
    }

    return apiError(400, "Invalid action");
  } catch (err) {
    return handleRouteError(err);
  }
}
