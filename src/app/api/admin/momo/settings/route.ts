import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getSendClaimSettings, updateSendClaimSettings, DEFAULT_FORWARDER_SECRET } from "@/lib/send-claim";
import { sendClaimSettingsUpdateSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, getRequestOrigin } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const settings = await getSendClaimSettings();
    const origin = getRequestOrigin(request);
    const webhookUrl = origin ? `${origin}/api/webhooks/momo/sms` : "/api/webhooks/momo/sms";
    const forwarderSecret = process.env.SMS_FORWARDER_SECRET || DEFAULT_FORWARDER_SECRET;
    return NextResponse.json({ settings, webhookUrl, forwarderSecret });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireAdmin();
    const body = await request.json();
    const input = sendClaimSettingsUpdateSchema.parse(body);

    const updated = await updateSendClaimSettings(input);

    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: "admin.momo_settings_update",
      target: "send-claim-settings",
      newValue: JSON.stringify(input),
    });

    return NextResponse.json({ settings: updated });
  } catch (err) {
    return handleRouteError(err);
  }
}

