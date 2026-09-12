import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const env = url.searchParams.get("environment")?.trim().toUpperCase();
    const status = url.searchParams.get("status")?.trim().toUpperCase();

    const where: any = {};
    if (env && env !== "ALL") where.environment = env;
    if (status && status !== "ALL") where.status = status;

    const credentials = await prisma.apiCredential.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true, role: true, status: true } },
        _count: { select: { logs: true, orders: true } },
      },
    });

    return NextResponse.json({ credentials });
  } catch (err) {
    return handleRouteError(err);
  }
}
