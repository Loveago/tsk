import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  validateApiAuth,
  formatApiSuccess,
  formatApiError,
  logApiRequestEntry,
  ApiError,
} from "@/lib/developer-api";
import {
  normalizeGhanaPhoneNumber,
  isValidGhanaPhoneNumber,
  getNetworkFromGhanaPhone,
  isMtnPhoneNumber,
  detectNetworkNameByPrefix,
} from "@/lib/phone-utils";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Request-ID",
      "Access-Control-Max-Age": "86400",
    },
  });
}

type NumberEntry = {
  raw: string;
  normalized: string;
  network: "MTN" | "TELECEL" | "AIRTELTIGO" | null;
  targetNetwork?: "MTN" | "TELECEL" | "AIRTELTIGO" | null;
  valid: boolean;
};

type VerifyResult = {
  number: string;
  network: string | null;
  valid: boolean;
  verified: boolean;
  canOrder: boolean;
  isPorted?: boolean;
  originalNetwork?: string | null;
  note?: string;
};

async function executeVerification(
  rawNumbers: unknown[],
  authContext: any,
  globalTargetNetwork?: string | null
) {
  if (!Array.isArray(rawNumbers) || rawNumbers.length === 0) {
    throw new ApiError(
      "INVALID_REQUEST",
      "Please provide at least one phone number to verify (e.g. {\"numbers\": [\"0241234567\"]} or {\"number\": \"0241234567\"})",
      400
    );
  }

  if (rawNumbers.length > 100) {
    throw new ApiError(
      "INVALID_REQUEST",
      "A maximum of 100 numbers can be verified in a single request. Split your list into batches.",
      400
    );
  }

  const validTarget =
    globalTargetNetwork && ["MTN", "TELECEL", "AIRTELTIGO"].includes(globalTargetNetwork)
      ? (globalTargetNetwork as "MTN" | "TELECEL" | "AIRTELTIGO")
      : null;

  // ── Normalize & validate each number ──────────────────────────────────
  const entries: NumberEntry[] = rawNumbers.map((n) => {
    let raw = "";
    let itemNetwork: "MTN" | "TELECEL" | "AIRTELTIGO" | null = null;
    if (typeof n === "object" && n !== null) {
      const obj = n as any;
      raw = String(obj.number || obj.phone || obj.phoneNumber || "").trim();
      if (obj.network && typeof obj.network === "string") {
        const up = obj.network.trim().toUpperCase();
        if (["MTN", "TELECEL", "AIRTELTIGO"].includes(up)) {
          itemNetwork = up as any;
        }
      }
    } else {
      raw = typeof n === "string" ? n.trim() : String(n ?? "").trim();
    }
    const normalized = normalizeGhanaPhoneNumber(raw);
    const valid = isValidGhanaPhoneNumber(normalized);
    const prefixNetwork = valid ? getNetworkFromGhanaPhone(normalized) : null;
    const targetNetwork = itemNetwork || validTarget || null;
    return { raw, normalized, network: prefixNetwork, targetNetwork, valid };
  });

  // ── Fetch MTN verification setting ────────────────────────────────────
  const mtnVerifySetting = await prisma.systemSetting.findUnique({
    where: { key: "mtn_number_verification_enabled" },
  });
  const mtnVerificationEnabled = mtnVerifySetting?.value === "true";

  // ── Batch-fetch accepted MTN numbers for all valid numbers ───────────
  // Querying all valid numbers allows detecting ported numbers that are already whitelisted.
  const validNormalized = entries.filter((e) => e.valid).map((e) => e.normalized);

  const acceptedRows =
    validNormalized.length > 0 && !authContext.isSandbox
      ? await prisma.acceptedMtnNumber.findMany({
          where: { normalizedNumber: { in: validNormalized } },
          select: { normalizedNumber: true },
        })
      : [];

  const acceptedSet = new Set(acceptedRows.map((r) => r.normalizedNumber));

  // If Clickyfied verification is enabled, query Clickyfied for any candidate MTN numbers not yet in local DB
  if (!authContext.isSandbox) {
    const candidateMtn = entries
      .filter((e) => e.valid && (e.targetNetwork === "MTN" || e.network === "MTN"))
      .map((e) => e.normalized);
    const missingFromLocal = candidateMtn.filter((num) => !acceptedSet.has(num));

    if (missingFromLocal.length > 0) {
      const clickyfiedSetting = await prisma.systemSetting.findUnique({
        where: { key: "clickyfied_mtn_verification_enabled" },
      });
      if (clickyfiedSetting?.value === "true") {
        try {
          const { getProviderRoutingConfig } = await import("@/lib/provider-apis/router");
          const { ClickyfiedClient } = await import("@/lib/provider-apis/clickyfied");
          const { addAcceptedMtnNumber } = await import("@/lib/mtn-verification");
          const config = await getProviderRoutingConfig();
          const client = new ClickyfiedClient(config.clickyfied);
          const res = await client.verifyNumbers(missingFromLocal);
          const validNorms = new Set(res.validNumbers.map((n) => normalizeGhanaPhoneNumber(n)));
          for (const num of missingFromLocal) {
            if (validNorms.has(num)) {
              await addAcceptedMtnNumber(num, "CLICKYFIED_API", "Automated Verification API").catch(() => {});
              acceptedSet.add(num);
            }
          }
        } catch (err) {
          console.error("Clickyfied verification error in /v1/numbers/verify:", err);
        }
      }
    }
  }

  // ── Build per-number results ───────────────────────────────────────────
  const results: VerifyResult[] = entries.map((entry) => {
    if (!entry.valid) {
      return {
        number: entry.raw,
        network: null,
        valid: false,
        verified: false,
        canOrder: false,
        note: "Invalid Ghanaian phone number. Accepted formats: 0241234567, +233241234567, 233241234567",
      };
    }

    const isNativeMtn = isMtnPhoneNumber(entry.normalized);
    const isWhitelistedMtn = acceptedSet.has(entry.normalized);
    const checkAsMtn = entry.targetNetwork === "MTN" || isNativeMtn || isWhitelistedMtn;

    // 1. In accepted MTN whitelist:
    if (isWhitelistedMtn) {
      const isPorted = !isNativeMtn;
      const originalNetwork = isPorted ? detectNetworkNameByPrefix(entry.normalized) : null;
      return {
        number: entry.normalized,
        network: "MTN",
        valid: true,
        verified: true,
        canOrder: true,
        isPorted,
        originalNetwork: originalNetwork || undefined,
        note: isPorted
          ? `Ported number (${originalNetwork}) verified for MTN`
          : undefined,
      };
    }

    // 2. Evaluated for MTN (requested for MTN or native MTN prefix), but not yet verified:
    if (checkAsMtn) {
      const isPorted = !isNativeMtn;
      const originalNetwork = isPorted ? detectNetworkNameByPrefix(entry.normalized) : null;
      const isVerified = authContext.isSandbox;
      const canOrder = isVerified || !mtnVerificationEnabled;

      const result: VerifyResult = {
        number: entry.normalized,
        network: "MTN",
        valid: true,
        verified: isVerified,
        canOrder,
        isPorted,
        originalNetwork: originalNetwork || undefined,
      };

      if (authContext.isSandbox) {
        result.note = "Sandbox mode: all valid MTN numbers are treated as verified";
      } else if (!isVerified && mtnVerificationEnabled) {
        result.note = isPorted
          ? `This ported number (${originalNetwork}) is not verified for MTN. Submit for verification before placing MTN orders.`
          : "This MTN number is not in our verified database. Ordering will be rejected until it is verified.";
      } else if (!isVerified && !mtnVerificationEnabled) {
        result.note = isPorted
          ? `This ported number (${originalNetwork}) is not yet verified, but ordering is currently permitted while verification is disabled.`
          : "This MTN number is not yet verified, but ordering is currently permitted while verification is disabled.";
      }

      return result;
    }

    // 3. Telecel and AirtelTigo do not require number pre-verification
    return {
      number: entry.normalized,
      network: entry.network,
      valid: true,
      verified: true,
      canOrder: true,
      isPorted: false,
      note: `${entry.network} numbers do not require pre-verification`,
    };
  });

  // ── Helper lists & summary counters ──────────────────────────────────
  const verifiedList = results.filter((r) => r.valid && r.verified).map((r) => r.number);
  const unverifiedList = results.filter((r) => r.valid && !r.verified).map((r) => r.number);
  const invalidList = results.filter((r) => !r.valid).map((r) => r.number);

  const totalCount = results.length;
  const verifiedCount = verifiedList.length;
  const unverifiedCount = unverifiedList.length;
  const invalidCount = invalidList.length;

  return {
    verified: verifiedList,
    unverified: unverifiedList,
    invalid: invalidList,
    results,
    summary: {
      total: totalCount,
      verified: verifiedCount,
      unverified: unverifiedCount,
      invalid: invalidCount,
    },
  };
}

