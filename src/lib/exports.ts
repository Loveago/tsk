import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface ExportColumn {
  key: string;
  header: string;
  width?: number;
}

export type ExportFormat = "csv" | "xlsx" | "pdf";

function escapeCsv(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows: Record<string, unknown>[], columns: ExportColumn[]): string {
  const head = columns.map((c) => escapeCsv(c.header)).join(",");
  const body = rows.map((r) => columns.map((c) => escapeCsv(r[c.key])).join(",")).join("\n");
  return `\uFEFF${head}\n${body}`;
}

export interface ToXlsxOptions {
  includeSummary?: boolean;
  summaryMeta?: {
    totalOrders: number;
    totalGb: number;
    totalAmount: number;
    dateRangeLabel?: string;
    filtersApplied?: Array<{ label: string; value: string }>;
    networkBreakdown?: Record<string, { count: number; gb: number; amount: number }>;
    statusBreakdown?: Record<string, { count: number; gb: number; amount: number }>;
  };
}

export async function toXlsx(
  rows: Record<string, unknown>[],
  columns: ExportColumn[],
  sheetName: string,
  options?: ToXlsxOptions
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Tskconnect";
  wb.created = new Date();

  // 1. Optional Executive Summary worksheet
  if (options?.includeSummary && options.summaryMeta) {
    const sws = wb.addWorksheet("Summary Overview", {
      views: [{ showGridLines: true }],
    });
    sws.columns = [{ width: 28 }, { width: 20 }, { width: 20 }, { width: 22 }];

    const titleRow = sws.addRow(["Tskconnect Orders Export Summary"]);
    titleRow.font = { bold: true, size: 16, color: { argb: "FF0F172A" } };
    sws.addRow([`Generated: ${new Date().toLocaleString("en-US")}`]);
    sws.addRow([]);

    const kpiHeader = sws.addRow(["Metric", "Value", "", ""]);
    kpiHeader.font = { bold: true, color: { argb: "FFFFFFFF" } };
    kpiHeader.eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
    });
    sws.addRow(["Total Matching Orders", options.summaryMeta.totalOrders]);
    sws.addRow(["Total Data Volume", `${options.summaryMeta.totalGb.toFixed(2)} GB`]);
    sws.addRow(["Total Amount", `GHS ${options.summaryMeta.totalAmount.toFixed(2)}`]);
    if (options.summaryMeta.dateRangeLabel) {
      sws.addRow(["Date & Time Filter", options.summaryMeta.dateRangeLabel]);
    }

    if (options.summaryMeta.filtersApplied && options.summaryMeta.filtersApplied.length > 0) {
      sws.addRow([]);
      const fHeader = sws.addRow(["Filter Name", "Applied Value", "", ""]);
      fHeader.font = { bold: true, color: { argb: "FFFFFFFF" } };
      fHeader.eachCell((c) => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
      });
      for (const f of options.summaryMeta.filtersApplied) {
        sws.addRow([f.label, f.value]);
      }
    }

    if (options.summaryMeta.networkBreakdown && Object.keys(options.summaryMeta.networkBreakdown).length > 0) {
      sws.addRow([]);
      const netHeader = sws.addRow(["Network Provider", "Orders Count", "Total GB", "Total Amount (GHS)"]);
      netHeader.font = { bold: true, color: { argb: "FFFFFFFF" } };
      netHeader.eachCell((c) => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0284C7" } };
      });
      for (const [net, stats] of Object.entries(options.summaryMeta.networkBreakdown)) {
        sws.addRow([net, stats.count, `${stats.gb.toFixed(2)} GB`, `GHS ${stats.amount.toFixed(2)}`]);
      }
    }

    if (options.summaryMeta.statusBreakdown && Object.keys(options.summaryMeta.statusBreakdown).length > 0) {
      sws.addRow([]);
      const statHeader = sws.addRow(["Order Status", "Orders Count", "Total GB", "Total Amount (GHS)"]);
      statHeader.font = { bold: true, color: { argb: "FFFFFFFF" } };
      statHeader.eachCell((c) => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF059669" } };
      });
      for (const [st, stats] of Object.entries(options.summaryMeta.statusBreakdown)) {
        sws.addRow([st, stats.count, `${stats.gb.toFixed(2)} GB`, `GHS ${stats.amount.toFixed(2)}`]);
      }
    }
  }

  // 2. Orders Sheet
  const ws = wb.addWorksheet(sheetName.slice(0, 30), {
    views: [{ state: "frozen", ySplit: 1, showGridLines: true }],
  });

  ws.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width ?? 18,
  }));

  // Style header row
  const headerRow = ws.getRow(1);
  headerRow.height = 25;
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F172A" },
    };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = {
      bottom: { style: "medium", color: { argb: "FF334155" } },
    };
  });

  // Style data rows
  rows.forEach((r, idx) => {
    const row = ws.addRow(r);
    row.height = 20;
    const isEven = idx % 2 === 1;
    row.eachCell((cell, colNumber) => {
      cell.alignment = { vertical: "middle" };
      if (isEven) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF8FAFC" },
        };
      }
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
      // Format phone numbers explicitly as text so Excel displays leading zeros
      const colKey = columns[colNumber - 1]?.key;
      if (colKey === "phone") {
        cell.numFmt = "@";
      }
    });
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

export async function toPdf(
  title: string,
  rows: Record<string, unknown>[],
  columns: ExportColumn[]
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageW = 595;
  const pageH = 842;
  const margin = 36;
  const colW = (pageW - margin * 2) / columns.length;
  const maxChars = Math.max(6, Math.floor(colW / 4.4));

  let page = pdf.addPage([pageW, pageH]);
  let y = pageH - margin;

  page.drawText(title, { x: margin, y: y - 14, size: 14, font: bold, color: rgb(0.15, 0.24, 0.65) });
  page.drawText(`Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} · ${rows.length} rows`, {
    x: margin, y: y - 30, size: 8, font, color: rgb(0.4, 0.4, 0.45),
  });
  y -= 48;

  const drawHeader = () => {
    columns.forEach((c, i) => {
      page.drawText(c.header.slice(0, maxChars), {
        x: margin + i * colW + 2, y, size: 8, font: bold, color: rgb(0.1, 0.1, 0.15),
      });
    });
    y -= 6;
    page.drawLine({
      start: { x: margin, y }, end: { x: pageW - margin, y },
      thickness: 0.7, color: rgb(0.8, 0.8, 0.85),
    });
    y -= 12;
  };

  drawHeader();

  for (const row of rows) {
    if (y < margin + 24) {
      page = pdf.addPage([pageW, pageH]);
      y = pageH - margin;
      drawHeader();
    }
    columns.forEach((c, i) => {
      const v = row[c.key];
      page.drawText((v == null ? "" : String(v)).slice(0, maxChars), {
        x: margin + i * colW + 2, y, size: 7.5, font, color: rgb(0.2, 0.2, 0.25),
      });
    });
    y -= 13;
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

export function exportResponse(
  body: Buffer | string,
  format: ExportFormat,
  filename: string
): Response {
  const types: Record<ExportFormat, string> = {
    csv: "text/csv; charset=utf-8",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pdf: "application/pdf",
  };
  return new Response(
    typeof body === "string" ? body : new Uint8Array(body),
    {
      headers: {
        "Content-Type": types[format],
        "Content-Disposition": `attachment; filename="${filename}.${format}"`,
        "Cache-Control": "no-store",
      },
    }
  );
}
