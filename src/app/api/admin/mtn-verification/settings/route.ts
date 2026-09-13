import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  isMtnVerificationEnabled,
  setMtnVerificationEnabled,
  getMtnVerificationInstructions,
  setMtnVerificationInstructions,
} from "@/lib/mtn-verification";
import { handleRouteError } from "@/lib/api-helpers";
import { recordAudit } from "@/lib/audit";

export async function GET() {
  try {
    await requireAdmin();
    const [enabled, instructions] = await Promise.all([
      isMtnVerificationEnabled(),
      getMtnVerificationInstructions(),
    ]);

    return NextResponse.json({
      enabled,
      instructions,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const { enabled, instructions } = body;

    const prevEnabled = await isMtnVerificationEnabled();

    if (typeof enabled === "boolean") {
      await setMtnVerificationEnabled(enabled);
    }
    if (typeof instructions === "string") {
      await setMtnVerificationInstructions(instructions);
    }

    await recordAudit({
      actorLabel: admin.email,
      action: "ADMIN_UPDATED_MTN_VERIFICATION_SETTINGS",
      target: "settings:mtn_verification",
      previousValue: JSON.stringify({ enabled: prevEnabled }),
      newValue: JSON.stringify({ enabled, instructions }),
    });

    const [currentEnabled, currentInstructions] = await Promise.all([
      isMtnVerificationEnabled(),
      getMtnVerificationInstructions(),
    ]);

    return NextResponse.json({
      success: true,
      enabled: currentEnabled,
      instructions: currentInstructions,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
