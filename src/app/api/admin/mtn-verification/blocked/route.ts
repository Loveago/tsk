import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import {
  bulkRemoveBlockedMtnNumbers,
  clearAllBlockedMtnNumbers,
} from "@/lib/mtn-verification";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));
    const q = searchParams.get("q")?.trim();
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (status && status !== "ALL") {
      where.status = status;
    }
    if (q) {
      where.normalizedNumber = { contains: q };
    }

    const [items, total] = await Promise.all([
      prisma.blockedMtnNumber.findMany({
        where,
        orderBy: { lastSeenAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.blockedMtnNumber.count({ where }),
    ]);

    // Fetch user details for lastUserId if present
    const userIds = Array.from(
      new Set(items.map((i) => i.lastUserId || i.firstUserId).filter(Boolean) as string[])
    );
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    const enrichedItems = items.map((item) => {
      const user = (item.lastUserId && userMap.get(item.lastUserId)) ||
        (item.firstUserId && userMap.get(item.firstUserId)) || null;
      return {
        ...item,
        user,
      };
    });

    return NextResponse.json({
      data: enrichedItems,
      total,
      page,
      pageSize,
      pages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const clearAll = searchParams.get("all") === "true";

    if (clearAll) {
      const count = await clearAllBlockedMtnNumbers(admin.email);
      return NextResponse.json({ success: true, count, clearedAll: true });
    }

    if (id) {
      const count = await bulkRemoveBlockedMtnNumbers([id], admin.email);
      return NextResponse.json({ success: true, count: 1 });
    }

    const body = await request.json().catch(() => ({}));
    if (body.all === true) {
      const count = await clearAllBlockedMtnNumbers(admin.email);
      return NextResponse.json({ success: true, count, clearedAll: true });
    }

    if (Array.isArray(body.ids) && body.ids.length > 0) {
      const count = await bulkRemoveBlockedMtnNumbers(body.ids, admin.email);
      return NextResponse.json({ success: true, count });
    }

    return apiError(400, "Either 'all: true' or a list of 'ids' is required");
  } catch (err) {
    return handleRouteError(err);
  }
}
