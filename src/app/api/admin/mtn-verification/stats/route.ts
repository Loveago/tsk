import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  getMtnVerificationStats,
  isMtnVerificationEnabled,
} from "@/lib/mtn-verification";
import { handleRouteError } from "@/lib/api-helpers";

export async function GET() {
  try {
    await requireAdmin();
    const [stats, enabled] = await Promise.all([
      getMtnVerificationStats(),
      isMtnVerificationEnabled(),
    ]);

    return NextResponse.json({
      ...stats,
      verificationEnabled: enabled,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
