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

    const where: Record<string, unknown> = {};
    if (source && source !== "ALL") {
      where.source = source;
    }

    const records = await prisma.acceptedMtnNumber.findMany({
      where,
      orderBy: { number: "asc" },
      select: { number: true, source: true, verifiedAt: true },
    });

    const nowStr = new Date().toISOString().slice(0, 10);
    let content = "";
    let filename = "";
    let mimeType = "";

    if (format === "csv") {
      content = "number,source,verifiedAt\n" +
        records
          .map(
            (r) =>
              `"${r.number}","${r.source}","${r.verifiedAt.toISOString()}"`
          )
          .join("\n");
      filename = `accepted-mtn-numbers-${nowStr}.csv`;
      mimeType = "text/csv";
    } else {
      content = records.map((r) => r.number).join("\n");
      filename = `accepted-mtn-numbers-${nowStr}.txt`;
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
