import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getCashoutConfig, normalizeCashoutPhone } from "@/lib/cashout";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function GET() {
  try {
    const user = await requireUser();
    const config = await getCashoutConfig();

    const requests = await prisma.cashoutRequest.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 25,
    });

    return NextResponse.json({
      enabled: config.enabled,
      minAmount: config.minAmount,
      maxAmount: config.maxAmount,
      requests,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const config = await getCashoutConfig();

    if (!config.enabled) {
      return apiError(400, "Cash-Out deposit is currently disabled.");
    }

    const body = await request.json().catch(() => ({}));
    const phone = normalizeCashoutPhone(String(body.phone || ""));
    const amount = Number(body.amount);

    if (phone.length !== 10 || !phone.startsWith("0")) {
      return apiError(400, "Enter a valid 10-digit Ghana MoMo number (e.g. 0241234567).");
    }

    if (!Number.isFinite(amount) || amount < config.minAmount || amount > config.maxAmount) {
      return apiError(
        400,
        `Amount must be between GHS ${config.minAmount.toFixed(2)} and GHS ${config.maxAmount.toFixed(2)}.`
      );
    }

    const roundedAmount = Math.round(amount * 100) / 100;

    // Prevent accidental duplicate active request for same user + phone + amount within 2 minutes
    const recentActive = await prisma.cashoutRequest.findFirst({
      where: {
        userId: user.id,
        phone,
        amount: roundedAmount,
        status: { in: ["QUEUED", "PULLED", "AWAITING_SETTLEMENT"] },
        createdAt: { gte: new Date(Date.now() - 2 * 60 * 1000) },
      },
    });
    if (recentActive) {
      return NextResponse.json({ request: recentActive, reused: true });
    }

    const created = await prisma.cashoutRequest.create({
      data: {
        userId: user.id,
        phone,
        amount: roundedAmount,
        status: "QUEUED",
      },
    });

    await recordAudit({
      userId: user.id,
      actorLabel: user.email,
      action: "cashout.initiated",
      target: `cashout:${created.id}`,
      newValue: JSON.stringify({ phone, amount: roundedAmount }),
    });

    return NextResponse.json({ request: created }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
