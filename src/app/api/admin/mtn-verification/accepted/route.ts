import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import {
  addAcceptedMtnNumber,
  removeAcceptedMtnNumber,
  bulkRemoveAcceptedMtnNumbers,
} from "@/lib/mtn-verification";
import { mtnAcceptedAddSchema, mtnAcceptedBulkDeleteSchema } from "@/lib/validation";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));
    const q = searchParams.get("q")?.trim();
    const source = searchParams.get("source");
    const batchId = searchParams.get("batchId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where: Record<string, unknown> = {};
    if (q) {
      where.normalizedNumber = { contains: q };
    }
    if (source && source !== "ALL") {
      where.source = source;
    }
    if (batchId) {
      where.batchId = batchId;
    }
    if (from || to) {
      const dateFilter: Record<string, Date> = {};
      if (from) dateFilter.gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        dateFilter.lte = toDate;
      }
      where.createdAt = dateFilter;
    }

    const [items, total] = await Promise.all([
      prisma.acceptedMtnNumber.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          batch: {
            select: { id: true, batchReference: true },
          },
        },
      }),
      prisma.acceptedMtnNumber.count({ where }),
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
    const input = mtnAcceptedAddSchema.parse(body);

    const record = await addAcceptedMtnNumber(
      input.phoneNumber,
      "MANUAL",
      admin.email
    );

    return NextResponse.json({
      success: true,
      data: record,
    });
  } catch (err: any) {
    if (err.message && !err.status) {
      return apiError(400, err.message);
    }
    return handleRouteError(err);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (id) {
      // Single delete
      await removeAcceptedMtnNumber(id, admin.email);
      return NextResponse.json({ success: true, count: 1 });
    }

    // Bulk delete via body
    const body = await request.json();
    const input = mtnAcceptedBulkDeleteSchema.parse(body);

    const count = await bulkRemoveAcceptedMtnNumbers(input.ids, admin.email);
    return NextResponse.json({ success: true, count });
  } catch (err) {
    return handleRouteError(err);
  }
}
