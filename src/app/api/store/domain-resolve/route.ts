import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeCustomDomain } from "@/lib/storefront";

/**
 * Resolves a custom domain hostname (e.g., "kofidata.com") to its Storefront slug.
 * Called by Next.js middleware (`src/middleware.ts`) to dynamically rewrite requests
 * arriving on seller custom domains to `/store/[slug]/...`.
 */
export async function GET(request: NextRequest) {
  try {
    const rawHost = request.nextUrl.searchParams.get("host") || "";
    const domain = normalizeCustomDomain(rawHost);

    if (!domain) {
      return NextResponse.json({ found: false }, { status: 400 });
    }

    const storefront = await prisma.storefront.findFirst({
      where: {
        customDomain: domain,
        status: "ENABLED",
      },
      select: {
        id: true,
        slug: true,
        customDomain: true,
        customDomainStatus: true,
        isCustomDomain: true,
        status: true,
        isActive: true,
      },
    });

    if (!storefront) {
      return NextResponse.json(
        { found: false, domain },
        {
          status: 404,
          headers: { "Cache-Control": "no-store, max-age=0" },
        }
      );
    }

    return NextResponse.json(
      {
        found: true,
        slug: storefront.slug,
        domain: storefront.customDomain,
        customDomainStatus: storefront.customDomainStatus,
        isActive: storefront.isActive,
      },
      {
        headers: { "Cache-Control": "no-store, max-age=0" },
      }
    );
  } catch (err) {
    console.error("Custom domain resolve error:", err);
    return NextResponse.json({ found: false }, { status: 500 });
  }
}
