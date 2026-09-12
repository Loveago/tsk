import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { deliverWebhook } from "@/lib/webhooks";
import { z } from "zod";

const retrySchema = z.object({
  deliveryId: z.string().min(1, "deliveryId is required"),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const { deliveryId } = retrySchema.parse(body);

    const delivery = await prisma.apiWebhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { webhook: true },
    });

    if (!delivery || delivery.webhook.userId !== user.id) {
      return apiError(404, "Webhook delivery not found");
    }

    // Increment attempt and mark PENDING
    await prisma.apiWebhookDelivery.update({
      where: { id: delivery.id },
      data: {
        attempt: { increment: 1 },
        status: "PENDING",
      },
    });

    const result = await deliverWebhook(delivery.id);

    const updated = await prisma.apiWebhookDelivery.findUnique({
      where: { id: delivery.id },
    });

    return NextResponse.json({
      success: result.success,
      delivery: updated,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
