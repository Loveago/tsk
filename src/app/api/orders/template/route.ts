import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";

/** Sample Excel order template: one order per row — phone number, then GB. */
export async function GET() {
  try {
    await requireUser();

    const wb = new ExcelJS.Workbook();
    wb.creator = "Tskconnect";
    const ws = wb.addWorksheet("Orders");

    ws.columns = [{ width: 18 }, { width: 14 }];

    // Header row — Phone Number | Volume (GB), yellow like the vendor template
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
    const bytes = Buffer.from(buf as ArrayBuffer);

    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="tskconnect-order-template.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}