import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";
import { reconcileFailedClickyfiedOrders } from "@/lib/provider-apis/clickyfied-batch";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/clickyfied-batches/reconcile
 * Scans recent orders marked as FAILED in our database and verifies if Clickyfied actually
 * accepted, processed, or fulfilled them. Automatically restores their status to SUCCESS or PROCESSING.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireStaff();
    const actorLabel = `Admin (${user.name || user.email || "Staff"}) Reconciliation`;

    const body = await request.json().catch(() => ({}));
    const lookbackHours = typeof body.lookbackHours === "number" ? body.lookbackHours : 72;

    const result = await reconcileFailedClickyfiedOrders(actorLabel, { lookbackHours });
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
