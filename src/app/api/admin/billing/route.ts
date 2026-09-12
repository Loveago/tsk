import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { z } from "zod";

export async function GET(request: NextRequest) {
  try {
    await requireStaff();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { name: true, email: true, balance: true } } },
      }),
      prisma.walletTransaction.count({ where }),
    ]);

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

const decisionSchema = z.object({
  id: z.string(),
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().max(300).optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireStaff();
    const body = await request.json();
    const input = decisionSchema.parse(body);

    const tx = await prisma.walletTransaction.findUnique({
      where: { id: input.id },
      include: { user: true },
    });
    if (!tx) return apiError(404, "Transaction not found");
    if (tx.status !== "PENDING") return apiError(400, "Transaction already decided");

    if (input.decision === "APPROVED") {
      await prisma.$transaction([
        prisma.walletTransaction.update({
          where: { id: input.id },
          data: { status: "APPROVED", note: input.note ?? null },
        }),
        prisma.user.update({
          where: { id: tx.userId },
          data: { balance: { increment: tx.amount } },
        }),
      ]);
    } else {
      await prisma.walletTransaction.update({
        where: { id: input.id },
        data: { status: "REJECTED", note: input.note ?? null },
      });
    }

    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: `billing.topup_${input.decision.toLowerCase()}`,
      target: `transaction:${input.id}`,
      previousValue: JSON.stringify({ status: tx.status }),
      newValue: JSON.stringify({ status: input.decision, amount: tx.amount, user: tx.user.email }),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
