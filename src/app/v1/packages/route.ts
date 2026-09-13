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

    // Load price tiers for this user's custom profile if assigned
    const customProfileId = user?.pricingProfileId;
    const profile = customProfileId
      ? await prisma.pricingProfile.findUnique({ where: { id: customProfileId } })
      : null;
    const isCustomProfile = profile && !profile.isDefault;

    // Check if custom profile has distinct per-network rates
    let profileNetworkRates: Record<string, Array<{ gbAmount: number; priceGHS: number }>> | null = null;
    if (isCustomProfile && customProfileId) {
      const setting = await prisma.systemSetting.findUnique({
        where: { key: `pricing_profile_network_rates:${customProfileId}` },
      });
      if (setting?.value) {
        try {
          profileNetworkRates = JSON.parse(setting.value);
        } catch {
          // ignore
        }
      }
    }

    const priceTiers = (isCustomProfile && customProfileId)
      ? await prisma.priceTier.findMany({
          where: { profileId: customProfileId },
        })
      : [];
    const tierMap = new Map<number, number>(priceTiers.map((t) => [t.gbAmount, t.priceGHS]));

    const formattedPackages = packages.map((pkg) => {
      let distinctPrice: number | null = null;
      if (profileNetworkRates && Array.isArray(profileNetworkRates[pkg.network.toUpperCase()])) {
        const match = profileNetworkRates[pkg.network.toUpperCase()].find((t) => t.gbAmount === pkg.gbAmount);
        if (match && typeof match.priceGHS === "number" && match.priceGHS > 0) {
          distinctPrice = match.priceGHS;
        }
      }
      if (distinctPrice == null && isCustomProfile && tierMap.has(pkg.gbAmount)) {
        distinctPrice = tierMap.get(pkg.gbAmount)!;
      }
      if (distinctPrice == null) {
        distinctPrice = pkg.retailPriceGHS ?? (tierMap.has(pkg.gbAmount) ? tierMap.get(pkg.gbAmount)! : 0);
      }

      const slugId = `${pkg.network.toLowerCase()}-${pkg.gbAmount}gb`;

      return {
        id: slugId,
        packageId: pkg.id,
        network: pkg.network,
        name: pkg.name,
        dataGb: pkg.gbAmount,
        price: Number((distinctPrice ?? 0).toFixed(2)),
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
