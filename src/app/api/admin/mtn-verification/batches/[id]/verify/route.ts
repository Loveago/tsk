import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { completeBatchVerification } from "@/lib/mtn-verification";
import { mtnBatchVerifySchema } from "@/lib/validation";
import { handleRouteError } from "@/lib/api-helpers";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await request.json();
    const input = mtnBatchVerifySchema.parse(body);

    const result = await completeBatchVerification({
      batchId: id,
      mode: input.mode,
      verifiedNumberIds: input.verifiedNumberIds,
      rejectionReason: input.rejectionReason,
      actorLabel: admin.email,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
