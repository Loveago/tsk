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
const MAIN_DOMAIN = (process.env.MAIN_DOMAIN || "tsk05.net").toLowerCase();

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const rawHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const host = rawHost.split(":")[0].toLowerCase();
  const isStorefrontDomain = host === STOREFRONT_DOMAIN || host === `www.${STOREFRONT_DOMAIN}`;
  const isLocalhost = host.startsWith("localhost") || host.startsWith("127.0.0.1");

  // ---------------------------------------------------------------------------
  // 1. STOREFRONT DOMAIN ROUTING (tskdatastore.com)
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

    // Allow API endpoints, internal assets, and static files to execute directly
    if (
      pathname.startsWith("/api") ||
      pathname.startsWith("/_next") ||
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
  // 2. MAIN PLATFORM ROUTING (tsk05.net / localhost)
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
