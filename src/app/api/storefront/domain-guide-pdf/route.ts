import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";
import { requireStorefront, resolveStorefrontDnsConfig } from "@/lib/storefront";
import { generateStorefrontDomainGuidePdf } from "@/lib/storefront-domain-guide-pdf";

/**
 * GET /api/storefront/domain-guide-pdf
 * Generates and downloads a personalized step-by-step PDF guide for connecting
 * a custom domain (via Cloudflare or any registrar) to the user's storefront.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const storefront = await requireStorefront(user.id);
    const dnsConfig = await resolveStorefrontDnsConfig();

    const mainDomain = (
      process.env.MAIN_DOMAIN ||
      process.env.NEXT_PUBLIC_MAIN_DOMAIN ||
      "tsk05.net"
    )
      .trim()
      .toLowerCase()
      .replace(/^www\./, "");

    const customDomainParam = request.nextUrl.searchParams.get("domain")?.trim();
    const customDomain = customDomainParam || storefront.customDomain || null;

    const pdfBytes = await generateStorefrontDomainGuidePdf({
      storeName: storefront.name,
      slug: storefront.slug,
      customDomain,
      storefrontDomain: dnsConfig.storefrontDomain,
      cnameTarget: dnsConfig.cnameTarget,
      vpsIp: dnsConfig.vpsIp,
      mainDomain,
    });

    const filename = `custom-domain-setup-guide-${storefront.slug}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
