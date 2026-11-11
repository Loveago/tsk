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
    const pageSizeRaw = searchParams.get("pageSize");
    const isAll = pageSizeRaw === "all" || pageSizeRaw === "0" || Number(pageSizeRaw) >= 10000;
    const pageSize = isAll
      ? 10000
      : Math.min(500, Math.max(1, Number(pageSizeRaw ?? 20)));
    const role = searchParams.get("role");
    const status = searchParams.get("status");
    const balance = searchParams.get("balance");
    const overdraft = searchParams.get("overdraft");
    const pricingProfileId = searchParams.get("pricingProfileId");
    const hasOrders = searchParams.get("hasOrders");
    const hasSignupCode = searchParams.get("hasSignupCode");
    const registrationPayment = searchParams.get("registrationPayment");
    const q = searchParams.get("q");

    const where: Record<string, unknown> = {};
    if (role) where.role = role;
    if (status) where.status = status;
    if (pricingProfileId) where.pricingProfileId = pricingProfileId;

    if (overdraft === "enabled") {
      where.overdraftEnabled = true;
    } else if (overdraft === "disabled") {
      where.overdraftEnabled = false;
    }

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

    if (registrationPayment === "paid") {
      where.walletTransactions = { some: { type: "SIGNUP_FEE", status: "APPROVED" } };
    } else if (registrationPayment === "pending") {
      where.walletTransactions = { some: { type: "SIGNUP_FEE", status: "PENDING" } };
    } else if (registrationPayment === "exempt") {
      where.walletTransactions = { none: { type: "SIGNUP_FEE" } };
    }

    if (q) {
      where.OR = [
        { email: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
        { walletTransactions: { some: { type: "SIGNUP_FEE", reference: { contains: q, mode: "insensitive" } } } },
      ];
    }

    const [
      data,
      total,
      allUsersCount,
      awaitingPaymentCount,
      zeroBalanceCount,
      frozenCount,
      activeCount,
      paidRegistrationCount,
      overdraftEnabledCount,
      negativeBalanceCount,
    ] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: isAll ? 0 : (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          balance: true,
          overdraftEnabled: true,
          overdraftLimit: true,
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
          walletTransactions: {
            where: { type: "SIGNUP_FEE" },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              reference: true,
              amount: true,
              status: true,
              note: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      }),
      prisma.user.count({ where }),
      prisma.user.count(),
      prisma.user.count({ where: { status: "PENDING_PAYMENT" } }),
      prisma.user.count({ where: { balance: 0 } }),
      prisma.user.count({ where: { status: "FROZEN" } }),
      prisma.user.count({ where: { status: "ACTIVE" } }),
      prisma.walletTransaction.count({ where: { type: "SIGNUP_FEE", status: "APPROVED" } }),
      prisma.user.count({ where: { overdraftEnabled: true } }),
      prisma.user.count({ where: { balance: { lt: 0 } } }),
    ]);

    const users = data.map((u) => {
      const regTx = u.walletTransactions?.[0] ?? null;
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        status: u.status,
        balance: u.balance,
        overdraftEnabled: u.overdraftEnabled,
        overdraftLimit: u.overdraftLimit,
        phone: u.phone,
        pricingProfileId: u.pricingProfileId,
        lastLoginAt: u.lastLoginAt,
        createdAt: u.createdAt,
        _count: u._count,
        signupCodeUsage: u.signupCodeUsage,
        registrationPayment: regTx
          ? {
              id: regTx.id,
              reference: regTx.reference,
              amount: regTx.amount,
              status: regTx.status,
              note: regTx.note,
              paidAt: regTx.status === "APPROVED" ? regTx.updatedAt : null,
              createdAt: regTx.createdAt,
            }
          : null,
      };
    });

    return NextResponse.json({
      data: users,
      total,
      page,
      pageSize,
      pages: isAll ? 1 : Math.max(1, Math.ceil(total / pageSize)),
      counts: {
        total: allUsersCount,
        awaitingPayment: awaitingPaymentCount,
        zeroBalance: zeroBalanceCount,
        frozen: frozenCount,
        active: activeCount,
        paidRegistration: paidRegistrationCount,
        overdraftEnabled: overdraftEnabledCount,
        negativeBalance: negativeBalanceCount,
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
        overdraftEnabled: input.overdraftEnabled ?? false,
        overdraftLimit: input.overdraftLimit ?? 0,
        pricingProfileId: input.pricingProfileId || null,
      },
    });

    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: "user.create",
      target: `user:${user.id}`,
      newValue: JSON.stringify({
        email,
        role: input.role,
        balance: input.balance,
        overdraftEnabled: input.overdraftEnabled ?? false,
        overdraftLimit: input.overdraftLimit ?? 0,
      }),
    });

    return NextResponse.json({ user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    return handleRouteError(err);
  }
}
