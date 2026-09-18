import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { changeOrderStatus, bulkChangeOrderStatus } from "@/lib/orders";
import { orderStatusChangeSchema, bulkStatusSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { normalizeOrderStatus } from "@/lib/types";

export async function GET(request: NextRequest) {
  try {
    await requireStaff();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));
    const status = searchParams.get("status");
    const network = searchParams.get("network");
    const q = searchParams.get("q");
    const source = searchParams.get("source"); // WEB | API | STOREFRONT
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where: Record<string, unknown> = {};
    if (status) where.status = normalizeOrderStatus(status);
    if (network) where.network = network;
    if (source) where.source = source;
    if (from || to) {
      const createdAt: Record<string, Date> = {};
      if (from) createdAt.gte = new Date(from);
      if (to) createdAt.lte = new Date(to);
      where.createdAt = createdAt;
    }
    if (q) {
      where.OR = [
        { phoneNumber: { contains: q } },
        { user: { is: { email: { contains: q } } } },
        { user: { is: { name: { contains: q } } } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { name: true, email: true } },
          batch: { select: { batchCode: true } },
          storefrontOrder: {
            select: {
              seq: true,
              paymentReference: true,
              storefront: { select: { name: true, slug: true } },
            },
          },
        },
      }),
      prisma.order.count({ where }),
    ]);

    // On-demand sync for in-flight Clickyfied orders on this page (throttled to 120s and poller enabled)
    const pollerSetting = await prisma.systemSetting.findUnique({
      where: { key: "provider_sync_poller_enabled" },
    });
    const pollerEnabled = pollerSetting?.value !== "false";

    if (pollerEnabled) {
      const inFlightClickyfied = data.filter(
        (o) =>
          (o.status === "PENDING" || o.status === "PROCESSING") &&
          o.providerReference?.startsWith("CLICKYFIED:") &&
          Date.now() - new Date(o.updatedAt).getTime() > 120000
      );

      if (inFlightClickyfied.length > 0) {
        try {
          const { syncClickyfiedOrder } = await import("@/lib/provider-apis/router");
          await Promise.allSettled(
            inFlightClickyfied.slice(0, 5).map(async (o) => {
              const res = await syncClickyfiedOrder(o, "Admin Orders View Sync");
              if (res.changed && res.newStatus) {
                o.status = res.newStatus;
              }
            })
          );
        } catch (syncErr) {
          console.error("Admin on-demand orders sync error:", syncErr);
        }
      }
    }

    return NextResponse.json({
      data,
      total,
      page,
      pageSize,
      pages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireStaff();
    const body = await request.json();

    // Bulk status change
    if (Array.isArray(body.orderIds)) {
      const input = bulkStatusSchema.parse(body);
      const result = await bulkChangeOrderStatus(
        input.orderIds,
        input.status,
        input.reason ?? null,
        { id: actor.id, label: actor.email },
        { force: input.force }
      );
      await recordAudit({
        userId: actor.id,
        actorLabel: actor.email,
        action: "order.bulk_status",
        target: `orders:${input.orderIds.join(",")}`,
        newValue: JSON.stringify({ status: input.status, ...result }),
      });
      return NextResponse.json({ ok: true, ...result });
    }

    // Single status change
    const input = orderStatusChangeSchema.parse(body);
    const id = Number(body.id);
    if (!id) return apiError(400, "Order id is required");

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return apiError(404, "Order not found");

    const result = await changeOrderStatus(
      id,
      input.status,
      input.reason ?? null,
      { id: actor.id, label: actor.email },
      { force: input.force }
    );

    // Override transitions (e.g. SUCCESS -> REFUNDED) need explicit confirmation
    if (!result.changed && result.override) {
      return NextResponse.json(
        {
          error: "OVERRIDE_REQUIRED",
          message: `This transition requires admin override confirmation.`,
        },
        { status: 409 }
      );
    }

    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: "order.status_change",
      target: `order:${id}`,
      previousValue: JSON.stringify({ status: order.status }),
      newValue: JSON.stringify({ status: input.status, reason: input.reason, override: result.override ?? false }),
    });

    return NextResponse.json({ ok: true, changed: result.changed, override: result.override ?? false });
  } catch (err) {
    return handleRouteError(err);
  }
}
