import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { recordAudit } from "@/lib/audit";
import { z } from "zod";

const webhookUpdateSchema = z.object({
  url: z.string().url("Enter a valid webhook URL (must start with http:// or https://)"),
  events: z.array(z.string()).min(1, "Select at least one event"),
  active: z.boolean().default(true),
  rotateSecret: z.boolean().optional(),
});

export async function GET() {
  try {
    const user = await requireUser();
    const webhook = await prisma.apiWebhook.findUnique({
      where: { userId: user.id },
      include: {
        deliveries: {
          orderBy: { createdAt: "desc" },
          take: 30,
        },
      },
    });

    return NextResponse.json({
      webhook: webhook
        ? {
            id: webhook.id,
            url: webhook.url,
            events: webhook.events.split(",").map((e) => e.trim()),
            active: webhook.active,
            secretMasked: webhook.secret ? `${webhook.secret.slice(0, 8)}••••••••` : null,
            createdAt: webhook.createdAt,
            updatedAt: webhook.updatedAt,
            deliveries: webhook.deliveries.map((d) => ({
              ...d,
              orderId: d.orderId ? `API-${d.orderId}` : null,
            })),
          }
        : null,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const input = webhookUpdateSchema.parse(body);

    let webhook = await prisma.apiWebhook.findUnique({
      where: { userId: user.id },
    });

    let newSecret: string | null = null;
    if (!webhook || input.rotateSecret) {
      newSecret = `whsec_${randomBytes(24).toString("hex")}`;
    }

    if (webhook) {
      webhook = await prisma.apiWebhook.update({
        where: { id: webhook.id },
        data: {
          url: input.url,
          events: input.events.join(","),
          active: input.active,
          ...(newSecret ? { secret: newSecret } : {}),
        },
      });
    } else {
      webhook = await prisma.apiWebhook.create({
        data: {
          userId: user.id,
          url: input.url,
          events: input.events.join(","),
          active: input.active,
          secret: newSecret!,
        },
      });
    }

    await recordAudit({
      userId: user.id,
      actorLabel: user.email,
      action: "webhook.configure",
      target: `webhook:${webhook.id}`,
      newValue: JSON.stringify({ url: input.url, active: input.active, rotatedSecret: !!newSecret }),
    });

    return NextResponse.json({
      success: true,
      webhook: {
        id: webhook.id,
        url: webhook.url,
        events: webhook.events.split(",").map((e) => e.trim()),
        active: webhook.active,
      },
      newSecret: newSecret || undefined, // Shown only when created or rotated
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
