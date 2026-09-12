import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAdmin();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const reason = (body.reason as string)?.trim() || "Claim rejected by administrator";

    const claim = await prisma.sendClaim.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!claim) return apiError(404, "Claim not found");
    if (claim.status === "APPROVED") return apiError(400, "Cannot reject an approved claim");

    await prisma.sendClaim.update({
      where: { id: claim.id },
      data: {
        status: "REJECTED",
        rejectionReason: reason,
        processedAt: new Date(),
      },
    });

    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: "claim.admin_reject",
      target: `claim:${claim.id}`,
      previousValue: JSON.stringify({ status: claim.status }),
      newValue: JSON.stringify({ status: "REJECTED", reason, user: claim.user.email }),
    });

    const { sendClaimRejectedEmail } = await import("@/lib/email");
    sendClaimRejectedEmail(claim.user.email, claim.user.name, claim.transactionReference, reason).catch(() => {});

    return NextResponse.json({ ok: true, message: "Claim rejected" });
  } catch (err) {
    return handleRouteError(err);
  }
}


