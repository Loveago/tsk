import { SignJWT, jwtVerify } from "jose";
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { rateLimit } from "./rate-limit";

const secretString = process.env.AUTH_SECRET || "dev-insecure-secret-change-me-replace-in-prod";
const secret = new TextEncoder().encode(secretString);

export interface LoginOtpPayload {
  code: string;
  ticket: string;
}

export interface VerifyOtpResult {
  valid: boolean;
  userId?: string;
  email?: string;
  error?: string;
}

export interface OtpTicketPayload {
  sub: string;
  email: string;
  codeHash: string;
  jti: string;
  type: string;
}

/**
 * In-memory store for consumed OTP tickets to guarantee single-use replay protection.
 * Keys are jti identifiers; values are expiration timestamps (ms).
 */
const consumedJtis = new Map<string, number>();

function cleanExpiredConsumedJtis() {
  const now = Date.now();
  for (const [jti, expiresAt] of consumedJtis.entries()) {
    if (expiresAt <= now) {
      consumedJtis.delete(jti);
    }
  }
}

// Clean up every 60 seconds
if (typeof setInterval !== "undefined") {
  const timer = setInterval(cleanExpiredConsumedJtis, 60_000);
  if (typeof timer === "object" && "unref" in timer) timer.unref();
}

export function isTicketConsumed(jti: string): boolean {
  const expiresAt = consumedJtis.get(jti);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    consumedJtis.delete(jti);
    return false;
  }
  return true;
}

export function markTicketConsumed(jti: string, ttlMs: number = 15 * 60 * 1000): void {
  consumedJtis.set(jti, Date.now() + ttlMs);
}

/**
 * Generates a 6-digit numeric OTP code using CSPRNG (crypto.randomInt) and a cryptographically
 * signed ticket (JWT). The ticket is valid for 10 minutes and contains HMAC of (userId:code:nonce).
 */
export async function generateLoginOtp(
  userId: string,
  email: string
): Promise<LoginOtpPayload> {
  // Use cryptographically secure pseudo-random number generator
  const code = randomInt(100000, 1000000).toString();

  const jti = randomBytes(16).toString("hex");
  const codeHash = createHmac("sha256", secretString)
    .update(`${userId}:${code}:${jti}`)
    .digest("hex");

  const ticket = await new SignJWT({
    sub: userId,
    email,
    codeHash,
    jti,
    type: "login_otp",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("tskconnect")
    .setExpirationTime("10m")
    .sign(secret);

  return { code, ticket };
}

/**
 * Validates the cryptographic signature, expiration, and payload structure of an OTP ticket.
 */
export async function verifyOtpTicket(
  ticket: string
): Promise<{ valid: boolean; payload?: OtpTicketPayload; error?: string }> {
  if (!ticket) {
    return { valid: false, error: "Missing OTP ticket" };
  }

  try {
    const verified = await jwtVerify(ticket, secret, { issuer: "tskconnect" });
    const payload = verified.payload as Partial<OtpTicketPayload>;

    if (
      payload.type !== "login_otp" ||
      !payload.sub ||
      !payload.email ||
      !payload.codeHash ||
      !payload.jti
    ) {
      return { valid: false, error: "Invalid OTP session payload." };
    }

    return {
      valid: true,
      payload: payload as OtpTicketPayload,
    };
  } catch {
    return {
      valid: false,
      error: "Verification session has expired or is invalid. Please sign in again.",
    };
  }
}

/**
 * Verifies a 6-digit OTP code against the signed ticket.
 * Enforces rate-limiting (max 5 attempts per ticket), expiration, and replay prevention.
 */
export async function verifyLoginOtp(
  ticket: string,
  inputCode: string
): Promise<VerifyOtpResult> {
  if (!ticket || !inputCode) {
    return { valid: false, error: "Missing OTP ticket or code" };
  }

  const ticketVerification = await verifyOtpTicket(ticket);
  if (!ticketVerification.valid || !ticketVerification.payload) {
    return {
      valid: false,
      error: ticketVerification.error || "Verification session has expired or is invalid. Please sign in again.",
    };
  }

  const { payload } = ticketVerification;

  // Immediate check: Has this ticket already been consumed?
  if (isTicketConsumed(payload.jti)) {
    return {
      valid: false,
      error: "This verification code has already been used. Please sign in again.",
    };
  }

  // Rate limit incorrect attempts on this specific OTP ticket (max 5 attempts within 10 minutes)
  const rl = rateLimit(`otp_attempt:${payload.jti}`, 5, 10 * 60 * 1000);
  if (!rl.allowed) {
    return {
      valid: false,
      error: "Too many incorrect attempts. Please sign in again to request a new code.",
    };
  }

  const expectedHash = createHmac("sha256", secretString)
    .update(`${payload.sub}:${inputCode.trim()}:${payload.jti}`)
    .digest("hex");

  const a = Buffer.from(payload.codeHash, "utf8");
  const b = Buffer.from(expectedHash, "utf8");

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return {
      valid: false,
      error: "Incorrect 6-digit verification code. Please check and try again.",
    };
  }

  // Mark ticket as consumed so it cannot be used again
  markTicketConsumed(payload.jti, 15 * 60 * 1000);

  return {
    valid: true,
    userId: payload.sub,
    email: payload.email,
  };
}