/**
 * POST /v1/numbers/verify
 *
 * Check whether one or more Ghanaian phone numbers are present in our
 * verified number database before placing an order.
 *
 * Accepts:
 *   { "numbers": ["0241234567", "0201234567"] }
 *   or { "number": "0241234567" }
 */
export async function POST(request: NextRequest) {
  const start = Date.now();
  const endpoint = "/v1/numbers/verify";
  let requestId = "req_initial";
  let authContext: any = null;

  try {
    authContext = await validateApiAuth(request, { requiredScope: "numbers:verify" });
    requestId = authContext.requestId;

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      throw new ApiError("INVALID_REQUEST", "Request body must be valid JSON", 400);
    }

    let rawNumbers: unknown[] = [];
    if (Array.isArray(body?.numbers)) {
      rawNumbers = body.numbers;
    } else if (Array.isArray(body?.phones)) {
      rawNumbers = body.phones;
    } else if (typeof body?.number === "string" || typeof body?.number === "number") {
      rawNumbers = [body.number];
    } else if (typeof body?.phone === "string" || typeof body?.phone === "number") {
      rawNumbers = [body.phone];
    } else if (typeof body?.phoneNumber === "string" || typeof body?.phoneNumber === "number") {
      rawNumbers = [body.phoneNumber];
    } else {
      throw new ApiError(
        "INVALID_REQUEST",
        'Request body must contain "numbers" array (e.g. { "numbers": ["0241234567"] }) or a single "number" string',
        400
      );
    }

    const targetNetwork = body?.network ? String(body.network).trim().toUpperCase() : null;
    const data = await executeVerification(rawNumbers, authContext, targetNetwork);

    await logApiRequestEntry({
      userId: authContext.userId,
      credentialId: authContext.credentialId,
      endpoint,
      method: "POST",
      status: 200,
      success: true,
      ip: authContext.clientIp,
      userAgent: authContext.userAgent,
      environment: authContext.environment,
      responseTimeMs: Date.now() - start,
      requestId,
    });

    return formatApiSuccess(data, requestId, 200, authContext.rateLimit);
  } catch (err: any) {
    const status = err instanceof ApiError ? err.status : 500;
    const code = err instanceof ApiError ? err.code : "SERVER_ERROR";
    const message = err.message || "An unexpected error occurred";

    await logApiRequestEntry({
      userId: authContext?.userId,
      credentialId: authContext?.credentialId,
      endpoint,
      method: "POST",
      status,
      success: false,
      ip: authContext?.clientIp,
      userAgent: authContext?.userAgent,
      environment: authContext?.environment,
      errorCode: code,
      responseTimeMs: Date.now() - start,
      requestId,
    });

    return formatApiError(code, message, status, requestId, err.rateLimitInfo);
  }
}

