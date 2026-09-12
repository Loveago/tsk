import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { recordAudit } from "@/lib/audit";
import { deliverWebhook } from "@/lib/webhooks";
import { z } from "zod";

const retrySchema = z.object({
  deliveryId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const { deliveryId } = retrySchema.parse(body);

    const delivery = await prisma.apiWebhookDelivery.findUnique({
      where: { id: deliveryId },
    });

    if (!delivery) {
      return apiError(404, "Delivery not found");
    }

    await prisma.apiWebhookDelivery.update({
      where: { id: delivery.id },
      data: {
        attempt: { increment: 1 },
        status: "PENDING",
      },
    });

    const result = await deliverWebhook(delivery.id);

    await recordAudit({
      userId: admin.id,
      actorLabel: admin.email,
      action: "admin.webhook.retry",
      target: `webhook_delivery:${delivery.id}`,
      newValue: JSON.stringify({ success: result.success }),
    });

    return NextResponse.json({
      success: result.success,
      statusCode: result.statusCode,
      error: result.error,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
