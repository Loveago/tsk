/**
 * Visual/structural verification of the admin export workbook.
 * Run with: npx tsx scripts/test-export-workbook.ts
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import ExcelJS from "exceljs";
import { buildOrdersWorkbook } from "../src/lib/order-export";

async function main() {
  const buffer = await buildOrdersWorkbook(
    [
      { id: 1, phoneNumber: "0241234567", gbAmount: 1, amount: 3.8 },
      { id: 2, phoneNumber: "0535308873", gbAmount: 5, amount: 15 },
      { id: 3, phoneNumber: "0507904981", gbAmount: 10, amount: 28 },
    ],
    {
      network: "MTN",
      exportCode: "EX-0001",
      exportedBy: "admin@tskconnect.com",
      exportedAt: new Date(),
    }
  );

  const tmp = path.join(os.tmpdir(), `tskconnect-export-test-${Date.now()}.xlsx`);
  fs.writeFileSync(tmp, buffer);
  console.log(`Export written: ${buffer.length} bytes -> ${tmp}`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(fs.readFileSync(tmp) as unknown as ExcelJS.Buffer);
  const ws = wb.worksheets[0];
  console.log(`Sheet name: ${ws.name}`);
  ws.eachRow((row) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    console.log(`Row ${row.number}:`, JSON.stringify(values));
  });

  // Structural assertions
  const header = ws.getRow(1);
  const firstData = ws.getRow(2);
  const lastDataRow = ws.getRow(2 + 2);
  const afterData = ws.getRow(2 + 3);

  const checks = [
    ws.name === "MTN",
    header.getCell(1).value === "Phone Number",
    header.getCell(2).value === "Volume (GB)",
    header.getCell(1).fill
      ? JSON.stringify(header.getCell(1).fill).includes("FFC000")
      : false,
    firstData.getCell(1).value === "0241234567",
    firstData.getCell(2).value === 1,
    lastDataRow.getCell(1).value === "0507904981",
    afterData.getCell(1).value == null, // no TOTAL row or extra info
    (ws.columnCount ?? 0) === 2, // only two columns
  ];
  const ok = checks.every(Boolean);
  console.log(ok ? "Export workbook structure OK ✓" : `Structure MISMATCH ✗ ${checks}`);
  fs.unlinkSync(tmp);
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
