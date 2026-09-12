import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;

    const code = await prisma.signupCode.findUnique({
      where: { id },
      include: {
        usages: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                status: true,
                balance: true,
                createdAt: true,
              },
            },
          },
          orderBy: { usedAt: "desc" },
        },
      },
    });

    if (!code) return apiError(404, "Signup code not found");

    return NextResponse.json({
      code: code.code,
      totalUsages: code.usages.length,
      usages: code.usages,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

