import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "tskconnect_session";
const secretString = process.env.AUTH_SECRET || "dev-insecure-secret-change-me-replace-in-prod";
const secret = new TextEncoder().encode(secretString);

const ADMIN_ONLY_PREFIXES = [
  "/admin/users",
  "/admin/settings",
  "/admin/api",
  "/admin/audit-logs",
  "/admin/pricing",
  "/admin/packages",
];

const STOREFRONT_DOMAIN = (process.env.STOREFRONT_DOMAIN || "tskdatastore.com").toLowerCase();
const ADMIN_CUSTOM_DOMAIN = (process.env.ADMIN_CUSTOM_DOMAIN || "data-deals.com").toLowerCase();
const MAIN_DOMAIN = (process.env.MAIN_DOMAIN || "tsk05.net").toLowerCase();

// Fast in-memory Edge cache mapping seller custom domain -> storefront slug
const sellerDomainCache = new Map<string, { slug: string | null; expiresAt: number }>();

async function resolveSellerCustomDomainSlug(host: string, origin: string): Promise<string | null> {
  const cleanHost = host.replace(/^www\./, "").trim().toLowerCase();
  if (!cleanHost) return null;

  const now = Date.now();
  const cached = sellerDomainCache.get(cleanHost);
  if (cached && cached.expiresAt > now) {
    return cached.slug;
  }

  // Try internal loopback first (fast on VPS), fallback to request origin
  const port = process.env.PORT || "3000";
  const lookupUrls = [
    `http://127.0.0.1:${port}/api/store/domain-resolve?host=${encodeURIComponent(cleanHost)}`,
    `${origin}/api/store/domain-resolve?host=${encodeURIComponent(cleanHost)}`,
  ];

  for (const url of lookupUrls) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as { found?: boolean; slug?: string };
        if (data?.found && data.slug) {
          sellerDomainCache.set(cleanHost, { slug: data.slug, expiresAt: now + 60_000 });
          return data.slug;
        }
      } else if (res.status === 404) {
        sellerDomainCache.set(cleanHost, { slug: null, expiresAt: now + 15_000 });
        return null;
      }
    } catch {
      // Try next fallback URL
    }
  }

  return null;
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const rawHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const host = rawHost.split(",")[0].trim().split(":")[0].toLowerCase();
  const isCustomDomain = host === ADMIN_CUSTOM_DOMAIN || host === `www.${ADMIN_CUSTOM_DOMAIN}`;
  const isStorefrontDomain = host === STOREFRONT_DOMAIN || host === `www.${STOREFRONT_DOMAIN}`;
  const isMainDomain = host === MAIN_DOMAIN || host === `www.${MAIN_DOMAIN}`;
  const isLocalhost =
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.endsWith(".local") ||
    host.endsWith(".vercel.app");
  const isSellerCustomDomain =
    Boolean(host) && !isCustomDomain && !isStorefrontDomain && !isMainDomain && !isLocalhost;

  // ---------------------------------------------------------------------------
  // 1. DEDICATED ADMIN CUSTOM DOMAIN ROUTING (data-deals.com)
  // ---------------------------------------------------------------------------
  if (isCustomDomain) {
    // Block admin and dashboard routes on custom domain, redirecting to main platform login
    if (pathname.startsWith("/admin") || pathname.startsWith("/dashboard")) {
      return NextResponse.redirect(`https://${MAIN_DOMAIN}/login`);
    }

    // Serve dedicated storefront favicon and app icons
    if (pathname === "/favicon.ico" || pathname === "/icon.svg" || pathname === "/apple-icon.png") {
      const url = request.nextUrl.clone();
      url.pathname = "/store/icon.svg";
      return NextResponse.rewrite(url);
    }

    // Allow API endpoints, internal assets, static files, and legal policies to execute directly
    if (
      pathname.startsWith("/api") ||
      pathname.startsWith("/_next") ||
      pathname.startsWith("/terms") ||
      pathname.startsWith("/privacy") ||
      pathname.startsWith("/refund") ||
      pathname.startsWith("/legal") ||
      pathname.includes(".")
    ) {
      return NextResponse.next();
    }

    // Normalize visits containing the slug (e.g. /data-deals/mtn, /data-deals, /store/data-deals/mtn)
    if (
      pathname === "/store" ||
      pathname === "/store/" ||
      pathname === "/store/data-deals" ||
      pathname === "/store/data-deals/" ||
      pathname === "/data-deals" ||
      pathname === "/data-deals/"
    ) {
      const cleanUrl = request.nextUrl.clone();
      cleanUrl.pathname = "/";
      return NextResponse.redirect(cleanUrl);
    }
    if (pathname.startsWith("/store/data-deals/")) {
      const cleanPath = pathname.replace(/^\/store\/data-deals/, "");
      const cleanUrl = request.nextUrl.clone();
      cleanUrl.pathname = cleanPath || "/";
      return NextResponse.redirect(cleanUrl);
    }
    if (pathname.startsWith("/data-deals/")) {
      const cleanPath = pathname.replace(/^\/data-deals/, "");
      const cleanUrl = request.nextUrl.clone();
      cleanUrl.pathname = cleanPath || "/";
      return NextResponse.redirect(cleanUrl);
    }

    // Root of custom domain -> /store/data-deals
    if (pathname === "/" || pathname === "") {
      const url = request.nextUrl.clone();
      url.pathname = "/store/data-deals";
      return NextResponse.rewrite(url);
    }

    // Rewrite clean paths:
    // /[network] -> /store/data-deals/[network]
    // /track -> /store/data-deals/track
    // /order/:ref -> /store/data-deals/order/:ref
    const url = request.nextUrl.clone();
    url.pathname = `/store/data-deals${pathname}`;
    return NextResponse.rewrite(url);
  }

  // ---------------------------------------------------------------------------
  // 2. STOREFRONT DOMAIN ROUTING (tskdatastore.com)
  // ---------------------------------------------------------------------------
  if (isStorefrontDomain) {
    // Prevent access to management dashboard & admin panel on the storefront domain
    if (pathname.startsWith("/admin") || pathname.startsWith("/dashboard")) {
      return NextResponse.redirect(`https://${MAIN_DOMAIN}/login`);
    }

    // Serve dedicated storefront favicon and app icons for tskdatastore.com
    if (pathname === "/favicon.ico" || pathname === "/icon.svg" || pathname === "/apple-icon.png") {
      const url = request.nextUrl.clone();
      url.pathname = "/store/icon.svg";
      return NextResponse.rewrite(url);
    }

    // Allow API endpoints, internal assets, static files, and legal policies to execute directly
    if (
      pathname.startsWith("/api") ||
      pathname.startsWith("/_next") ||
      pathname.startsWith("/terms") ||
      pathname.startsWith("/privacy") ||
      pathname.startsWith("/refund") ||
      pathname.startsWith("/legal") ||
      pathname.includes(".")
    ) {
      return NextResponse.next();
    }

    // Normalize legacy /store URLs to clean root URLs
    if (pathname === "/store" || pathname === "/store/") {
      const cleanUrl = request.nextUrl.clone();
      cleanUrl.pathname = "/";
      return NextResponse.redirect(cleanUrl);
    }
    if (pathname.startsWith("/store/")) {
      const cleanPath = pathname.replace(/^\/store/, "");
      const cleanUrl = request.nextUrl.clone();
      cleanUrl.pathname = cleanPath || "/";
      return NextResponse.redirect(cleanUrl);
    }

    // Handle Storefront root (e.g. https://tskdatastore.com/)
    // Rewrites to /store which renders the dedicated "Inquisitive Visitor" homepage
    if (pathname === "/" || pathname === "") {
      const url = request.nextUrl.clone();
      url.pathname = "/store";
      return NextResponse.rewrite(url);
    }

    // Rewrite clean storefront paths:
    // /:slug -> /store/:slug
    // /:slug/mtn -> /store/:slug/mtn
    // /:slug/track -> /store/:slug/track
    // /:slug/order/:ref -> /store/:slug/order/:ref
    const url = request.nextUrl.clone();
    url.pathname = `/store${pathname}`;
    return NextResponse.rewrite(url);
  }

  // ---------------------------------------------------------------------------
  // 3. SELLER CUSTOM DOMAIN ROUTING (e.g. kofidata.com connected via Cloudflare)
  // ---------------------------------------------------------------------------
  if (isSellerCustomDomain) {
    // Prevent access to management dashboard & admin panel on seller custom domains
    if (pathname.startsWith("/admin") || pathname.startsWith("/dashboard")) {
      return NextResponse.redirect(`https://${MAIN_DOMAIN}/login`);
    }

    // Serve dedicated storefront favicon and app icons
    if (pathname === "/favicon.ico" || pathname === "/icon.svg" || pathname === "/apple-icon.png") {
      const url = request.nextUrl.clone();
      url.pathname = "/store/icon.svg";
      return NextResponse.rewrite(url);
    }

    // Allow API endpoints (including /api/store/domain-ping & /api/store/domain-resolve),
    // internal assets, static files, and legal policies to execute directly
    if (
      pathname.startsWith("/api") ||
      pathname.startsWith("/_next") ||
      pathname.startsWith("/terms") ||
      pathname.startsWith("/privacy") ||
      pathname.startsWith("/refund") ||
      pathname.startsWith("/legal") ||
      pathname.includes(".")
    ) {
      return NextResponse.next();
    }

    const sellerSlug = await resolveSellerCustomDomainSlug(host, request.nextUrl.origin);
    if (!sellerSlug) {
      // Unknown or unconfigured custom domain -> fallback to storefront landing gateway
      const url = request.nextUrl.clone();
      url.pathname = "/store";
      return NextResponse.rewrite(url);
    }

    // Normalize visits containing /store/:slug or /:slug to clean root URLs
    if (
      pathname === "/store" ||
      pathname === "/store/" ||
      pathname === `/store/${sellerSlug}` ||
      pathname === `/store/${sellerSlug}/` ||
      pathname === `/${sellerSlug}` ||
      pathname === `/${sellerSlug}/`
    ) {
      const cleanUrl = request.nextUrl.clone();
      cleanUrl.pathname = "/";
      return NextResponse.redirect(cleanUrl);
    }
    if (pathname.startsWith(`/store/${sellerSlug}/`)) {
      const cleanPath = pathname.slice(`/store/${sellerSlug}`.length);
      const cleanUrl = request.nextUrl.clone();
      cleanUrl.pathname = cleanPath || "/";
      return NextResponse.redirect(cleanUrl);
    }
    if (pathname.startsWith(`/${sellerSlug}/`)) {
      const cleanPath = pathname.slice(`/${sellerSlug}`.length);
      const cleanUrl = request.nextUrl.clone();
      cleanUrl.pathname = cleanPath || "/";
      return NextResponse.redirect(cleanUrl);
    }

    // Root of seller custom domain -> /store/:sellerSlug
    if (pathname === "/" || pathname === "") {
      const url = request.nextUrl.clone();
      url.pathname = `/store/${sellerSlug}`;
      return NextResponse.rewrite(url);
    }

    // Rewrite clean paths:
    // /[network] -> /store/:sellerSlug/[network]
    // /track -> /store/:sellerSlug/track
    // /order/:ref -> /store/:sellerSlug/order/:ref
    const url = request.nextUrl.clone();
    url.pathname = `/store/${sellerSlug}${pathname}`;
    return NextResponse.rewrite(url);
  }

  // ---------------------------------------------------------------------------
  // 4. MAIN PLATFORM ROUTING (tsk05.net / localhost)
  // ---------------------------------------------------------------------------

  // Friendly /@slug redirects to the dedicated storefront domain (or rewrites in local dev)
  if (pathname.startsWith("/@")) {
    const slug = pathname.slice(2).replace(/\/+$/, "");
    if (/^[a-z0-9-]{3,32}$/.test(slug)) {
      if (isLocalhost) {
        const url = request.nextUrl.clone();
        url.pathname = `/store/${slug}`;
        return NextResponse.rewrite(url);
      }
      return NextResponse.redirect(`https://${STOREFRONT_DOMAIN}/${slug}`);
    }
  }

  // If in production on main domain and visitor accesses /store/slug, redirect to clean storefront domain
  if (!isLocalhost && pathname.startsWith("/store/")) {
    const cleanPath = pathname.replace(/^\/store/, "");
    return NextResponse.redirect(`https://${STOREFRONT_DOMAIN}${cleanPath}${search}`);
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  let payload: { role?: unknown; tv?: unknown } | null = null;
  if (token) {
    try {
      const { payload: verified } = await jwtVerify(token, secret, {
        issuer: "tskconnect",
      });
      payload = verified as { role?: unknown; tv?: unknown };
    } catch {
      payload = null;
    }
  }

  const role = typeof payload?.role === "string" ? payload.role : null;
  const isAuthPage = pathname === "/login" || pathname === "/register";

  if (isAuthPage && role) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (!pathname.startsWith("/admin") && !pathname.startsWith("/api/admin")) {
    if (isAuthPage) return NextResponse.next();
  }

  // Protect admin pages
  if (pathname.startsWith("/admin")) {
    if (!role) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?next=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }
    if (role !== "ADMIN" && role !== "MANAGER") {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      url.search = "";
      return NextResponse.redirect(url);
    }
    // ADMIN-only sections (MANAGER is not allowed)
    if (
      role !== "ADMIN" &&
      ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p))
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - static asset images (png, jpg, jpeg, gif, webp)
     */
    "/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|webp)$).*)",
  ],
};
