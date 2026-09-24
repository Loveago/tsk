import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";
import {
  getClickyfiedBatches,
  dispatchClickyfiedMtnBatch,
  backfillPastClickyfiedBatches,
} from "@/lib/provider-apis/clickyfied-batch";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/clickyfied-batches
 * Returns paginated list of all Clickyfied batch dispatches with aggregates and metrics.
 */
export async function GET(request: NextRequest) {
  try {
    await requireStaff();
    const { searchParams } = new URL(request.url);

    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);
    const status = searchParams.get("status") || undefined;
    const group = searchParams.get("group") || undefined;
    const search = searchParams.get("search") || searchParams.get("q") || undefined;

    const result = await getClickyfiedBatches({
      page,
      pageSize,
      status,
      group,
      search,
    });

    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * POST /api/admin/clickyfied-batches
 * Triggers batch actions: "dispatch_now" or "backfill"
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireStaff();
    const actorLabel = `Admin (${user.name || user.email || "Staff"})`;

    const body = await request.json().catch(() => ({}));
    const action = body.action || "dispatch_now";

    if (action === "backfill") {
      const count = await backfillPastClickyfiedBatches();
      return NextResponse.json({
        success: true,
        message: `Backfilled ${count} historical Clickyfied batch(es).`,
        count,
      });
    }

    // Default action: dispatch eligible pending queue now
    const result = await dispatchClickyfiedMtnBatch(actorLabel);
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
