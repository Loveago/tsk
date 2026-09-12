import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiKey, ApiKeyError, logApiRequest } from "@/lib/api-auth";
import { handleRouteError } from "@/lib/api-helpers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { keyId, userId } = await requireApiKey(request);
    const orderId = Number(id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json({ success: false, error: "Invalid order id" }, { status: 400 });
    }

    const order = await prisma.order.findFirst({
      where: { id: orderId, userId },
      select: {
        id: true, phoneNumber: true, network: true, gbAmount: true, amount: true,
        status: true, failureReason: true, providerReference: true, createdAt: true, updatedAt: true,
        history: { orderBy: { createdAt: "asc" }, select: { status: true, note: true, createdAt: true } },
      },
    });

    const status = order ? 200 : 404;
    await logApiRequest(
      keyId, `/api/public/v1/orders/${id}`, "GET", status, !!order,
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
    );

    if (!order) {
      return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, order });
  } catch (err) {
    if (err instanceof ApiKeyError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    return handleRouteError(err);
  }
}
