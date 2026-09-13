import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { hashApiKey } from "@/lib/api-keys";
import { rateLimit } from "@/lib/rate-limit";

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INVALID_REQUEST"
  | "INVALID_NETWORK"
  | "INVALID_PACKAGE"
  | "INVALID_RECIPIENT"
  | "ORDER_PROCESSING_UNAVAILABLE"
  | "INSUFFICIENT_BALANCE"
  | "DUPLICATE_REQUEST"
  | "ORDER_NOT_FOUND"
  | "RATE_LIMIT_EXCEEDED"
  | "MTN_NUMBER_NOT_VERIFIED"
  | "SERVER_ERROR";

export class ApiError extends Error {
  code: ApiErrorCode;
  status: number;
  rateLimitInfo?: { limit: number; remaining: number; resetAt: number };

  constructor(
    code: ApiErrorCode,
    message: string,
    status = 400,
    rateLimitInfo?: { limit: number; remaining: number; resetAt: number }
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.rateLimitInfo = rateLimitInfo;
  }
}

export interface ApiAuthContext {
  credentialId: string | null;
  userId: string;
  userName: string;
  userEmail: string;
  environment: "PRODUCTION" | "SANDBOX";
  isSandbox: boolean;
  scopes: string[];
  requestId: string;
  clientIp: string | null;
  userAgent: string | null;
  rateLimit: {
    limit: number;
    remaining: number;
    resetAt: number;
  };
}

export function getClientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? null;
}

export function generateRequestId(): string {
  return `req_${randomBytes(6).toString("hex")}`;
}

export async function validateApiAuth(
  request: NextRequest,
  options?: { requiredScope?: string }
): Promise<ApiAuthContext> {
  const requestId = request.headers.get("x-request-id")?.trim() || generateRequestId();
  const clientIp = getClientIp(request);
  const userAgent = request.headers.get("user-agent") ?? null;

  const authHeader = request.headers.get("authorization") ?? "";
  const rawToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!rawToken) {
    throw new ApiError(
      "UNAUTHORIZED",
      "Missing or invalid Authorization header. Format: Authorization: Bearer <API_KEY>",
      401
    );
  }

  const tokenHash = hashApiKey(rawToken);

  // Check modern ApiCredential first
  let credential = await prisma.apiCredential.findUnique({
    where: { keyHash: tokenHash },
    include: {
      user: {
        include: {
          apiApplication: true,
        },
      },
    },
  });

  let userId: string;
  let userName: string;
  let userEmail: string;
  let credentialId: string | null = null;
  let environment: "PRODUCTION" | "SANDBOX" = "PRODUCTION";
  let isSandbox = false;
  let scopes: string[] = [];
  let limitPerMin = 60;
  let allowedIps: string | null = null;

  if (credential) {
    credentialId = credential.id;
    userId = credential.userId;
    userName = credential.user.name;
    userEmail = credential.user.email;
    environment = (credential.environment as "PRODUCTION" | "SANDBOX") || "PRODUCTION";
    isSandbox = environment === "SANDBOX" || rawToken.startsWith("ck_test_");
    scopes = credential.scopes ? credential.scopes.split(",").map((s) => s.trim()) : [];
    limitPerMin = credential.rateLimitPerMin || 60;
    allowedIps = credential.allowedIps || null;

    if (credential.status !== "ACTIVE") {
      throw new ApiError("FORBIDDEN", `API credential is ${credential.status.toLowerCase()}`, 403);
    }

    if (credential.user.status !== "ACTIVE") {
      throw new ApiError("FORBIDDEN", "User account is suspended or disabled", 403);
    }

    // Application status verification
    const app = credential.user.apiApplication;
    if (!isSandbox) {
      if (!app || app.status !== "APPROVED") {
        const appStatus = app ? app.status : "NOT_APPLIED";
        throw new ApiError(
          "FORBIDDEN",
          `Production API access requires an APPROVED application. Your current status is: ${appStatus}`,
          403
        );
      }
      if (!app.productionAccess) {
        throw new ApiError("FORBIDDEN", "Production access has been revoked by admin", 403);
      }
    } else {
      if (app && !app.sandboxAccess) {
        throw new ApiError("FORBIDDEN", "Sandbox access has been disabled for this account", 403);
      }
    }

    // IP restrictions
    const effectiveIps = allowedIps || app?.ipRestrictions;
    if (effectiveIps && clientIp) {
      const allowedList = effectiveIps
        .split(",")
        .map((ip) => ip.trim())
        .filter(Boolean);
      if (allowedList.length > 0 && !allowedList.includes(clientIp) && !allowedList.includes("127.0.0.1")) {
        throw new ApiError("FORBIDDEN", `Request IP ${clientIp} is not authorized for this API key`, 403);
      }
    }

    // Fire-and-forget usage update
    prisma.apiCredential
      .update({
        where: { id: credential.id },
        data: {
          lastUsedAt: new Date(),
          requestCount: { increment: 1 },
        },
      })
      .catch(() => undefined);
  } else {
    // Check legacy ApiKey
    const legacyKey = await prisma.apiKey.findUnique({
      where: { keyHash: tokenHash },
      include: { user: { include: { apiApplication: true } } },
    });

    if (!legacyKey || !legacyKey.active) {
      throw new ApiError("UNAUTHORIZED", "Invalid or inactive API key", 401);
    }

    if (legacyKey.user.status !== "ACTIVE") {
      throw new ApiError("FORBIDDEN", "User account is disabled", 403);
    }

    userId = legacyKey.userId;
    userName = legacyKey.user.name;
    userEmail = legacyKey.user.email;
    credentialId = null;
    environment = rawToken.includes("test") ? "SANDBOX" : "PRODUCTION";
    isSandbox = environment === "SANDBOX";
    scopes = [
      "networks:read",
      "packages:read",
      "orders:create",
      "orders:read",
      "orders:status",
      "orders:bulk_status",
      "balance:read",
      "webhooks:read",
      "webhooks:manage",
    ];

    prisma.apiKey
      .update({
        where: { id: legacyKey.id },
        data: { lastUsedAt: new Date(), requestCount: { increment: 1 } },
      })
      .catch(() => undefined);
  }

  // Scope check
  if (options?.requiredScope) {
    const hasScope = scopes.includes(options.requiredScope) || scopes.includes("*");
    if (!hasScope) {
      throw new ApiError("FORBIDDEN", `Insufficient scope. Required: ${options.requiredScope}`, 403);
    }
  }

  // Rate Limiting
  const rlKey = credentialId ? `cred:${credentialId}` : `usr:${userId}`;
  const rlResult = rateLimit(rlKey, limitPerMin, 60_000);

  if (!rlResult.allowed) {
    throw new ApiError(
      "RATE_LIMIT_EXCEEDED",
      `Rate limit exceeded: ${limitPerMin} requests/minute. Try again in ${Math.ceil(
        (rlResult.resetAt - Date.now()) / 1000
      )} seconds.`,
      429,
      { limit: limitPerMin, remaining: 0, resetAt: rlResult.resetAt }
    );
  }

  return {
    credentialId,
    userId,
    userName,
    userEmail,
    environment,
    isSandbox,
    scopes,
    requestId,
    clientIp,
    userAgent,
    rateLimit: {
      limit: limitPerMin,
      remaining: rlResult.remaining,
      resetAt: rlResult.resetAt,
    },
  };
}

