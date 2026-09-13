import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { bulkImportAcceptedMtnNumbers } from "@/lib/mtn-verification";
import { mtnImportConfirmSchema } from "@/lib/validation";
import { handleRouteError } from "@/lib/api-helpers";

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const input = mtnImportConfirmSchema.parse(body);

    const result = await bulkImportAcceptedMtnNumbers({
      numbers: input.numbers,
      source: input.source,
      actorLabel: admin.email,
    });

    return NextResponse.json({
      success: true,
      imported: result.imported,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
