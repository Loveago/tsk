import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { generateErrorReportCsv } from "@/lib/mtn-staging";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const sessionId = request.nextUrl.searchParams.get("sessionId");
    if (!sessionId) {
      return apiError(400, "Missing sessionId parameter");
    }

    const csvContent = await generateErrorReportCsv(sessionId);
    if (!csvContent) {
      return apiError(404, "Import session expired or error report not found");
    }

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="import-errors-${Date.now()}.csv"`,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
