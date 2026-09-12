import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, getClientIp } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { z } from "zod";

const topupSchema = z.object({
  amount: z.coerce.number().positive("Amount must be positive"),
  reference: z.string().trim().min(4, "Enter the MoMo transaction reference").max(100),
  note: z.string().trim().max(500).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const input = topupSchema.parse(body);

    if (input.amount < 1) return apiError(400, "Minimum top-up is GHS 1.00");

    const tx = await prisma.walletTransaction.create({
      data: {
        userId: user.id,
        type: "TOPUP",
        amount: input.amount,
        status: "PENDING",
        reference: input.reference,
        note: input.note ?? null,
      },
    });

    await recordAudit({
      userId: user.id,
      actorLabel: user.email,
      action: "billing.topup_request",
      target: `transaction:${tx.id}`,
      newValue: JSON.stringify({ amount: input.amount, reference: input.reference }),
      ip: await getClientIp(),
    });

    return NextResponse.json({ transaction: tx });
  } catch (err) {
    return handleRouteError(err);
  }
}
