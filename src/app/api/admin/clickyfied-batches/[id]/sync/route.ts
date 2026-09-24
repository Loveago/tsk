import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";
import { syncClickyfiedBatchStatus } from "@/lib/provider-apis/clickyfied-batch";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/clickyfied-batches/[id]/sync
 * Triggers on-demand status synchronization from Clickyfied for the batch.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireStaff();
    const actorLabel = `Admin (${user.name || user.email || "Staff"}) Sync`;
    const { id } = await params;

    const result = await syncClickyfiedBatchStatus(id, actorLabel);
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
