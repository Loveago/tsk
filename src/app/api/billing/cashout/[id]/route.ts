import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const cashoutId = Number(id);
    if (!Number.isInteger(cashoutId) || cashoutId <= 0) {
      return apiError(400, "Invalid Cash-Out ID");
    }

    const row = await prisma.cashoutRequest.findFirst({
      where: { id: cashoutId, userId: user.id },
    });
    if (!row) return apiError(404, "Cash-Out request not found");

    return NextResponse.json({ request: row });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const cashoutId = Number(id);
    if (!Number.isInteger(cashoutId) || cashoutId <= 0) {
      return apiError(400, "Invalid Cash-Out ID");
    }

    const updated = await prisma.cashoutRequest.updateMany({
      where: { id: cashoutId, userId: user.id, status: "QUEUED" },
      data: { status: "CANCELLED" },
    });

    if (updated.count === 0) {
      return apiError(400, "Only queued Cash-Out requests can be cancelled.");
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
