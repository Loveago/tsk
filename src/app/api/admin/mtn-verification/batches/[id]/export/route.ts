import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { exportVerificationBatch } from "@/lib/mtn-verification";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const format = (searchParams.get("format") ?? "txt").toLowerCase() === "csv" ? "csv" : "txt";

    const { content, filename, mimeType } = await exportVerificationBatch(
      id,
      format,
      admin.email
    );

    return new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": `${mimeType}; charset=utf-8`,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
