import { NextRequest, NextResponse } from "next/server";
import {
  validateApiAuth,
  formatApiError,
  logApiRequestEntry,
  ApiError,
} from "@/lib/developer-api";
import { isOrderProcessingHalted } from "@/lib/orders";
import { handleBatchOrderSubmission } from "@/lib/api-batch-orders";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, Idempotency-Key, X-Request-ID",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  const endpoint = "/v1/orders/batch";
  let requestId = "req_initial";
  let authContext: any = null;
  let idemKey: string | null = null;

  try {
    authContext = await validateApiAuth(request, { requiredScope: "orders:create" });
    requestId = authContext.requestId;

    const halted = await isOrderProcessingHalted();
    if (halted) {
      throw new ApiError(
        "ORDER_PROCESSING_UNAVAILABLE",
        "Order processing is temporarily unavailable. Please try again later.",
        503
      );
    }

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      throw new ApiError("INVALID_REQUEST", "Request body must be valid JSON", 400);
    }

    const rawIdemKey = request.headers.get("Idempotency-Key")?.trim() || null;
    idemKey = rawIdemKey ? `${authContext.userId}:${rawIdemKey}` : null;

    return await handleBatchOrderSubmission({
      authContext,
      body,
      requestId,
      idemKey,
      start,
      endpoint,
    });
  } catch (err: any) {
    const status = err instanceof ApiError ? err.status : 500;
    const code = err instanceof ApiError ? err.code : "SERVER_ERROR";
    const message = err.message || "An unexpected error occurred";

    await logApiRequestEntry({
      userId: authContext?.userId,
      credentialId: authContext?.credentialId,
      endpoint,
      method: "POST",
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
