import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  validateApiAuth,
  formatApiSuccess,
  formatApiError,
  logApiRequestEntry,
  ApiError,
} from "@/lib/developer-api";
import { getDefaultProfileId } from "@/lib/orders";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Request-ID",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function GET(request: NextRequest) {
  const start = Date.now();
  const endpoint = "/v1/packages";
  let requestId = "req_initial";
  let authContext: any = null;

  try {
    authContext = await validateApiAuth(request, { requiredScope: "packages:read" });
    requestId = authContext.requestId;

    const url = new URL(request.url);
    const networkFilter = url.searchParams.get("network")?.trim().toUpperCase();
    const availableFilter = url.searchParams.get("available")?.trim().toLowerCase();

    // Query master packages
    const whereClause: any = {};
    if (networkFilter) {
      whereClause.network = networkFilter;
    }
    if (availableFilter === "true") {
      whereClause.active = true;
    } else if (availableFilter === "false") {
      whereClause.active = false;
    }

    const [packages, user, defaultProfileId] = await Promise.all([
      prisma.dataPackage.findMany({
        where: whereClause,
        orderBy: [{ network: "asc" }, { sortOrder: "asc" }, { gbAmount: "asc" }],
      }),
      prisma.user.findUnique({
        where: { id: authContext.userId },
        select: { pricingProfileId: true },
      }),
      getDefaultProfileId(),
    ]);

    // Load price tiers for this user's profile if assigned, or fallback to default pricing profile
    const effectiveProfileId = user?.pricingProfileId ?? defaultProfileId;
    const priceTiers = effectiveProfileId
      ? await prisma.priceTier.findMany({
          where: { profileId: effectiveProfileId },
        })
      : [];

    const tierMap = new Map<number, number>();
    for (const t of priceTiers) {
      tierMap.set(t.gbAmount, t.priceGHS);
    }

    const formattedPackages = packages.map((pkg) => {
      const price = tierMap.get(pkg.gbAmount) ?? pkg.retailPriceGHS ?? 0;
      const slugId = `${pkg.network.toLowerCase()}-${pkg.gbAmount}gb`;

      return {
        id: slugId,
        packageId: pkg.id,
        network: pkg.network,
        name: pkg.name,
        dataGb: pkg.gbAmount,
        price: Number(price.toFixed(2)),
        currency: "GHS",
        available: pkg.active,
      };
    });

    await logApiRequestEntry({
      userId: authContext.userId,
      credentialId: authContext.credentialId,
      endpoint,
      method: "GET",
      status: 200,
      success: true,
      ip: authContext.clientIp,
      userAgent: authContext.userAgent,
      environment: authContext.environment,
      responseTimeMs: Date.now() - start,
      requestId,
    });

    return formatApiSuccess(formattedPackages, requestId, 200, authContext.rateLimit);
  } catch (err: any) {
    const status = err instanceof ApiError ? err.status : 500;
    const code = err instanceof ApiError ? err.code : "SERVER_ERROR";
    const message = err.message || "An unexpected error occurred";

    await logApiRequestEntry({
      userId: authContext?.userId,
      credentialId: authContext?.credentialId,
      endpoint,
      method: "GET",
      status,
      success: false,
      ip: authContext?.clientIp,
      userAgent: authContext?.userAgent,
      environment: authContext?.environment,
      errorCode: code,
      responseTimeMs: Date.now() - start,
      requestId,
    });

    return formatApiError(code, message, status, requestId, err.rateLimitInfo);
  }
}
