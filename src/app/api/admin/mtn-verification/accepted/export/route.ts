import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const format = (searchParams.get("format") ?? "txt").toLowerCase() === "csv" ? "csv" : "txt";
    const source = searchParams.get("source");
    const q = searchParams.get("q")?.trim();
    const idsParam = searchParams.get("ids")?.trim();
    const batchId = searchParams.get("batchId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where: Record<string, unknown> = {};

    if (idsParam) {
      const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
      if (ids.length > 0) {
        where.id = { in: ids };
      }
    } else {
      if (source && source !== "ALL") {
        where.source = source;
      }
      if (batchId) {
        where.batchId = batchId;
      }
      if (q) {
        where.OR = [
          { normalizedNumber: { contains: q } },
          { number: { contains: q } },
        ];
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
    }

    const records = await prisma.acceptedMtnNumber.findMany({
      where,
      orderBy: { number: "asc" },
      select: { id: true, number: true, source: true, verifiedAt: true, createdAt: true },
    });

    const nowStr = new Date().toISOString().slice(0, 10);
    let content = "";
    let filename = "";
    let mimeType = "";

    if (format === "csv") {
      const rows = records.map((r) => {
        const dateVal = r.verifiedAt ?? r.createdAt;
        const iso = dateVal instanceof Date ? dateVal.toISOString() : (dateVal ? new Date(dateVal).toISOString() : "");
        const num = (r.number ?? "").replace(/"/g, '""');
        const src = (r.source ?? "").replace(/"/g, '""');
        return `"${num}","${src}","${iso}"`;
      });
      content = "number,source,verifiedAt\n" + rows.join("\n");
      filename = `accepted-mtn-numbers-${nowStr}.csv`;
      mimeType = "text/csv";
    } else {
      content = records
        .map((r) => r.number?.trim())
        .filter((num): num is string => Boolean(num))
        .join("\n");
      filename = `accepted-mtn-numbers-${nowStr}.txt`;
      mimeType = "text/plain";
    }

    return new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": `${mimeType}; charset=utf-8`,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
