import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { createUserSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));
    const role = searchParams.get("role");
    const status = searchParams.get("status");
    const balance = searchParams.get("balance");
    const pricingProfileId = searchParams.get("pricingProfileId");
    const hasOrders = searchParams.get("hasOrders");
    const hasSignupCode = searchParams.get("hasSignupCode");
    const q = searchParams.get("q");

    const where: Record<string, unknown> = {};
    if (role) where.role = role;
    if (status) where.status = status;
    if (pricingProfileId) where.pricingProfileId = pricingProfileId;

    if (balance === "zero") {
      where.balance = { equals: 0 };
    } else if (balance === "positive") {
      where.balance = { gt: 0 };
    } else if (balance === "low") {
      where.balance = { gt: 0, lte: 10 };
    } else if (balance === "negative") {
      where.balance = { lt: 0 };
    }

    if (hasOrders === "yes") {
      where.orders = { some: {} };
    } else if (hasOrders === "no") {
      where.orders = { none: {} };
    }

    if (hasSignupCode === "yes") {
      where.signupCodeUsage = { isNot: null };
    } else if (hasSignupCode === "no") {
      where.signupCodeUsage = null;
    }

    if (q) {
      where.OR = [
        { email: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
      ];
    }

    const [data, total, awaitingPaymentCount, zeroBalanceCount, frozenCount, activeCount] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          balance: true,
          phone: true,
          pricingProfileId: true,
          lastLoginAt: true,
          createdAt: true,
          _count: { select: { orders: true } },
          signupCodeUsage: {
            select: {
              signupCode: { select: { code: true } },
              usedAt: true,
            },
          },
        },
      }),
      prisma.user.count({ where }),
      prisma.user.count({ where: { status: "PENDING_PAYMENT" } }),
      prisma.user.count({ where: { balance: 0 } }),
      prisma.user.count({ where: { status: "FROZEN" } }),
      prisma.user.count({ where: { status: "ACTIVE" } }),
    ]);

    return NextResponse.json({
      data,
      total,
      page,
      pageSize,
      pages: Math.ceil(total / pageSize),
      counts: {
        total,
        awaitingPayment: awaitingPaymentCount,
        zeroBalance: zeroBalanceCount,
        frozen: frozenCount,
        active: activeCount,
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
    const input = createUserSchema.parse(body);

    const email = input.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return apiError(409, "A user with this email already exists");

    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email,
        passwordHash,
        role: input.role,
        balance: input.balance,
        pricingProfileId: input.pricingProfileId || null,
      },
    });

    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: "user.create",
      target: `user:${user.id}`,
      newValue: JSON.stringify({ email, role: input.role, balance: input.balance }),
    });

    return NextResponse.json({ user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    return handleRouteError(err);
  }
}
