import ExcelJS from "exceljs";
import { prisma } from "./prisma";
import { recordAudit } from "./audit";
import { nextExportCode } from "./batches";
import { recomputeBatchStatus, type Actor } from "./orders";
import { parseOrderCode } from "./utils";
import type { OrderStatus } from "./types";

// ---------------------------------------------------------------------------
// Excel workbook builder (§8)
// ---------------------------------------------------------------------------

export interface ExportWorkbookMeta {
  network: string;
  exportCode: string;
  exportedBy: string;
  exportedAt: Date;
  isReexport?: boolean;
}

export interface ExportWorkbookRow {
  id: number;
  phoneNumber: string;
  gbAmount: number;
  amount: number;
  packageName?: string | null;
  batchCode?: string | null;
}

export async function buildOrdersWorkbook(
  rows: ExportWorkbookRow[],
  meta: ExportWorkbookMeta
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Tskconnect";
  wb.created = meta.exportedAt;

  // One sheet per network, named after the network
  const ws = wb.addWorksheet(meta.network.slice(0, 30), {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ws.columns = [{ width: 18 }, { width: 14 }];

  // Header row — Phone Number | Volume (GB), yellow like the vendor template
  const header = ws.addRow(["Phone Number", "Volume (GB)"]);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.height = 20;
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC000" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });

  // Data rows — just the number and the GB, nothing else
  for (const row of rows) {
    // Phone number written as text so leading zeros survive
    ws.addRow([row.phoneNumber, row.gbAmount]);
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}
// ---------------------------------------------------------------------------
// Export workflow (§27, §28, §31)
// ---------------------------------------------------------------------------

export interface ExportOrdersInput {
  network: string;
  actor: Actor;
  /** Explicit retry/re-export of specific orders. */
  orderIds?: number[];
  /** Restrict to these order batches. */
  batchIds?: string[];
  userId?: string;
  packageId?: string;
  from?: string;
  to?: string;
  isReexport?: boolean;
  reason?: string;
  /**
   * Status to move the exported orders into. Defaults to PROCESSING.
   * When set to PENDING the orders are exported but their status is unchanged.
   */
  targetStatus?: string;
  /** Exact volume filter in MB (overrides min/max when set). */
  volumeExactMb?: number;
  /** Minimum volume filter in MB (inclusive). */
  volumeMinMb?: number;
  /** Maximum volume filter in MB (inclusive). */
  volumeMaxMb?: number;
  /** Format of the exported file: "excel" (default) or "txt". */
  format?: "excel" | "txt";
  /** Optional status filter (e.g. "REFUNDED" to export refunds without changing status). */
  status?: string;
  /** Optional search query when exporting by status. */
  q?: string;
}

export interface ExportOrdersResult {
  buffer: Buffer;
  fileName: string;
  exportCode: string;
  exportBatchId: string;
  count: number;
  totalGb: number;
  totalAmount: number;
  orderIds: number[];
  statusPreserved?: boolean;
}

/**
 * Builds Prisma `OR` search conditions matching `/api/admin/orders` for `q`.
 */
export function buildOrderSearchOr(q: string): Record<string, unknown>[] {
  const trimmed = q.trim();
  const parsedId = parseOrderCode(trimmed);
  const idMatch = trimmed.match(/^(?:ORD-|API-)?0*(\d+)$/i);
  const orConditions: Record<string, unknown>[] = [
    { phoneNumber: { contains: trimmed } },
    { externalReference: { contains: trimmed } },
    { providerReference: { contains: trimmed } },
    { failureReason: { contains: trimmed } },
    { user: { is: { email: { contains: trimmed } } } },
    { user: { is: { name: { contains: trimmed } } } },
  ];
  if (/^\d{7,13}$/.test(trimmed)) {
    if (trimmed.startsWith("0")) {
      orConditions.push({ phoneNumber: { contains: trimmed.slice(1) } });
    } else {
      orConditions.push({ phoneNumber: { contains: `0${trimmed}` } });
    }
  }
  if (parsedId !== null && parsedId < 2147483647) {
    orConditions.push({ id: parsedId });
  } else if (idMatch && Number(idMatch[1]) < 2147483647) {
    orConditions.push({ id: Number(idMatch[1]) });
  }
  return orConditions;
}

/**
 * Network-specific export:
 *  1. select eligible orders
 *  2. verify them
 *  3. generate the Excel file (before ANY status change)
 *  4. only if generation succeeded -> create ExportBatch, move PENDING -> targetStatus
 *     (REFUNDED orders are exported read-only without changing their status or fields)
 *  5. record status history + audit log + submit to provider
 * If file generation fails, orders stay untouched in the pending queue (§31).
 */
export async function exportOrdersToExcel(
  input: ExportOrdersInput
): Promise<ExportOrdersResult> {
  const isReexport = input.isReexport ?? false;

  // 1. Select eligible orders — never mix networks (§27)
  const where: Record<string, unknown> = { network: input.network, isSandbox: false };
  if (input.orderIds?.length) {
    where.id = { in: input.orderIds };
    where.status = { notIn: ["CANCELLED"] };
  } else if (input.status === "REFUNDED") {
    where.status = "REFUNDED";
  } else {
    where.status = isReexport ? { in: ["PROCESSING", "FAILED"] } : "PENDING";
    if (!isReexport) {
      where.exportBatchId = null;
    }
  }
  if (input.batchIds?.length) where.batchId = { in: input.batchIds };
  if (input.userId) where.userId = input.userId;
  if (input.packageId) where.packageId = input.packageId;
  if (input.from || input.to) {
    where.createdAt = {} as Record<string, Date>;
    if (input.from) (where.createdAt as Record<string, Date>).gte = new Date(input.from);
    if (input.to) (where.createdAt as Record<string, Date>).lte = new Date(input.to);
  }
  if (input.q?.trim()) {
    where.OR = buildOrderSearchOr(input.q);
  }
  // Volume filters: MB values from the dialog are converted to GB (orders store gbAmount in GB)
  if (input.volumeExactMb !== undefined) {
    where.gbAmount = input.volumeExactMb / 1024;
  } else if (input.volumeMinMb !== undefined || input.volumeMaxMb !== undefined) {
    const gbFilter: Record<string, number> = {};
    if (input.volumeMinMb !== undefined) gbFilter.gte = input.volumeMinMb / 1024;
    if (input.volumeMaxMb !== undefined) gbFilter.lte = input.volumeMaxMb / 1024;
    where.gbAmount = gbFilter;
  }

  // 2. Verify eligible orders right before export
  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: "asc" },
    include: {
      dataPackage: { select: { name: true } },
      batch: { select: { batchCode: true } },
    },
  });

  if (orders.length === 0) {
    throw new Error("No eligible orders found for this export.");
  }

  // Refunded orders are exported read-only so their REFUNDED status, failureReason,
  // and original exportBatchId/providerReference are never overwritten.
  const mutableOrders = orders.filter((o) => o.status !== "REFUNDED");
  const isRefundOnly = mutableOrders.length === 0;

  const exportCode = isRefundOnly ? "" : await nextExportCode();
  const exportedAt = new Date();
  const totalGb = orders.reduce((s, o) => s + o.gbAmount, 0);
  const totalAmount = orders.reduce((s, o) => s + o.amount, 0);
  // File name starts with the network: MTN_EX-0001.xlsx, Telecel_EX-0002.xlsx, or MTN_REFUNDS_2026-11-16.xlsx
  const format = input.format ?? "excel";
  const ext = format === "txt" ? "txt" : "xlsx";
  const fileName = isRefundOnly
    ? `${input.network}_REFUNDS_${exportedAt.toISOString().slice(0, 10)}.${ext}`
    : `${input.network}_${exportCode}.${ext}`;

  // 3. Generate the file FIRST — failure here leaves orders untouched
  let buffer: Buffer;
  if (format === "txt") {
    const lines = orders.map((o) => {
      const gb = Number.isInteger(o.gbAmount)
        ? String(o.gbAmount)
        : o.gbAmount.toFixed(3).replace(/\.?0+$/, "");
      return `${o.phoneNumber} ${gb}`;
    });
    buffer = Buffer.from(lines.join("\n"), "utf8");
  } else {
    buffer = await buildOrdersWorkbook(
      orders.map((o) => ({
        id: o.id,
        phoneNumber: o.phoneNumber,
        gbAmount: o.gbAmount,
        amount: o.amount,
        packageName: o.dataPackage?.name ?? null,
        batchCode: o.batch?.batchCode ?? null,
      })),
      {
        network: input.network,
        exportCode,
        exportedBy: input.actor.label,
        exportedAt,
        isReexport,
      }
    );
  }

  // 4. Status update only after successful file generation (§31)
  if (isRefundOnly) {
    await recordAudit({
      userId: input.actor.id,
      actorLabel: input.actor.label,
      action: "export.refunds",
      target: `refunds:${input.network}`,
      newValue: JSON.stringify({
        network: input.network,
        format,
        orders: orders.length,
        totalGb,
        totalAmount,
        orderIds: orders.map((o) => o.id),
      }),
    });

    return {
      buffer,
      fileName,
      exportCode: "",
      exportBatchId: "",
      count: orders.length,
      totalGb,
      totalAmount,
      orderIds: orders.map((o) => o.id),
      statusPreserved: true,
    };
  }

  const mutableTotalGb = mutableOrders.reduce((s, o) => s + o.gbAmount, 0);
  const mutableTotalAmount = mutableOrders.reduce((s, o) => s + o.amount, 0);
  const batchIds = [...new Set(mutableOrders.map((o) => o.batchId).filter(Boolean))] as string[];

  const exportBatch = await prisma.$transaction(async (tx) => {
    const created = await tx.exportBatch.create({
      data: {
        exportCode,
        network: input.network,
        adminId: input.actor.id,
        adminLabel: input.actor.label,
        totalRecipients: mutableOrders.length,
        totalGb: mutableTotalGb,
        totalAmount: mutableTotalAmount,
        status: (input.targetStatus ?? "PROCESSING") as any,
        fileName,
        isReexport,
        note: input.reason ?? null,
      },
    });

    for (const order of mutableOrders) {
      const previousStatus = order.status;
      const nextStatus: OrderStatus = isReexport
        ? (order.status as OrderStatus)
        : ((input.targetStatus ?? "PROCESSING") as OrderStatus);

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: nextStatus,
          exportBatchId: created.id,
          exportCount: { increment: 1 },
          lastExportedAt: exportedAt,
          lastExportedBy: input.actor.label,
          failureReason: null,
          providerReference: order.providerReference?.startsWith("CLICKYFIED:")
            ? order.providerReference
            : `MANUAL_EXPORT:${exportCode}`,
        },
      });

      if (previousStatus !== nextStatus) {
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            status: nextStatus,
            previousStatus,
            note: `Exported to ${format.toUpperCase()} in ${exportCode} by ${input.actor.label}`,
            changedBy: input.actor.label,
          },
        });
      }
    }

    if (batchIds.length > 0) {
      await tx.exportBatch.update({
        where: { id: created.id },
        data: { batches: { set: batchIds.map((id) => ({ id })) } },
      });
    }

    return created;
  });

  // Recompute affected order-batch statuses
  for (const batchId of batchIds) {
    await recomputeBatchStatus(batchId);
  }

  // Audit log (§37)
  await recordAudit({
    userId: input.actor.id,
    actorLabel: input.actor.label,
    action: isReexport ? "export.reexport" : "export.create",
    target: `export:${exportCode}`,
    newValue: JSON.stringify({
      network: input.network,
      orders: orders.length,
      totalGb,
      totalAmount,
      orderIds: orders.map((o) => o.id),
    }),
  });

  return {
    buffer,
    fileName,
    exportCode,
    exportBatchId: exportBatch.id,
    count: orders.length,
    totalGb,
    totalAmount,
    orderIds: orders.map((o) => o.id),
  };
}