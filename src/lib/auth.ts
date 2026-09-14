import { cookies, headers } from "next/headers";
import { cache } from "react";
import { prisma } from "./prisma";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  signSession,
  verifySessionToken,
  type SessionPayload,
} from "./session";
import type { AuthUser, UserRole } from "./types";

export async function createSession(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  tokenVersion: number;
}): Promise<void> {
  const token = await signSession({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tv: user.tokenVersion,
  });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/**
 * Returns the current session payload (JWT claims) if the cookie is valid.
 * Cheap — no DB call.
 */
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
});

/**
 * Returns the full AuthUser (DB-backed) for the current session.
 * Verifies status + tokenVersion so disabled users / reset sessions are
 * rejected immediately, server-side.
 */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const session = await getSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      balance: true,
      tokenVersion: true,
      pricingProfileId: true,
    },
  });

  if (!user) return null;
  if (user.status !== "ACTIVE") return null;
  if (user.tokenVersion !== session.tv) return null; // sessions were reset

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as UserRole,
    status: user.status,
    balance: user.balance,
    pricingProfileId: user.pricingProfileId,
  };
});

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("UNAUTHENTICATED", 401);
  return user;
}

export async function requireRole(roles: UserRole[]): Promise<AuthUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw new AuthError("FORBIDDEN", 403);
  }
  return user;
}

export async function requireAdmin(): Promise<AuthUser> {
  return requireRole(["ADMIN"]);
}

export async function requireStaff(): Promise<AuthUser> {
  return requireRole(["ADMIN", "MANAGER", "SECRETARY"]);
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}