export function formatApiSuccess(
  data: any,
  requestId: string,
  status = 200,
  rateLimitInfo?: { limit: number; remaining: number; resetAt: number }
) {
  const headers = new Headers({
    "Content-Type": "application/json",
    "X-Request-ID": requestId,
  });

  if (rateLimitInfo) {
    headers.set("X-RateLimit-Limit", String(rateLimitInfo.limit));
    headers.set("X-RateLimit-Remaining", String(rateLimitInfo.remaining));
    headers.set("X-RateLimit-Reset", String(Math.ceil(rateLimitInfo.resetAt / 1000)));
  }

  return NextResponse.json(
    {
      success: true,
      data,
      requestId,
    },
    { status, headers }
  );
}

export function formatApiError(
  code: ApiErrorCode,
  message: string,
  status: number,
  requestId: string,
  rateLimitInfo?: { limit: number; remaining: number; resetAt: number }
) {
  const headers = new Headers({
    "Content-Type": "application/json",
    "X-Request-ID": requestId,
  });

  if (rateLimitInfo) {
    headers.set("X-RateLimit-Limit", String(rateLimitInfo.limit));
    headers.set("X-RateLimit-Remaining", String(rateLimitInfo.remaining));
    headers.set("X-RateLimit-Reset", String(Math.ceil(rateLimitInfo.resetAt / 1000)));
  }

  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
      },
      requestId,
    },
    { status, headers }
  );
}

export async function logApiRequestEntry(params: {
  userId?: string | null;
  credentialId?: string | null;
  endpoint: string;
  method: string;
  status: number;
  success: boolean;
  ip?: string | null;
  userAgent?: string | null;
  environment?: string | null;
  errorCode?: string | null;
  responseTimeMs?: number | null;
  requestId?: string | null;
}) {
  try {
    await prisma.apiRequestLog.create({
      data: {
        userId: params.userId ?? null,
        credentialId: params.credentialId ?? null,
        endpoint: params.endpoint,
        method: params.method,
        status: params.status,
        success: params.success,
        ip: params.ip ?? null,
        userAgent: params.userAgent ? params.userAgent.slice(0, 255) : null,
        environment: params.environment ?? "PRODUCTION",
        errorCode: params.errorCode ?? null,
        responseTimeMs: params.responseTimeMs ?? null,
        requestId: params.requestId ?? null,
      },
    });
  } catch (err) {
    // Logging must never crash requests
  }
}
