import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiKey, ApiKeyError, logApiRequest } from "@/lib/api-auth";
import { handleRouteError } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    const { keyId, userId } = await requireApiKey(request);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { balance: true, email: true, name: true },
    });

    await logApiRequest(
      keyId, "/api/public/v1/balance", "GET", 200, true,
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
    );

    return NextResponse.json({
      success: true,
      balance: user?.balance ?? 0,
      currency: "GHS",
    });
  } catch (err) {
    if (err instanceof ApiKeyError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    return handleRouteError(err);
  }
}
