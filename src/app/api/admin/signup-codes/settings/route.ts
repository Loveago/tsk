import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getSignupCodeMode, setSignupCodeMode, type SignupCodeMode } from "@/lib/signup-codes";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { z } from "zod";

const modeSchema = z.object({
  mode: z.enum(["DISABLED", "OPTIONAL", "REQUIRED"]),
});

export async function GET() {
  try {
    await requireAdmin();
    const mode = await getSignupCodeMode();
    return NextResponse.json({ mode });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireAdmin();
    const body = await request.json();
    const input = modeSchema.parse(body);

    const oldMode = await getSignupCodeMode();
    await setSignupCodeMode(input.mode as SignupCodeMode);

    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: "settings.signup_code_mode_update",
      target: "system-settings",
      previousValue: JSON.stringify({ mode: oldMode }),
      newValue: JSON.stringify({ mode: input.mode }),
    });

    return NextResponse.json({ mode: input.mode });
  } catch (err) {
    return handleRouteError(err);
  }
}

