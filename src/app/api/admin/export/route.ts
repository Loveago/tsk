import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { toCsv, toXlsx, toPdf, exportResponse, type ExportColumn } from "@/lib/exports";

type ExportType = "orders" | "users" | "transactions";

const orderColumns: ExportColumn[] = [
  { key: "id", header: "Order ID", width: 12 },
  { key: "date", header: "Date", width: 20 },
  { key: "userName", header: "User", width: 20 },
  { key: "userEmail", header: "Email", width: 26 },
  { key: "phone", header: "Phone", width: 14 },
  { key: "network", header: "Network", width: 12 },
  { key: "gb", header: "GB", width: 8 },
  { key: "amount", header: "Amount (GHS)", width: 14 },
  { key: "status", header: "Status", width: 12 },
  { key: "source", header: "Source", width: 8 },
  { key: "reference", header: "Provider Ref", width: 18 },
  { key: "failureReason", header: "Failure Reason", width: 24 },
];

const userColumns: ExportColumn[] = [
  { key: "name", header: "Name", width: 22 },
  { key: "email", header: "Email", width: 28 },
  { key: "role", header: "Role", width: 10 },
  { key: "status", header: "Status", width: 10 },
  { key: "balance", header: "Balance (GHS)", width: 14 },
  { key: "orders", header: "Orders", width: 9 },
  { key: "lastLogin", header: "Last Login", width: 20 },
  { key: "createdAt", header: "Registered", width: 20 },
];

const txColumns: ExportColumn[] = [
  { key: "date", header: "Date", width: 20 },
  { key: "userName", header: "User", width: 20 },
  { key: "userEmail", header: "Email", width: 26 },
  { key: "type", header: "Type", width: 12 },
  { key: "amount", header: "Amount (GHS)", width: 14 },
  { key: "status", header: "Status", width: 10 },
  { key: "reference", header: "Reference", width: 20 },
  { key: "note", header: "Note", width: 26 },
];

const fmt = (d: Date | null | undefined) =>
  d ? d.toISOString().slice(0, 16).replace("T", " ") : "";

export async function GET(request: NextRequest) {
  try {
    await requireStaff();
    const { searchParams } = new URL(request.url);
    const type = (searchParams.get("type") ?? "orders") as ExportType;
    const format = (searchParams.get("format") ?? "xlsx") as "csv" | "xlsx" | "pdf";
    const status = searchParams.get("status");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    let rows: Record<string, unknown>[];
    let columns: ExportColumn[];
    let title: string;

    if (type === "users") {
      columns = userColumns;
      title = "Clickyfied — Users";
      const users = await prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { orders: true } } },
      });
      rows = users.map((u) => ({
        name: u.name, email: u.email, role: u.role, status: u.status,
        balance: u.balance, orders: u._count.orders,
        lastLogin: fmt(u.lastLoginAt), createdAt: fmt(u.createdAt),
      }));
    } else if (type === "transactions") {
      columns = txColumns;
      title = "Clickyfied — Wallet Transactions";
      const where: Record<string, unknown> = {};
      if (status) where.status = status;
      if (from || to) {
        where.createdAt = {};
        if (from) (where.createdAt as Record<string, Date>).gte = new Date(from);
        if (to) (where.createdAt as Record<string, Date>).lte = new Date(to);
      }
      const txs = await prisma.walletTransaction.findMany({
        where, orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true, email: true } } },
      });
      rows = txs.map((t) => ({
        date: fmt(t.createdAt), userName: t.user.name, userEmail: t.user.email,
        type: t.type, amount: t.amount, status: t.status, reference: t.reference, note: t.note,
      }));
    } else {
      columns = orderColumns;
      title = "Clickyfied — Orders";
      const where: Record<string, unknown> = {};
      if (status) where.status = status;
      if (from || to) {
        where.createdAt = {};
        if (from) (where.createdAt as Record<string, Date>).gte = new Date(from);
        if (to) (where.createdAt as Record<string, Date>).lte = new Date(to);
      }
      const orders = await prisma.order.findMany({
        where, orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true, email: true } } },
      });
      rows = orders.map((o) => ({
        id: o.id, date: fmt(o.createdAt), userName: o.user.name, userEmail: o.user.email,
        phone: o.phoneNumber, network: o.network, gb: o.gbAmount, amount: o.amount,
        status: o.status, source: o.source, reference: o.providerReference,
        failureReason: o.failureReason,
      }));
    }

    if (rows.length > 5000) rows = rows.slice(0, 5000);
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `clickyfied-${type}-${stamp}`;

    if (format === "csv") return exportResponse(toCsv(rows, columns), "csv", filename);
    if (format === "pdf") return exportResponse(await toPdf(title, rows, columns), "pdf", filename);
    return exportResponse(await toXlsx(rows, columns, title.split("— ")[1] ?? "Export"), "xlsx", filename);
  } catch (err) {
    return handleRouteError(err);
  }
}
