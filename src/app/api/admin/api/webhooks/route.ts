import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";
import { processDueWebhookRetries } from "@/lib/webhooks";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const status = url.searchParams.get("status")?.trim().toUpperCase();

    // Trigger due retries opportunistically in background
    processDueWebhookRetries(20).catch(() => undefined);

    const [webhooks, deliveries] = await Promise.all([
      prisma.apiWebhook.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, name: true, email: true } },
          _count: { select: { deliveries: true } },
        },
      }),
      prisma.apiWebhookDelivery.findMany({
        where: status && status !== "ALL" ? { status } : {},
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          webhook: {
            include: {
              user: { select: { email: true, name: true } },
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      webhooks,
      deliveries: deliveries.map((d) => ({
        ...d,
        orderCode: d.orderId ? `API-${d.orderId}` : null,
      })),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST() {
  try {
    await requireAdmin();
    const result = await processDueWebhookRetries(50);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return handleRouteError(err);
  }
}