/**
 * GET /v1/numbers/verify?number=0241234567
 * GET /v1/numbers/verify?numbers=0241234567,0201234567&network=MTN
 */
export async function GET(request: NextRequest) {
  const start = Date.now();
  const endpoint = "/v1/numbers/verify";
  let requestId = "req_initial";
  let authContext: any = null;

  try {
    authContext = await validateApiAuth(request, { requiredScope: "numbers:verify" });
    requestId = authContext.requestId;

    const { searchParams } = new URL(request.url);
    let rawNumbers: string[] = [];

    const numbersParam = searchParams.get("numbers");
    const numberParam = searchParams.get("number") || searchParams.get("phone");

    if (numbersParam) {
      rawNumbers = numbersParam.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (numberParam) {
      rawNumbers = [numberParam.trim()];
    } else {
      throw new ApiError(
        "INVALID_REQUEST",
        "Please provide a number parameter, e.g. ?number=0241234567 or ?numbers=0241234567,0201234567",
        400
      );
    }

    const targetNetwork = searchParams.get("network") ? String(searchParams.get("network")).trim().toUpperCase() : null;
    const data = await executeVerification(rawNumbers, authContext, targetNetwork);

    await logApiRequestEntry({
      userId: authContext.userId,
      credentialId: authContext.credentialId,
      endpoint,
      method: "GET",
      status: 200,
      success: true,
      ip: authContext.clientIp,
      userAgent: authContext.userAgent,
      environment: authContext.environment,
      responseTimeMs: Date.now() - start,
      requestId,
    });

    return formatApiSuccess(data, requestId, 200, authContext.rateLimit);
  } catch (err: any) {
    const status = err instanceof ApiError ? err.status : 500;
    const code = err instanceof ApiError ? err.code : "SERVER_ERROR";
    const message = err.message || "An unexpected error occurred";

    await logApiRequestEntry({
      userId: authContext?.userId,
      credentialId: authContext?.credentialId,
      endpoint,
      method: "GET",
      status,
      success: false,
      ip: authContext?.clientIp,
      userAgent: authContext?.userAgent,
      environment: authContext?.environment,
      errorCode: code,
      responseTimeMs: Date.now() - start,
      requestId,
    });

    return formatApiError(code, message, status, requestId, err.rateLimitInfo);
  }
}
