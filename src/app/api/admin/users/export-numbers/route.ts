import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";
import { normalizeGhanaPhoneNumber, isValidGhanaPhoneNumber } from "@/lib/mtn-verification";
import { toCsv, toXlsx, exportResponse, type ExportColumn } from "@/lib/exports";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const format = (searchParams.get("format") ?? "txt").toLowerCase() as "txt" | "csv" | "xlsx";
    const status = searchParams.get("status");
    const role = searchParams.get("role");

    const where: Record<string, unknown> = {};
    if (status && status !== "ALL") where.status = status;
    if (role && role !== "ALL") where.role = role;

    // Fetch users with phone numbers
    const users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        balance: true,
        createdAt: true,
        _count: { select: { orders: true } },
      },
    });

    const nowStr = new Date().toISOString().slice(0, 10);
    const filename = `tskconnect-user-phone-numbers-${nowStr}`;

    // Filter, normalize and collect phone numbers
    const cleanNumbersSet = new Set<string>();
    const userRowsWithPhone: Array<{
      phone: string;
      name: string;
      email: string;
      role: string;
      status: string;
      balance: number;
      orders: number;
      createdAt: string;
    }> = [];

    for (const u of users) {
      if (!u.phone) continue;
      const normalized = normalizeGhanaPhoneNumber(u.phone);
      if (normalized && (isValidGhanaPhoneNumber(normalized) || normalized.length >= 9)) {
        cleanNumbersSet.add(normalized);
        userRowsWithPhone.push({
          phone: normalized,
          name: u.name,
          email: u.email,
          role: u.role,
          status: u.status,
          balance: u.balance,
          orders: u._count.orders,
          createdAt: u.createdAt.toISOString().slice(0, 10),
        });
      }
    }

    if (format === "txt") {
      const content = Array.from(cleanNumbersSet).join("\n");
      return new Response(content, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}.txt"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const columns: ExportColumn[] = [
      { key: "phone", header: "Phone Number", width: 16 },
      { key: "name", header: "Name", width: 22 },
      { key: "email", header: "Email", width: 28 },
      { key: "role", header: "Role", width: 10 },
      { key: "status", header: "Status", width: 12 },
      { key: "balance", header: "Balance (GHS)", width: 14 },
      { key: "orders", header: "Orders", width: 10 },
      { key: "createdAt", header: "Registered", width: 14 },
    ];

    if (format === "csv") {
      const csvStr = toCsv(userRowsWithPhone, columns);
      return exportResponse(csvStr, "csv", filename);
    }

    // Default to xlsx
    const xlsxBuf = await toXlsx(userRowsWithPhone, columns, "User Phone Numbers");
    return exportResponse(xlsxBuf, "xlsx", filename);
  } catch (err) {
    return handleRouteError(err);
  }
}
