import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getSendClaimSettings } from "@/lib/send-claim";
import { handleRouteError } from "@/lib/api-helpers";

export async function GET() {
  try {
    await requireUser();
    const settings = await getSendClaimSettings();

    return NextResponse.json({
      settings: {
        enabled: settings.enabled,
        network: settings.network,
        momoNumber: settings.momoNumber,
        accountName: settings.accountName,
        instructions: settings.instructions,
        minimumAmount: settings.minimumAmount,
        maximumAmount: settings.maximumAmount,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

