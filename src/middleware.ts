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

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
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

  // Friendly /@slug addresses rewrite to the public storefront page (§8)
  if (pathname.startsWith("/@")) {
    const slug = pathname.slice(2).replace(/\/+$/, "");
    if (/^[a-z0-9-]{3,32}$/.test(slug)) {
      const url = request.nextUrl.clone();
      url.pathname = `/store/${slug}`;
      return NextResponse.rewrite(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/login", "/register", "/@:path*"],
};
