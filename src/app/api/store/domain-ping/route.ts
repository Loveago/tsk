import { NextRequest, NextResponse } from "next/server";
import { normalizeCustomDomain } from "@/lib/storefront";

/**
 * Lightweight endpoint used by the custom domain verification engine.
 * When a user points their domain (via Cloudflare Orange Cloud proxy or direct A/CNAME)
 * to our server, calling `https://<custom-domain>/api/store/domain-ping` hits this route
 * and returns a signed confirmation payload.
 */
export async function GET(request: NextRequest) {
  const rawHost =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    request.nextUrl.searchParams.get("domain") ||
    "";
  const host = normalizeCustomDomain(rawHost.split(",")[0] || "");

  return NextResponse.json(
    {
      pong: true,
      platform: "tskconnect-storefront",
      host,
      timestamp: Date.now(),
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Tsk-Storefront-Gateway": "verified",
      },
    }
  );
}
