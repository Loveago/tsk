import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireUser } from "@/lib/auth";
import { apiError, handleRouteError } from "@/lib/api-helpers";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 1000;

function cellToString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    // Hyperlink cells -> { text, link }
    if (typeof v.text === "string") return v.text.trim();
    // Rich text cells -> { richText: [{ text }] }
    if (Array.isArray(v.richText)) {
      return v.richText
        .map((r) =>
          typeof (r as { text?: unknown }).text === "string"
            ? (r as { text: string }).text
            : ""
        )
        .join("")
        .trim();
    }
    // Formula cells -> { formula, result }
    if (typeof v.result === "string") return v.result.trim();
    if (typeof v.result === "number") return String(v.result);
    if (v.error != null) return "";
  }
  return String(value).trim();
}

/**
 * Parses an uploaded Excel (.xlsx) order file and returns the raw cell rows so
 * the client can apply its own matching/pricing logic.
 * Expected format: one order per row — phone number first, then GB.
 */
export async function POST(request: NextRequest) {
  try {
    await requireUser();

    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return apiError(400, "No file uploaded");
    }
    if (file.size > MAX_FILE_BYTES) {
      return apiError(400, "File is too large — maximum 5MB");
    }
    if (!/\.xlsx$/i.test(file.name)) {
      return apiError(400, "Only Excel .xlsx files are supported");
    }

    const wb = new ExcelJS.Workbook();
    try {
      const data = Buffer.from(await file.arrayBuffer());
      await wb.xlsx.load(data as unknown as ExcelJS.Buffer);
    } catch {
      return apiError(400, "Could not read the Excel file — make sure it is a valid .xlsx");
    }

    const ws = wb.worksheets[0];
    if (!ws) {
      return apiError(400, "The workbook has no worksheets");
    }

    const rows: string[][] = [];
    ws.eachRow((row) => {
      if (rows.length >= MAX_ROWS) return;
      const values = Array.isArray(row.values) ? row.values : [];
      // row.values is 1-indexed — drop the unused leading slot.
      const cells = Array.from(values.slice(1), (v) => cellToString(v));
      while (cells.length > 0 && !cells[cells.length - 1]) cells.pop();
      rows.push(cells);
    });

    return NextResponse.json({ rows });
  } catch (err) {
    return handleRouteError(err);
  }
}