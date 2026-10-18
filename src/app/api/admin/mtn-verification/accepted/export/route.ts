import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";

const CHUNK_SIZE = 50_000; // 50k rows per page minimizes round trips for 2M+ rows

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

    const where: Prisma.AcceptedMtnNumberWhereInput = {};

    if (idsParam) {
      const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
      if (ids.length > 0) {
        where.id = { in: ids };
      }
    } else {
      if (source && source !== "ALL") {
        const sourceCond =
          source === "CLICKYFIED_API" || source === "CLICKYFIED"
            ? {
                OR: [
                  { source: "CLICKYFIED_API" },
                  { source: "CLICKYFIED" },
                  { source: { contains: "CLICKYFIED", mode: "insensitive" as const } },
                  { verifiedBy: { contains: "Clickyfied", mode: "insensitive" as const } },
                  { verifiedBy: { contains: "Automated Verification API", mode: "insensitive" as const } },
                ],
              }
            : { source };

        if (where.OR) {
          where.AND = [{ OR: where.OR }, sourceCond];
          delete where.OR;
        } else {
          Object.assign(where, sourceCond);
        }
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

    const nowStr = new Date().toISOString().slice(0, 10);
    const filename =
      format === "csv"
        ? `accepted-mtn-numbers-${nowStr}.csv`
        : `accepted-mtn-numbers-${nowStr}.txt`;
    const mimeType = format === "csv" ? "text/csv" : "text/plain";

    const encoder = new TextEncoder();

    type TxtRow = { id: string; number: string | null };
    type CsvRow = { id: string; number: string | null; source: string | null; verifiedAt: Date | null; createdAt: Date };

    async function fetchPageTxt(lastId: string | undefined): Promise<TxtRow[]> {
      return prisma.acceptedMtnNumber.findMany({
        where,
        orderBy: { id: "asc" },
        take: CHUNK_SIZE,
        ...(lastId ? { cursor: { id: lastId }, skip: 1 } : {}),
        select: { id: true, number: true },
      }) as Promise<TxtRow[]>;
    }

    async function fetchPageCsv(lastId: string | undefined): Promise<CsvRow[]> {
      return prisma.acceptedMtnNumber.findMany({
        where,
        orderBy: { id: "asc" },
        take: CHUNK_SIZE,
        ...(lastId ? { cursor: { id: lastId }, skip: 1 } : {}),
        select: { id: true, number: true, source: true, verifiedAt: true, createdAt: true },
      }) as Promise<CsvRow[]>;
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          let lastId: string | undefined = undefined;
          let done = false;

          if (format === "csv") {
            controller.enqueue(encoder.encode("number,source,verifiedAt\n"));
            while (!done) {
              const chunk = await fetchPageCsv(lastId);
              if (chunk.length === 0) {
                done = true;
                break;
              }

              let chunkText = "";
              for (let i = 0; i < chunk.length; i++) {
                const r = chunk[i];
                const dateVal = r.verifiedAt ?? r.createdAt;
                const iso = dateVal instanceof Date ? dateVal.toISOString() : (dateVal ? new Date(dateVal).toISOString() : "");
                const num = (r.number ?? "").replace(/"/g, '""');
                const src = (r.source ?? "").replace(/"/g, '""');
                chunkText += `"${num}","${src}","${iso}"\n`;
              }

              controller.enqueue(encoder.encode(chunkText));
              lastId = chunk[chunk.length - 1].id;
              if (chunk.length < CHUNK_SIZE) done = true;
            }
          } else {
            while (!done) {
              const chunk = await fetchPageTxt(lastId);
              if (chunk.length === 0) {
                done = true;
                break;
              }

              let chunkText = "";
              for (let i = 0; i < chunk.length; i++) {
                const num = chunk[i].number?.trim();
                if (num) chunkText += num + "\n";
              }

              controller.enqueue(encoder.encode(chunkText));
              lastId = chunk[chunk.length - 1].id;
              if (chunk.length < CHUNK_SIZE) done = true;
            }
          }

          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });


    return new NextResponse(stream, {
      status: 200,
      headers: {
        "Content-Type": `${mimeType}; charset=utf-8`,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        // Tell the browser we're streaming; no Content-Length known upfront.
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
