import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";
import { resendClickyfiedBatch } from "@/lib/provider-apis/clickyfied-batch";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/clickyfied-batches/[id]/resend
 * Force re-dispatches a batch directly to Clickyfied.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireStaff();
    const actorLabel = `Admin (${user.name || user.email || "Staff"}) Force Re-dispatch`;
    const { id } = await params;

    const result = await resendClickyfiedBatch(id, actorLabel);
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
