import { NextRequest, NextResponse } from "next/server";
import { generateRequestId } from "@/lib/developer-api";

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
  const requestId = request.headers.get("x-request-id")?.trim() || generateRequestId();

  return NextResponse.json(
    {
      success: true,
      requestId,
    },
    {
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": requestId,
      },
    }
  );
}
