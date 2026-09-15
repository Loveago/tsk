import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { bulkImportAcceptedMtnNumbers } from "@/lib/mtn-verification";
import { mtnImportConfirmSchema } from "@/lib/validation";
import { handleRouteError } from "@/lib/api-helpers";

export const maxDuration = 300;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const input = mtnImportConfirmSchema.parse(body);

    const startTime = Date.now();
    const result = await bulkImportAcceptedMtnNumbers({
      sessionId: input.sessionId,
      numbers: input.numbers,
      source: input.source,
      actorLabel: admin.email,
    });

    const elapsedMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      imported: result.imported,
      batchId: result.batchId,
      batchReference: result.batchReference,
      elapsedMs,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
