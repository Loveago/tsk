import ExcelJS from "exceljs";
import { normalizeGhanaPhoneNumber, isValidGhanaPhoneNumber } from "./phone-utils";

function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const v = value as { text?: string; result?: unknown; error?: unknown };
    if (typeof v.text === "string") return v.text.trim();
    if (typeof v.result === "string") return v.result.trim();
    if (typeof v.result === "number") return String(v.result);
    if (v.error != null) return "";
  }
  return String(value).trim();
}

function escapeCsvCell(val: string): string {
  if (/[",\n\r]/.test(val)) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

/**
 * Converts an Excel (.xlsx / .xls) buffer into standard CSV text so existing
 * parsers (such as parseMtnNumbersFile) can process it transparently.
 */
export async function parseExcelBufferToCsvText(
  buffer: Buffer | ArrayBuffer | Uint8Array
): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as any);
  await wb.xlsx.load(data as unknown as ExcelJS.Buffer);

  const lines: string[] = [];

  for (const ws of wb.worksheets) {
    ws.eachRow((row) => {
      const values = Array.isArray(row.values) ? row.values : [];
      // ExcelJS row.values is 1-indexed; index 0 is undefined
      const cells = Array.from(values.slice(1), (v) => cellToString(v));
      while (cells.length > 0 && !cells[cells.length - 1]) {
        cells.pop();
      }
      if (cells.length > 0) {
        lines.push(cells.map(escapeCsvCell).join(","));
      }
    });
    // If the first sheet has data, use it (primary sheet)
    if (lines.length > 0) break;
  }

  return lines.join("\n");
}

/**
 * Extracts all valid Ghana phone numbers found anywhere inside an Excel workbook.
 */
export async function extractPhoneNumbersFromExcel(
  buffer: Buffer | ArrayBuffer | Uint8Array
): Promise<string[]> {
  const wb = new ExcelJS.Workbook();
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as any);
  await wb.xlsx.load(data as unknown as ExcelJS.Buffer);

  const validNumbers = new Set<string>();

  for (const ws of wb.worksheets) {
    ws.eachRow((row) => {
      const values = Array.isArray(row.values) ? row.values : [];
      for (const val of values.slice(1)) {
        const text = cellToString(val);
        if (!text) continue;
        const norm = normalizeGhanaPhoneNumber(text);
        if (norm && isValidGhanaPhoneNumber(norm)) {
          validNumbers.add(norm);
        }
      }
    });
  }

  return Array.from(validNumbers);
}
