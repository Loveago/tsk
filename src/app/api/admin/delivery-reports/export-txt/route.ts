import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";

/**
 * Admin export: downloads a .txt file of Not Received reports (phone number + GB per line).
 * Supports optional date filtering via `from` and `to` query params (ISO strings)
 * and optional status filtering via the `status` query param.
 */
export async function GET(request: NextRequest) {
  try {
    await requireStaff();
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (from || to) {
      const createdAt: Record<string, Date> = {};
      if (from) createdAt.gte = new Date(from);
      if (to) createdAt.lte = new Date(to);
      where.createdAt = createdAt;
    }
    if (status) {
      if (status === "CONFIRM_SENT" || status === "DELIVERED") {
        where.status = { in: ["CONFIRM_SENT", "DELIVERED"] };
      } else if (status === "UNDER_REVIEW" || status === "OPEN") {
        where.status = { in: ["UNDER_REVIEW", "OPEN", "INVESTIGATING"] };
      } else {
        where.status = status;
      }
    }

    const reports = await prisma.deliveryReport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        order: {
          select: {
            phoneNumber: true,
            gbAmount: true,
          },
        },
      },
    });

    // Build plain text: one line per report → "phoneNumber GB"
    const lines = reports.map(
      (r) => `${r.order.phoneNumber} ${r.order.gbAmount}`
    );
    const content = lines.join("\n");

    // Build a human-friendly filename with the date range
    let datePart = "all";
    if (from) {
      const d = new Date(from);
      datePart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    const filename = `not-received-${datePart}.txt`;

    return new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
