import { NextRequest, NextResponse } from "next/server";
import { POST as handlePostNotReceived } from "../[id]/not-received/route";
import { formatApiError, ApiError } from "@/lib/developer-api";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Request-ID, X-Idempotency-Key",
      "Access-Control-Max-Age": "86400",
    },
  });
}

/**
 * POST /v1/orders/not-received
 * Accepts orderId in the request body for developers following the alternate body-centric contract.
 */
export async function POST(request: NextRequest) {
  let body: any = {};
  try {
    body = await request.clone().json();
  } catch {
    return formatApiError("INVALID_JSON", "Request body must be valid JSON", 400, "req_initial");
  }

  const orderId = body.orderId || body.order_id || body.id;
  if (!orderId) {
    return formatApiError(
      "MISSING_REQUIRED_FIELDS",
      "Missing required field: orderId in request body. You can also call /v1/orders/{orderId}/not-received directly.",
      400,
      "req_initial"
    );
  }

  return handlePostNotReceived(request, {
    params: Promise.resolve({ id: String(orderId) }),
  });
}
