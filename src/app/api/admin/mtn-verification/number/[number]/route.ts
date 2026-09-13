import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getMtnNumberDetails } from "@/lib/mtn-verification";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ number: string }> }
) {
  try {
    await requireAdmin();
    const { number } = await params;
    if (!number) {
      return apiError(400, "Phone number is required");
    }

    const details = await getMtnNumberDetails(decodeURIComponent(number));
    return NextResponse.json({ details });
  } catch (err) {
    return handleRouteError(err);
  }
}
