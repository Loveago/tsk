import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const format = (searchParams.get("format") ?? "txt").toLowerCase() === "csv" ? "csv" : "txt";
    const status = searchParams.get("status");
    const q = searchParams.get("q")?.trim();
    const idsParam = searchParams.get("ids")?.trim();

    const where: Record<string, unknown> = {};

    if (idsParam) {
      const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
      if (ids.length > 0) {
        where.id = { in: ids };
      }
    } else {
      if (status && status !== "ALL") {
        where.status = status;
      }
      if (q) {
        where.normalizedNumber = { contains: q };
      }
    }

    const records = await prisma.blockedMtnNumber.findMany({
      where,
      orderBy: { lastSeenAt: "desc" },
    });

    const nowStr = new Date().toISOString().slice(0, 10);
    let content = "";
    let filename = "";
    let mimeType = "";

    if (format === "csv") {
      // Gather user details for CSV
      const userIds = Array.from(
        new Set(records.map((r) => r.lastUserId || r.firstUserId).filter(Boolean) as string[])
      );
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      });
      const userMap = new Map(users.map((u) => [u.id, u]));

      const header = "number,status,order_count,first_seen_at,last_seen_at,user_name,user_email\n";
      const rows = records.map((r) => {
        const uId = r.lastUserId || r.firstUserId;
        const u = uId ? userMap.get(uId) : null;
        const userName = u?.name ? `"${u.name.replace(/"/g, '""')}"` : '""';
        const userEmail = u?.email ? `"${u.email.replace(/"/g, '""')}"` : '""';
        return `"${r.number}","${r.status}",${r.orderCount},"${r.firstSeenAt.toISOString()}","${r.lastSeenAt.toISOString()}",${userName},${userEmail}`;
      });

      content = header + rows.join("\n");
      filename = `unverified-blocked-mtn-numbers-${nowStr}.csv`;
      mimeType = "text/csv";
    } else {
      // Plain text: one number per line for verification
      content = records.map((r) => r.number).join("\n");
      filename = `unverified-blocked-mtn-numbers-${nowStr}.txt`;
      mimeType = "text/plain";
    }

    return new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": `${mimeType}; charset=utf-8`,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
