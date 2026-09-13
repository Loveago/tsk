import { NextRequest, NextResponse } from "next/server";
import { getOpenApiSpec } from "@/lib/openapi-spec";
import { getRequestOrigin } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  const origin = getRequestOrigin(request);
  const spec = getOpenApiSpec(origin);
  return NextResponse.json(spec, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
      "Vary": "Host, X-Forwarded-Host, X-Forwarded-Proto",
    },
  });
}

