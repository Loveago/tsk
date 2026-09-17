import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";
import {
  getClickyfiedBatchStatus,
  dispatchClickyfiedMtnBatch,
} from "@/lib/provider-apis/clickyfied-batch";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/provider-apis/clickyfied-batch
 * Returns current MTN batch queue status, volume progress, and timer countdown
 */
export async function GET() {
  try {
    await requireStaff();
    const status = await getClickyfiedBatchStatus();
    return NextResponse.json(status);
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * POST /api/admin/provider-apis/clickyfied-batch
 * Manually dispatches all currently queued pending MTN orders to Clickyfied as a batch
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireStaff();
    const actorLabel = `Admin (${user.name || user.email || "Staff"}) Manual Batch`;
    
    const result = await dispatchClickyfiedMtnBatch(actorLabel);
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
