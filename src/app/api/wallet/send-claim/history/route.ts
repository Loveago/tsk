import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));

    const where = { userId: user.id };

    const [claims, total] = await Promise.all([
      prisma.sendClaim.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          transactionReference: true,
          claimedAmount: true,
          network: true,
          senderPhone: true,
          status: true,
          createdAt: true,
          processedAt: true,
          rejectionReason: true,
        },
      }),
      prisma.sendClaim.count({ where }),
    ]);

    return NextResponse.json({
      claims,
      total,
      page,
      pageSize,
      pages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

