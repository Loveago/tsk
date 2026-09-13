import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "./auth";

export function apiError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export function zodFail(err: ZodError) {
  return NextResponse.json(
    { error: err.errors[0]?.message ?? "Invalid input" },
    { status: 400 }
  );
}

export function handleRouteError(err: unknown) {
  if (err instanceof ZodError) return zodFail(err);
  if (err instanceof AuthError) return apiError(err.status, err.message);
  const message = err instanceof Error ? err.message : "Something went wrong";
  console.error("[api]", err);
  return apiError(500, message);
}

/**
 * Dynamically resolves the full origin (protocol + host) of the incoming request,
 * taking into account reverse proxy headers (x-forwarded-host, x-forwarded-proto, host)
 * and environment variable overrides before falling back to nextUrl.origin.
 */
export function getRequestOrigin(
  request: Request | { headers: Headers; nextUrl?: { origin: string } }
): string {
  const headers = request.headers;
  const rawForwardedHost = headers.get("x-forwarded-host");
  const forwardedHost = rawForwardedHost ? rawForwardedHost.split(",")[0].trim() : null;
  const rawHost = headers.get("host");
  const host = forwardedHost || (rawHost ? rawHost.split(",")[0].trim() : null);
  const rawForwardedProto = headers.get("x-forwarded-proto");
  const proto = rawForwardedProto
    ? rawForwardedProto.split(",")[0].trim()
    : process.env.NODE_ENV === "production"
    ? "https"
    : "http";
  if (host) {
    return `${proto}://${host}`;
  }
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/$/, "");
  }
  if (process.env.NEXTAUTH_URL) {
    return process.env.NEXTAUTH_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }
  if ("nextUrl" in request && request.nextUrl?.origin) {
    return request.nextUrl.origin;
  }
  return "";
}

