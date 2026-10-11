import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { z } from "zod";

const updateOrderSchema = z.object({
  fulfillmentStatus: z.enum(["PENDING", "SENT", "CANCELLED"]).optional(),
  activationLink: z.string().trim().url().optional().nullable().or(z.literal("")),
  adminNotes: z.string().max(500).optional().nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaff();
    const { id } = await params;
    const body = await request.json();
    const input = updateOrderSchema.parse(body);

    const existing = await prisma.geminiProOrder.findUnique({
      where: { id },
    });
    if (!existing) {
      return apiError(404, "Gemini order not found");
    }

    const data: Record<string, unknown> = {};

    if (input.fulfillmentStatus !== undefined) {
      data.fulfillmentStatus = input.fulfillmentStatus;
      if (input.fulfillmentStatus === "SENT" && !existing.sentAt) {
        data.sentAt = new Date();
      }
    }

    if (input.activationLink !== undefined) {
      data.activationLink = input.activationLink?.trim() || null;
    }

    if (input.adminNotes !== undefined) {
      data.adminNotes = input.adminNotes?.trim() || null;
    }

    const updated = await prisma.geminiProOrder.update({
      where: { id },
      data,
    });

    return NextResponse.json({
      success: true,
      order: {
        id: updated.id,
        seq: updated.seq,
        code: `GMP-${String(updated.seq).padStart(5, "0")}`,
        customerEmail: updated.customerEmail,
        customerWhatsapp: updated.customerWhatsapp,
        amount: updated.amount,
        paymentReference: updated.paymentReference,
        paystackStatus: updated.paystackStatus,
        fulfillmentStatus: updated.fulfillmentStatus,
        activationLink: updated.activationLink,
        adminNotes: updated.adminNotes,
        paidAt: updated.paidAt?.toISOString() ?? null,
        sentAt: updated.sentAt?.toISOString() ?? null,
        createdAt: updated.createdAt.toISOString(),
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
