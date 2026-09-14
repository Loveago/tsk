import { SignJWT, jwtVerify } from "jose";

export interface SessionPayload {
  sub: string; // user id
  email: string;
  name: string;
  role: string; // ADMIN | MANAGER | RESELLER | USER
  tv: number; // tokenVersion for session invalidation
}

const secretString = process.env.AUTH_SECRET || (process.env.NODE_ENV !== "production" ? "dev-insecure-secret-change-me" : "");
if (!secretString) throw new Error("AUTH_SECRET must be set in production");
const secret = new TextEncoder().encode(secretString);

export const SESSION_COOKIE = "tskconnect_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("tskconnect")
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secret);
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: "tskconnect",
    });
    if (!payload.sub || typeof payload.role !== "string") return null;
    return {
      sub: payload.sub,
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
      role: payload.role,
      tv: typeof payload.tv === "number" ? payload.tv : 0,
    };
  } catch {
    return null;
  }
}

// Edge-safe cookie helpers (used by middleware)
export const SESSION_COOKIE_NAME = SESSION_COOKIE;
