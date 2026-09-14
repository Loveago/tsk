/**
 * Round-trip test for the Excel template/parse routes' exceljs logic.
 * Run with: npx tsx scripts/test-excel-roundtrip.ts
 */
import ExcelJS from "exceljs";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// --- mirror of template route logic ---
async function buildTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Tskconnect";
  const ws = wb.addWorksheet("Orders");
  ws.columns = [{ width: 18 }, { width: 14 }];
  const header = ws.addRow(["Phone Number", "Volume (GB)"]);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.height = 20;
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC000" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  ws.addRow(["0241234567", 5]);
  ws.addRow(["0535308873", 1]);
  ws.addRow(["0507904981", 10]);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

// --- mirror of parse-excel route logic ---
function cellToString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.text === "string") return v.text.trim();
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
    if (typeof v.result === "string") return v.result.trim();
    if (typeof v.result === "number") return String(v.result);
    if (v.error != null) return "";
  }
  return String(value).trim();
}

async function parseWorkbook(bytes: Uint8Array): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(bytes) as unknown as ExcelJS.Buffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("no worksheet");
  const rows: string[][] = [];
  ws.eachRow((row) => {
    if (rows.length >= 1000) return;
    const values = Array.isArray(row.values) ? row.values : [];
    const cells = Array.from(values.slice(1), (v) => cellToString(v));
    while (cells.length > 0 && !cells[cells.length - 1]) cells.pop();
    rows.push(cells);
  });
  return rows;
}

const tmp = path.join(os.tmpdir(), `tskconnect-template-test-${Date.now()}.xlsx`);

async function main() {
  const template = await buildTemplate();
  fs.writeFileSync(tmp, template);
  console.log(`Template written: ${template.length} bytes -> ${tmp}`);

  const header = fs.readFileSync(tmp);
  const rows = await parseWorkbook(new Uint8Array(header));
  console.log("Parsed rows:", JSON.stringify(rows, null, 2));

  const expected = [
    ["Phone Number", "Volume (GB)"],
    ["0241234567", "5"],
    ["0535308873", "1"],
    ["0507904981", "10"],
  ];
  let ok = JSON.stringify(rows) === JSON.stringify(expected);
  console.log(ok ? "Round-trip OK ✓ (header row preserved; client skips it)" : "Round-trip MISMATCH ✗");

  // Also verify a leading-zero phone typed as TEXT stays intact (Excel numeric cell would drop it)
  const wb2 = new ExcelJS.Workbook();
  const ws2 = wb2.addWorksheet("S");
  ws2.addRow(["0241234567", 2]); // string cell -> leading zero kept
  const buf2 = Buffer.from((await wb2.xlsx.writeBuffer()) as ArrayBuffer);
  const rows2 = await parseWorkbook(new Uint8Array(buf2));
  console.log("Text-cell rows:", JSON.stringify(rows2));
  const textOk = rows2[0]?.[0] === "0241234567";
  console.log(textOk ? "Leading zero preserved ✓" : "Leading zero LOST ✗");
  ok = ok && textOk;

  fs.unlinkSync(tmp);
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});