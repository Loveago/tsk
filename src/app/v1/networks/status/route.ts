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
  const endpoint = "/v1/networks/status";
  let requestId = "req_initial";
  let authContext: any = null;

  try {
    authContext = await validateApiAuth(request, { requiredScope: "networks:read" });
    requestId = authContext.requestId;

    const halted = await isOrderProcessingHalted();

    const [activePackages, mtnEnabled, telecelEnabled, atEnabled] = await Promise.all([
      prisma.dataPackage.findMany({
        where: { active: true },
        select: { network: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.systemSetting.findUnique({ where: { key: "network_mtn_enabled" } }),
      prisma.systemSetting.findUnique({ where: { key: "network_telecel_enabled" } }),
      prisma.systemSetting.findUnique({ where: { key: "network_airteltigo_enabled" } }),
    ]);

    const activeSet = new Set(activePackages.map((p) => p.network.toUpperCase()));
    const nowIso = new Date().toISOString();

    const mtnOrders = !halted && activeSet.has("MTN") && mtnEnabled?.value !== "false";
    const telecelOrders = !halted && activeSet.has("TELECEL") && telecelEnabled?.value !== "false";
    const atOrders = !halted && activeSet.has("AIRTELTIGO") && atEnabled?.value !== "false";

    const data = [
      {
        network: "MTN",
        status: mtnOrders ? "AVAILABLE" : "UNAVAILABLE",
        ordersEnabled: mtnOrders,
        maintenance: halted || mtnEnabled?.value === "false",
        lastUpdated: activePackages.find((p) => p.network === "MTN")?.updatedAt.toISOString() || nowIso,
      },
      {
        network: "Telecel",
        status: telecelOrders ? "AVAILABLE" : "UNAVAILABLE",
        ordersEnabled: telecelOrders,
        maintenance: halted || telecelEnabled?.value === "false",
        lastUpdated: activePackages.find((p) => p.network === "TELECEL")?.updatedAt.toISOString() || nowIso,
      },
      {
        network: "AirtelTigo",
        status: atOrders ? "AVAILABLE" : "UNAVAILABLE",
        ordersEnabled: atOrders,
        maintenance: halted || atEnabled?.value === "false",
        lastUpdated: activePackages.find((p) => p.network === "AIRTELTIGO")?.updatedAt.toISOString() || nowIso,
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

    return formatApiSuccess(data, requestId, 200, authContext.rateLimit);
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
