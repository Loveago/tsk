import { NextRequest, NextResponse } from "next/server";
import dns from "dns/promises";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import {
  requireStorefront,
  validateCustomDomain,
  resolveStorefrontDnsConfig,
  getStorefrontUrls,
} from "@/lib/storefront";

interface VerificationResult {
  verified: boolean;
  dnsResolved: boolean;
  httpReachable: boolean;
  httpsReachable: boolean;
  aRecords: string[];
  cnameRecords: string[];
  error?: string;
  message: string;
}

async function verifyCustomDomainConnection(domain: string): Promise<VerificationResult> {
  const dnsConfig = await resolveStorefrontDnsConfig();
  let aRecords: string[] = [];
  let cnameRecords: string[] = [];
  let targetIps: string[] = [];

  // 1. Resolve platform storefront domain IPs for comparison when not using Cloudflare proxy
  try {
    targetIps = await dns.resolve4(dnsConfig.storefrontDomain);
  } catch {
    targetIps = [];
  }
  if (dnsConfig.vpsIp && !targetIps.includes(dnsConfig.vpsIp)) {
    targetIps.push(dnsConfig.vpsIp);
  }

  // 2. Resolve user's custom domain DNS records (A and CNAME)
  try {
    aRecords = await dns.resolve4(domain);
  } catch {
    aRecords = [];
  }

  try {
    cnameRecords = await dns.resolveCname(domain);
  } catch {
    cnameRecords = [];
  }

  // Also check www.<domain> CNAME if root had no CNAME
  let wwwCnames: string[] = [];
  try {
    wwwCnames = await dns.resolveCname(`www.${domain}`);
  } catch {
    wwwCnames = [];
  }

  const dnsResolved = aRecords.length > 0 || cnameRecords.length > 0;

  if (!dnsResolved) {
    return {
      verified: false,
      dnsResolved: false,
      httpReachable: false,
      httpsReachable: false,
      aRecords,
      cnameRecords,
      error: `No DNS A or CNAME records were found for "${domain}". Please add the DNS records in Cloudflare (or your domain provider) and wait 1-5 minutes for DNS propagation.`,
      message: "DNS records not found yet.",
    };
  }

  // Check if CNAME directly matches our target domain
  const normalizedTarget = dnsConfig.cnameTarget.toLowerCase();
  const normalizedStorefront = dnsConfig.storefrontDomain.toLowerCase();
  const allCnames = [...cnameRecords, ...wwwCnames].map((c) => c.toLowerCase().replace(/\.$/, ""));
  const cnameMatchesTarget = allCnames.some(
    (c) =>
      c === normalizedTarget ||
      c === normalizedStorefront ||
      c.endsWith(`.${normalizedStorefront}`)
  );

  // Check if A record directly matches our VPS IP or storefront domain IP
  const ipMatchesTarget =
    targetIps.length > 0 && aRecords.some((ip) => targetIps.includes(ip));

  // 3. Perform live HTTP/HTTPS reachability handshake to /api/store/domain-ping
  // This succeeds even when Cloudflare Proxy (Orange Cloud) masks the origin IP with Cloudflare Anycast IPs!
  let httpsReachable = false;
  let httpReachable = false;

  for (const proto of ["https", "http"] as const) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`${proto}://${domain}/api/store/domain-ping?domain=${encodeURIComponent(domain)}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "Tskconnect-Domain-Verifier/1.0",
        },
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timeout);

      const gatewayHeader = res.headers.get("x-tsk-storefront-gateway");
      if (res.ok || gatewayHeader === "verified") {
        const data = await res.json().catch(() => null);
        if (data?.pong === true || gatewayHeader === "verified") {
          if (proto === "https") httpsReachable = true;
          if (proto === "http") httpReachable = true;
          break;
        }
      }
    } catch {
      // Ignore network/TLS handshake error on individual protocol attempt
    }
  }

  const verified = httpsReachable || httpReachable || cnameMatchesTarget || ipMatchesTarget;

  if (!verified) {
    const ipHint = dnsConfig.vpsIp || dnsConfig.cnameTarget;
    return {
      verified: false,
      dnsResolved: true,
      httpReachable,
      httpsReachable,
      aRecords,
      cnameRecords,
      error: `DNS records were detected (${aRecords.join(", ") || cnameRecords.join(", ")}), but "${domain}" is not yet routing traffic to our storefront server. Make sure both A records (@ and www) point to our Server IP "${ipHint}", and Cloudflare SSL/TLS is set to "Full".`,
      message: "Domain resolves in DNS but does not point to our server yet.",
    };
  }

  return {
    verified: true,
    dnsResolved: true,
    httpReachable: httpReachable || httpsReachable,
    httpsReachable,
    aRecords,
    cnameRecords,
    message: httpsReachable
      ? `Success! "${domain}" is verified and live with active HTTPS.`
      : `Success! "${domain}" DNS records are verified and connected to your storefront.`,
  };
}

/**
 * GET /api/storefront/domain
 * Returns current custom domain status, URLs, and platform DNS target configuration.
 */
export async function GET() {
  try {
    const user = await requireUser();
    const storefront = await requireStorefront(user.id);
    const dnsConfig = await resolveStorefrontDnsConfig();
    const urls = getStorefrontUrls(storefront);

    return NextResponse.json({
      domainConfig: {
        slug: storefront.slug,
        customDomain: storefront.customDomain,
        customDomainStatus: storefront.customDomainStatus,
        customDomainVerifiedAt: storefront.customDomainVerifiedAt,
        customDomainError: storefront.customDomainError,
        preferredDomainMode: storefront.preferredDomainMode,
        ...urls,
      },
      dnsTargets: dnsConfig,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * PUT /api/storefront/domain
 * Saves a custom domain and/or updates `preferredDomainMode` ("DEFAULT" | "CUSTOM").
 */
export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser();
    const storefront = await requireStorefront(user.id);
    const body = (await request.json()) as {
      customDomain?: string | null;
      preferredDomainMode?: "DEFAULT" | "CUSTOM";
    };

    // Case 1: Only switching preferredDomainMode ("DEFAULT" vs "CUSTOM")
    if (body.customDomain === undefined && body.preferredDomainMode) {
      if (body.preferredDomainMode !== "DEFAULT" && body.preferredDomainMode !== "CUSTOM") {
        return apiError(400, "Invalid domain mode. Must be DEFAULT or CUSTOM.");
      }
      if (body.preferredDomainMode === "CUSTOM" && !storefront.customDomain) {
        return apiError(400, "Please add and save a custom domain before selecting Custom Domain mode.");
      }

      const updated = await prisma.storefront.update({
        where: { id: storefront.id },
        data: { preferredDomainMode: body.preferredDomainMode },
      });

      return NextResponse.json({
        storefront: updated,
        urls: getStorefrontUrls(updated),
        message:
          body.preferredDomainMode === "CUSTOM"
            ? `Primary store link switched to ${updated.customDomain}`
            : `Primary store link switched to default storefront domain`,
      });
    }

    // Case 2: Updating or adding a custom domain
    const rawDomain = (body.customDomain ?? "").trim();
    if (!rawDomain) {
      return apiError(400, "Please enter a domain name (e.g. mybranddata.com).");
    }

    const validation = validateCustomDomain(rawDomain);
    if (!validation.valid) {
      return apiError(400, validation.error || "Invalid custom domain.");
    }

    const cleanDomain = validation.domain;

    // Check if another storefront already claimed this domain
    const existing = await prisma.storefront.findFirst({
      where: {
        customDomain: cleanDomain,
        NOT: { id: storefront.id },
      },
      select: { id: true },
    });

    if (existing) {
      return apiError(
        409,
        `The domain "${cleanDomain}" is already connected to another storefront.`
      );
    }

    const isSameDomain = storefront.customDomain === cleanDomain;
    const nextStatus =
      isSameDomain && storefront.customDomainStatus === "ACTIVE"
        ? "ACTIVE"
        : "PENDING_DNS";

    const updated = await prisma.storefront.update({
      where: { id: storefront.id },
      data: {
        customDomain: cleanDomain,
        customDomainStatus: nextStatus,
        customDomainError: null,
        ...(isSameDomain ? {} : { customDomainVerifiedAt: null }),
        ...(body.preferredDomainMode ? { preferredDomainMode: body.preferredDomainMode } : {}),
      },
    });

    return NextResponse.json({
      storefront: updated,
      urls: getStorefrontUrls(updated),
      message:
        nextStatus === "ACTIVE"
          ? `Custom domain "${cleanDomain}" saved.`
          : `Domain "${cleanDomain}" saved! Follow the DNS setup steps below and click "Verify Domain" once your records are added.`,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * POST /api/storefront/domain
 * Triggers live 2-stage DNS + HTTP verification for the user's saved customDomain.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const storefront = await requireStorefront(user.id);

    const body = await request.json().catch(() => ({}));
    let targetDomain = storefront.customDomain;

    // Allow passing customDomain in POST body to save + verify in one click
    if (typeof body?.customDomain === "string" && body.customDomain.trim()) {
      const validation = validateCustomDomain(body.customDomain);
      if (!validation.valid) {
        return apiError(400, validation.error || "Invalid custom domain.");
      }
      const existing = await prisma.storefront.findFirst({
        where: {
          customDomain: validation.domain,
          NOT: { id: storefront.id },
        },
        select: { id: true },
      });
      if (existing) {
        return apiError(409, `The domain "${validation.domain}" is already connected to another storefront.`);
      }
      targetDomain = validation.domain;
    }

    if (!targetDomain) {
      return apiError(400, "No custom domain configured to verify. Please enter a domain first.");
    }

    const check = await verifyCustomDomainConnection(targetDomain);

    const updated = await prisma.storefront.update({
      where: { id: storefront.id },
      data: {
        customDomain: targetDomain,
        customDomainStatus: check.verified ? "ACTIVE" : check.dnsResolved ? "PENDING_DNS" : "ERROR",
        customDomainVerifiedAt: check.verified ? new Date() : storefront.customDomainVerifiedAt,
        customDomainError: check.verified ? null : (check.error ?? "Verification failed"),
        ...(check.verified ? { preferredDomainMode: "CUSTOM" } : {}),
      },
    });

    return NextResponse.json({
      verified: check.verified,
      verification: check,
      storefront: updated,
      urls: getStorefrontUrls(updated),
      message: check.verified ? check.message : (check.error || check.message),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * DELETE /api/storefront/domain
 * Disconnects the custom domain from the storefront and reverts to the default domain.
 */
export async function DELETE() {
  try {
    const user = await requireUser();
    const storefront = await requireStorefront(user.id);

    const updated = await prisma.storefront.update({
      where: { id: storefront.id },
      data: {
        customDomain: null,
        customDomainStatus: "NONE",
        customDomainVerifiedAt: null,
        customDomainError: null,
        preferredDomainMode: "DEFAULT",
      },
    });

    return NextResponse.json({
      storefront: updated,
      urls: getStorefrontUrls(updated),
      message: "Custom domain disconnected. Your store is using the default storefront address.",
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
