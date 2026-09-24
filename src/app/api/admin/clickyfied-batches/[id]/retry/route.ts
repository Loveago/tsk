import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";
import { retryClickyfiedBatchFailedOrders } from "@/lib/provider-apis/clickyfied-batch";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/clickyfied-batches/[id]/retry
 * Resets failed orders in this batch back to PENDING so they can be re-dispatched.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireStaff();
    const actorLabel = `Admin (${user.name || user.email || "Staff"}) Retry`;
    const { id } = await params;

    const result = await retryClickyfiedBatchFailedOrders(id, actorLabel);
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
