import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";
import { detectNetworkNameByPrefix } from "@/lib/phone-utils";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const format = (searchParams.get("format") ?? "txt").toLowerCase() === "csv" ? "csv" : "txt";
    const q = searchParams.get("q")?.trim();
    const idsParam = searchParams.get("ids")?.trim();

    const where: Record<string, unknown> = {};

    if (idsParam) {
      const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
      if (ids.length > 0) {
        where.id = { in: ids };
      }
    } else if (q) {
      where.OR = [
        { normalizedNumber: { contains: q } },
        { number: { contains: q } },
        { reason: { contains: q, mode: "insensitive" } },
      ];
    }

    const records = await prisma.blockedNumber.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: { id: true, number: true, normalizedNumber: true, reason: true, blockedBy: true, createdAt: true },
    });

    const nowStr = new Date().toISOString().slice(0, 10);
    let content = "";
    let filename = "";
    let mimeType = "";

    if (format === "csv") {
      filename = `blocked-phone-numbers-${nowStr}.csv`;
      mimeType = "text/csv; charset=utf-8";
      const rows = [
        ["Phone Number", "Normalized", "Network", "Reason", "Blocked By", "Date Added"],
        ...records.map((r) => [
          r.number,
          r.normalizedNumber,
          detectNetworkNameByPrefix(r.normalizedNumber),
          r.reason || "",
          r.blockedBy || "",
          r.createdAt.toISOString(),
        ]),
      ];
      content = rows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    } else {
      filename = `blocked-phone-numbers-${nowStr}.txt`;
      mimeType = "text/plain; charset=utf-8";
      content = records.map((r) => r.normalizedNumber).join("\n");
    }

    return new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
