import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { signupCodeCreateSchema } from "@/lib/validation";
import { normalizeSignupCode } from "@/lib/signup-codes";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));

    const status = searchParams.get("status");
    const q = searchParams.get("q")?.trim();

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (q) {
      where.OR = [
        { code: { contains: q, mode: "insensitive" } },
        { notes: { contains: q, mode: "insensitive" } },
      ];
    }

    const [data, total, totalCodes, activeCodes, expiredCodes, exhaustedCodes, totalRegistrations] =
      await Promise.all([
        prisma.signupCode.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            _count: { select: { usages: true } },
          },
        }),
        prisma.signupCode.count({ where }),
        prisma.signupCode.count(),
        prisma.signupCode.count({ where: { status: "ACTIVE" } }),
        prisma.signupCode.count({ where: { status: "EXPIRED" } }),
        prisma.signupCode.count({ where: { status: "EXHAUSTED" } }),
        prisma.signupCodeUsage.count(),
      ]);

    return NextResponse.json({
      data,
      total,
      page,
      pageSize,
      pages: Math.ceil(total / pageSize),
      analytics: {
        totalCodes,
        activeCodes,
        expiredCodes,
        exhaustedCodes,
        totalRegistrations,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdmin();
    const body = await request.json();
    const input = signupCodeCreateSchema.parse(body);

    const normalizedCode = normalizeSignupCode(input.code);

    const existing = await prisma.signupCode.findUnique({
      where: { code: normalizedCode },
    });
    if (existing) {
      return apiError(409, `Signup code "${normalizedCode}" already exists`);
    }

    const code = await prisma.signupCode.create({
      data: {
        code: normalizedCode,
        status: "ACTIVE",
        maxUses: input.maxUses ?? null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        notes: input.notes || null,
        createdBy: actor.email,
      },
    });

    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: "signup_code.create",
      target: `signup-code:${code.id}`,
      newValue: JSON.stringify({ code: code.code, maxUses: code.maxUses }),
    });

    return NextResponse.json({ code });
  } catch (err) {
    return handleRouteError(err);
  }
}

