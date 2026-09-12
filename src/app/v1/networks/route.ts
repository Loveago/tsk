import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  validateApiAuth,
  formatApiSuccess,
  formatApiError,
  logApiRequestEntry,
  ApiError,
} from "@/lib/developer-api";
import { isOrderProcessingHalted } from "@/lib/orders";

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
  const endpoint = "/v1/networks";
  let requestId = "req_initial";
  let authContext: any = null;

  try {
    authContext = await validateApiAuth(request, { requiredScope: "networks:read" });
    requestId = authContext.requestId;

    // Fetch active networks from packages in DB
    const activePackages = await prisma.dataPackage.findMany({
      where: { active: true },
      select: { network: true },
      distinct: ["network"],
    });

    const activeSet = new Set(activePackages.map((p) => p.network.toUpperCase()));
    const halted = await isOrderProcessingHalted();

    const [mtnEnabled, telecelEnabled, atEnabled] = await Promise.all([
      prisma.systemSetting.findUnique({ where: { key: "network_mtn_enabled" } }),
      prisma.systemSetting.findUnique({ where: { key: "network_telecel_enabled" } }),
      prisma.systemSetting.findUnique({ where: { key: "network_airteltigo_enabled" } }),
    ]);

    const mtnOk = !halted && activeSet.has("MTN") && mtnEnabled?.value !== "false";
    const telecelOk = !halted && activeSet.has("TELECEL") && telecelEnabled?.value !== "false";
    const atOk = !halted && activeSet.has("AIRTELTIGO") && atEnabled?.value !== "false";

    const networks = [
      {
        id: "mtn",
        name: "MTN",
        status: mtnOk ? "AVAILABLE" : "UNAVAILABLE",
      },
      {
        id: "telecel",
        name: "Telecel",
        status: telecelOk ? "AVAILABLE" : "UNAVAILABLE",
      },
      {
        id: "airteltigo",
        name: "AirtelTigo",
        status: atOk ? "AVAILABLE" : "UNAVAILABLE",
      },
    ];

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

    return formatApiSuccess(networks, requestId, 200, authContext.rateLimit);
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
