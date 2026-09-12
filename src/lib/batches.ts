import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";

export interface ActorInfo {
  id: string;
  label: string;
}

/** Generates the next unique batch code, e.g. CF-BATCH-000184. */
export async function nextBatchCode(): Promise<string> {
  const count = await prisma.orderBatch.count();
  for (let i = 0; i < 50; i += 1) {
    const code = `CF-BATCH-${String(count + 1 + i).padStart(6, "0")}`;
    const exists = await prisma.orderBatch.findUnique({ where: { batchCode: code }, select: { id: true } });
    if (!exists) return code;
  }
  return `CF-BATCH-${Date.now().toString().slice(-8)}`;
}

/** Generates the next unique export code, e.g. CF-EXPORT-00091. */
export async function nextExportCode(): Promise<string> {
  const count = await prisma.exportBatch.count();
  for (let i = 0; i < 50; i += 1) {
    const code = `CF-EXPORT-${String(count + 1 + i).padStart(5, "0")}`;
    const exists = await prisma.exportBatch.findUnique({ where: { exportCode: code }, select: { id: true } });
    if (!exists) return code;
  }
  return `CF-EXPORT-${Date.now().toString().slice(-8)}`;
}

export interface BatchListFilters {
  network?: string | null;
  status?: string | null;
  userId?: string | null;
  packageId?: string | null;
  q?: string | null;
  from?: string | null;
  to?: string | null;
}

/** Builds the Prisma where clause for the admin batch list (§4 filters + phone-number search). */
export function buildBatchWhere(filters: BatchListFilters): Prisma.OrderBatchWhereInput {
  const where: Prisma.OrderBatchWhereInput = {};
  if (filters.network) where.network = filters.network;
  if (filters.status) where.status = filters.status;
  if (filters.userId) where.userId = filters.userId;
  if (filters.packageId) where.orders = { some: { packageId: filters.packageId } };
  if (filters.q) {
    where.OR = [
      { batchCode: { contains: filters.q } },
      { user: { is: { name: { contains: filters.q } } } },
      { user: { is: { email: { contains: filters.q } } } },
      { orders: { some: { phoneNumber: { contains: filters.q } } } },
    ];
  }
  if (filters.from || filters.to) {
    where.createdAt = {};
    if (filters.from) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(filters.from);
    if (filters.to) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(filters.to);
  }
  return where;
}

/** Per-status counts + per-batch aggregates for a page of batches (§24). */
export async function getBatchAggregates(batchIds: string[]) {
  if (batchIds.length === 0) return new Map<string, { counts: Record<string, number> }>();
  const grouped = await prisma.order.groupBy({
    by: ["batchId", "status"],
    where: { batchId: { in: batchIds } },
    _count: { _all: true },
  });
  const map = new Map<string, { counts: Record<string, number> }>();
  for (const row of grouped) {
    if (!row.batchId) continue;
    const entry = map.get(row.batchId) ?? { counts: {} };
    entry.counts[row.status] = row._count._all;
    map.set(row.batchId, entry);
  }
  return map;
}

export interface BatchStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
}

export function statsFromCounts(counts: Record<string, number> = {}): BatchStats {
  return {
    total: Object.values(counts).reduce((a, b) => a + b, 0),
    pending: counts["PENDING"] ?? 0,
    processing: counts["PROCESSING"] ?? 0,
    completed: counts["SUCCESS"] ?? 0,
    failed: counts["FAILED"] ?? 0,
    cancelled: counts["CANCELLED"] ?? 0,
  };
}

export function batchProgress(stats: BatchStats): number {
  if (stats.total === 0) return 0;
  return Math.round(((stats.completed + stats.cancelled) / stats.total) * 100);
}

/** Date-range quick filters (§4). Returns ISO strings for the batch list. */
export function quickDateRange(kind: string): { from?: string; to?: string } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  if (kind === "today") {
    return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() };
  }
  if (kind === "yesterday") {
    const y = new Date(now.getTime() - 86400000);
    return { from: startOfDay(y).toISOString(), to: endOfDay(y).toISOString() };
  }
  if (kind === "last7") {
    const s = new Date(now.getTime() - 7 * 86400000);
    return { from: startOfDay(s).toISOString(), to: endOfDay(now).toISOString() };
  }
  if (kind === "month") {
    return { from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)).toISOString(), to: endOfDay(now).toISOString() };
  }
  return {};
}