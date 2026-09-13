import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createBatchFromBlockedNumbers } from "@/lib/mtn-verification";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const { blockedIds } = body;

    if (!Array.isArray(blockedIds) || blockedIds.length === 0) {
      return apiError(400, "Select at least one blocked number to create a batch");
    }

    const batch = await createBatchFromBlockedNumbers({
      blockedIds,
      actorLabel: admin.email,
    });

    return NextResponse.json({
      success: true,
      batch,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
