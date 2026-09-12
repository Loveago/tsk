import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiKey, ApiKeyError, logApiRequest } from "@/lib/api-auth";
import { handleRouteError } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    const { keyId } = await requireApiKey(request);

    // Packages with the API owner's effective price where a tier exists,
    // falling back to the retail price.
    const [packages, tiers] = await Promise.all([
      prisma.dataPackage.findMany({
        where: { active: true },
        orderBy: [{ network: "asc" }, { sortOrder: "asc" }, { gbAmount: "asc" }],
      }),
      prisma.priceTier.findMany(),
    ]);

    const tierMap = new Map<string, number>();
    for (const t of tiers) tierMap.set(`${t.profileId}:${t.gbAmount}`, t.priceGHS);

    const result = packages.map((p) => ({
      id: p.id,
      network: p.network,
      name: p.name,
      gbAmount: p.gbAmount,
      priceGHS: p.retailPriceGHS,
      providerProductId: p.providerProductId,
    }));

    await logApiRequest(
      keyId, "/api/public/v1/packages", "GET", 200, true,
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
    );

    return NextResponse.json({ success: true, packages: result, tierMap: Object.fromEntries(tierMap) });
  } catch (err) {
    if (err instanceof ApiKeyError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    return handleRouteError(err);
  }
}
