import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const status = url.searchParams.get("status")?.trim().toUpperCase();

    const where: any = {};
    if (status && status !== "ALL") {
      where.status = status;
    }

    const applications = await prisma.apiApplication.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            status: true,
            role: true,
          },
        },
      },
    });

    return NextResponse.json({ applications });
  } catch (err) {
    return handleRouteError(err);
  }
}
