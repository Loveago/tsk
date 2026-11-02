import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, getClientIp } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { normalizeGhanaPhoneNumber, isValidGhanaPhoneNumber } from "@/lib/phone-utils";

export async function POST(request: NextRequest) {
  try {
    const current = await requireUser();
    const ip = await getClientIp();
    const userAgent = request.headers.get("user-agent") || undefined;
    const body = await request.json().catch(() => ({}));

    const rawPhone = String(body.phone || "").trim();
    if (!rawPhone) {
      return apiError(400, "Phone number is required");
    }

    const normalized = normalizeGhanaPhoneNumber(rawPhone);
    const isValid = isValidGhanaPhoneNumber(normalized) || (normalized.length === 10 && normalized.startsWith("0"));

    if (!isValid) {
      return apiError(
        400,
        "Please enter a valid Ghanaian phone number (e.g. 0244123456 or 0501234567)"
      );
    }

    const updated = await prisma.user.update({
      where: { id: current.id },
      data: { phone: normalized },
      select: { id: true, name: true, email: true, phone: true },
    });

    await recordAudit({
      userId: current.id,
      actorLabel: current.email,
      action: "profile.phone_set",
      target: `user:${current.id}`,
      previousValue: current.phone ? JSON.stringify({ phone: current.phone }) : null,
      newValue: JSON.stringify({ phone: normalized }),
      ip,
      userAgent,
    });

    return NextResponse.json({
      success: true,
      phone: updated.phone,
      message: "Phone number updated successfully",
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
