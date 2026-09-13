import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { mtnBatchCreateSchema } from "@/lib/validation";
import { createVerificationBatch } from "@/lib/mtn-verification";
import { handleRouteError } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));
    const status = searchParams.get("status");
    const q = searchParams.get("q")?.trim();

    const where: Record<string, unknown> = {};
    if (status && status !== "ALL") {
      where.status = status;
    }
    if (q) {
      where.batchReference = { contains: q, mode: "insensitive" };
    }

    const [items, total] = await Promise.all([
      prisma.mtnVerificationBatch.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: {
            select: { numbers: true, requests: true, acceptedNumbers: true },
          },
        },
      }),
      prisma.mtnVerificationBatch.count({ where }),
    ]);

    return NextResponse.json({
      data: items,
      total,
      page,
      pageSize,
      pages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const input = mtnBatchCreateSchema.parse(body);

    const batch = await createVerificationBatch({
      requestIds: input.requestIds,
      actorLabel: admin.email,
    });

    return NextResponse.json({
      success: true,
      batch,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
