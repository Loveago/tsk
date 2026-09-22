import ExcelJS from "exceljs";
import { prisma } from "./prisma";
import { getProvider } from "./provider";
import { recordAudit } from "./audit";
import { nextExportCode } from "./batches";
import { recomputeBatchStatus, type Actor } from "./orders";
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
}

/**
 * Network-specific export:
 *  1. select eligible orders
 *  2. verify them
 *  3. generate the Excel file (before ANY status change)
 *  4. only if generation succeeded -> create ExportBatch, move PENDING -> targetStatus
 *  5. record status history + audit log + submit to provider
 * If file generation fails, orders stay untouched in the pending queue (§31).
 */
export async function exportOrdersToExcel(
  input: ExportOrdersInput
): Promise<ExportOrdersResult> {
  const isReexport = input.isReexport ?? false;

  // 1. Select eligible orders — never mix networks (§27)
  const where: Record<string, unknown> = { network: input.network, isSandbox: false };
  where.status = isReexport ? { in: ["PROCESSING", "FAILED"] } : "PENDING";
  if (!isReexport) {
    where.exportBatchId = null;
  }
  if (input.orderIds?.length) where.id = { in: input.orderIds };
  if (input.batchIds?.length) where.batchId = { in: input.batchIds };
  if (input.userId) where.userId = input.userId;
  if (input.packageId) where.packageId = input.packageId;
  if (input.from || input.to) {
    where.createdAt = {} as Record<string, Date>;
    if (input.from) (where.createdAt as Record<string, Date>).gte = new Date(input.from);
    if (input.to) (where.createdAt as Record<string, Date>).lte = new Date(input.to);
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

  const exportCode = await nextExportCode();
  const exportedAt = new Date();
  const totalGb = orders.reduce((s, o) => s + o.gbAmount, 0);
  const totalAmount = orders.reduce((s, o) => s + o.amount, 0);
  // File name starts with the network: MTN_EX-0001.xlsx, Telecel_EX-0002.xlsx, ...
  const fileName = `${input.network}_${exportCode}.xlsx`;
  const batchIds = [...new Set(orders.map((o) => o.batchId).filter(Boolean))] as string[];

  // 3. Generate the Excel file FIRST — failure here leaves orders untouched
  const buffer = await buildOrdersWorkbook(
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

  // 4. Status update only after successful file generation (§31)
  const exportBatch = await prisma.$transaction(async (tx) => {
    const created = await tx.exportBatch.create({
      data: {
        exportCode,
        network: input.network,
        adminId: input.actor.id,
        adminLabel: input.actor.label,
        totalRecipients: orders.length,
        totalGb,
        totalAmount,
        status: "PROCESSING",
        fileName,
        isReexport,
        note: input.reason ?? null,
      },
    });

    for (const order of orders) {
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
        },
      });

      if (previousStatus !== nextStatus) {
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            status: nextStatus,
            previousStatus,
            note: `Exported in ${exportCode} by ${input.actor.label}`,
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

  // 5. Submit to provider + record provider references (non-fatal)
  const provider = getProvider();
  await Promise.all(
    orders.map(async (order) => {
      try {
        const response = await provider.submitOrder({
          phoneNumber: order.phoneNumber,
          network: order.network as never,
          gbAmount: order.gbAmount,
          packageId: order.packageId ?? undefined,
        });
        await prisma.order.update({
          where: { id: order.id },
          data: { providerReference: response.reference },
        });
      } catch {
        // Provider submission failures are surfaced later by the status workflow
      }
    })
  );

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