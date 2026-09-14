import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { changeOrderStatus, deriveCompletedAt } from "@/lib/orders";
import { reportWindowEnd, isWithinReportWindow, ACTIVE_DELIVERY_REPORT_STATUSES } from "@/lib/types";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const orderId = Number(id);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        history: { orderBy: { createdAt: "asc" } },
        batch: { select: { id: true, batchCode: true, network: true, status: true } },
        deliveryReports: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            seq: true,
            status: true,
            reason: true,
            message: true,
            adminNote: true,
            adminResponse: true,
            respondedAt: true,
            proofImageMime: true,
            proofImageUploadedAt: true,
            resolvedAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!order) return apiError(404, "Order not found");
    if (order.userId !== user.id && user.role !== "ADMIN" && user.role !== "MANAGER") {
      return apiError(403, "Not allowed");
    }

    const { deliveryReports, ...safeOrder } = order;
    const activeReport = deliveryReports.find((r) =>
      (ACTIVE_DELIVERY_REPORT_STATUSES as string[]).includes(r.status)
    ) ?? deliveryReports[0] ?? null;

    // Configurable "Not Received" reporting window (§3/§6)
    const { getSetting } = await import("@/lib/orders");
    const windowHours = parseInt(await getSetting("report_not_received_window_hours", "24"), 10);
    const completedAt = deriveCompletedAt(order);
    const deadline = completedAt ? reportWindowEnd(completedAt, windowHours) : null;

    return NextResponse.json({
      order: {
        ...safeOrder,
        deliveryReport: activeReport,
        reportWindow: {
          completedAt,
          deadline,
          open: isWithinReportWindow(completedAt, new Date(), windowHours),
          hasReport: !!activeReport,
          windowHours,
        },
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

/** User cancels own pending order (§7): only before it enters the export flow. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const orderId = Number(id);

    const body = await request.json().catch(() => ({}));
    if (body?.action !== "CANCEL") return apiError(400, "Unsupported action");

    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return apiError(403, "Order cancellation feature has been disabled.");
    }

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return apiError(404, "Order not found");
    if (order.userId !== user.id && user.role !== "ADMIN" && user.role !== "MANAGER") return apiError(403, "Not allowed");
    if (order.status !== "PENDING") {
      return apiError(409, "Only pending orders can be cancelled");
    }
    if (order.exportBatchId) {
      return apiError(409, "Order is already queued for processing");
    }

    await changeOrderStatus(orderId, "CANCELLED", body.reason || "Cancelled by user", {
      id: user.id,
      label: user.email,
    });

    await recordAudit({
      userId: user.id,
      actorLabel: user.email,
      action: "order.cancel",
      target: `order:${orderId}`,
      previousValue: JSON.stringify({ status: "PENDING" }),
      newValue: JSON.stringify({ status: "CANCELLED" }),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
