import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { getClickyfiedBatchDetail } from "@/lib/provider-apis/clickyfied-batch";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/clickyfied-batches/[id]
 * Returns full batch details, recipient orders, blocked entries, and status logs.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaff();
    const { id } = await params;

    const batch = await getClickyfiedBatchDetail(id);
    if (!batch) {
      return apiError(404, `Clickyfied batch not found: ${id}`);
    }

    return NextResponse.json({ success: true, batch });
  } catch (err) {
    return handleRouteError(err);
  }
}
