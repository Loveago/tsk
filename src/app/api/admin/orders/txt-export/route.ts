import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";

const CHUNK_SIZE = 2_000; // rows per cursor page

/**
 * GET /api/admin/orders/txt-export
 *
 * Query params:
 *   from         – ISO date string (start of range, inclusive). Defaults to today 00:00.
 *   to           – ISO date string (end of range, inclusive). Defaults to today 23:59:59.
 *   network      – Filter by network (MTN | TELECEL | AIRTELTIGO | AIRTELTIGO_BIGTIME). Optional.
 *   status       – Filter by order status. Optional.
 *   numbersOnly  – "true" to export ONLY phone numbers (1 per line). Includes all statuses.
 *   dedupe       – "true" to deduplicate phone numbers when numbersOnly is true.
 *
 * Formats:
 *   - numbersOnly=true: Strictly one phone number per line, no headers/footers, all order statuses.
 *   - default: Pipe-delimited details (phone | network | GB | amount | status | date) with footer.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);

    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const network = searchParams.get("network")?.trim() || undefined;
    const status = searchParams.get("status")?.trim() || undefined;
    const numbersOnly =
      searchParams.get("numbersOnly") === "true" ||
      searchParams.get("mode") === "numbers";
    const dedupe = searchParams.get("dedupe") === "true";

    // Default: today
    const now = new Date();
    const fromDate = fromParam ? new Date(fromParam) : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const toDate = toParam ? new Date(toParam) : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    // Ensure toDate covers the full end day (in case only a date string was passed)
    if (toParam && toDate.getHours() === 0 && toDate.getMinutes() === 0 && toDate.getSeconds() === 0) {
      toDate.setHours(23, 59, 59, 999);
    }

    // When numbersOnly is requested, include ALL order statuses (do not filter by status).
    const where: Prisma.OrderWhereInput = {
      createdAt: {
        gte: fromDate,
        lte: toDate,
      },
      ...(network ? { network } : {}),
      ...(!numbersOnly && status && status !== "ALL" ? { status } : {}),
    };

    // Build filename
    const fromStr = fromDate.toISOString().slice(0, 10);
    const toStr = toDate.toISOString().slice(0, 10);
    const filename = numbersOnly
      ? fromStr === toStr
        ? `numbers-${fromStr}.txt`
        : `numbers-${fromStr}-to-${toStr}.txt`
      : fromStr === toStr
        ? `orders-${fromStr}.txt`
        : `orders-${fromStr}-to-${toStr}.txt`;

    const encoder = new TextEncoder();

    type OrderRow = { id: number; phoneNumber: string; network: string; gbAmount: number; amount: number; status: string; createdAt: Date };

    /** Fetch one page of orders, typed explicitly so the ReadableStream callback can infer types. */
    async function fetchPage(lastId: number | undefined): Promise<OrderRow[]> {
      return prisma.order.findMany({
        where,
        orderBy: { id: "asc" },
        take: CHUNK_SIZE,
        ...(lastId !== undefined ? { cursor: { id: lastId }, skip: 1 } : {}),
        select: {
          id: true,
          phoneNumber: true,
          network: true,
          gbAmount: true,
          amount: true,
          status: true,
          createdAt: true,
        },
      }) as Promise<OrderRow[]>;
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          let lastId: number | undefined = undefined;
          let done = false;
          let totalLines = 0;
          const seen = dedupe ? new Set<string>() : null;

          while (!done) {
            const chunk: OrderRow[] = await fetchPage(lastId);

            if (chunk.length === 0) {
              done = true;
              break;
            }

            let chunkText = "";
            if (numbersOnly) {
              for (const order of chunk) {
                const num = (order.phoneNumber || "").trim();
                if (!num) continue;
                if (seen) {
                  if (seen.has(num)) continue;
                  seen.add(num);
                }
                chunkText += num + "\n";
              }
            } else {
              for (const order of chunk) {
                const date = order.createdAt instanceof Date
                  ? order.createdAt.toISOString().replace("T", " ").slice(0, 19)
                  : new Date(order.createdAt).toISOString().replace("T", " ").slice(0, 19);
                const gbDisplay = Number.isInteger(order.gbAmount)
                  ? `${order.gbAmount}GB`
                  : `${order.gbAmount.toFixed(2)}GB`;
                const amountDisplay = `GHS ${order.amount.toFixed(2)}`;
                chunkText +=
                  `${order.phoneNumber} | ${order.network} | ${gbDisplay} | ${amountDisplay} | ${order.status} | ${date}\n`;
              }
            }

            if (chunkText) {
              controller.enqueue(encoder.encode(chunkText));
            }
            totalLines += chunk.length;
            lastId = chunk[chunk.length - 1].id;

            if (chunk.length < CHUNK_SIZE) {
              done = true;
            }
          }

          // Append summary footer only for full order details
          if (!numbersOnly) {
            const footer = `\n--- Total: ${totalLines} order(s) | Exported: ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC ---\n`;
            controller.enqueue(encoder.encode(footer));
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
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
