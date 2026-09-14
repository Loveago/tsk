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

export async function toXlsx(
  rows: Record<string, unknown>[],
  columns: ExportColumn[],
  sheetName: string
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Tskconnect";
  const ws = wb.addWorksheet(sheetName.slice(0, 30));
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18 }));
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(r);
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
