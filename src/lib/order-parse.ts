import { phoneSchema } from "./validation";

export interface OrderParsePackage {
  network: string;
  gbAmount: number;
  price: number | null;
}

export interface ParsedOrderLine {
  phoneNumber: string;
  network: string;
  gbAmount: number;
  price: number | null;
}

export const NETWORK_LABELS: Record<string, string> = {
  MTN: "MTN",
  TELECEL: "Telecel",
  AIRTELTIGO: "AirtelTigo",
};

function splitTokens(line: string): string[] {
  return line
    .split(/[,;\t]+|\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** "1", "1.5", "10gb", "1 GB" -> number; anything else -> null */
function parseGbToken(token: string): number | null {
  const m = token.replace(/\s+/g, "").match(/^(\d+(?:[.,]\d+)?)(?:gb)?$/i);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) && n > 0 && n <= 1000 ? n : null;
}

/** "MTN" | "Telecel" | "Vodafone" | "AirtelTigo" | "AT" | "Tigo" -> canonical network */
function normalizeNetworkToken(token: string): string | null {
  const letters = token.replace(/[^a-zA-Z]/g, "").toUpperCase();
  if (letters === "MTN") return "MTN";
  if (letters === "TELECEL" || letters === "VODAFONE" || letters === "VOD")
    return "TELECEL";
  if (["AIRTELTIGO", "AIRTEL", "TIGO", "AT"].includes(letters)) return "AIRTELTIGO";
  return null;
}

/** Clean common phone formats: +233…/233… -> 0…, restore Excel-dropped leading zero (e.g. 535308873 -> 0535308873) */
export function normalizePhone(raw: string): string {
  let p = raw.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (p.startsWith("233") && p.length === 12) p = `0${p.slice(3)}`;
  if (p.length === 9) p = `0${p}`;
  return p;
}

/**
 * Replaces any phone numbers missing their leading zero in text
 * (e.g. 535308873 -> 0535308873, +233535308873 -> 0535308873, 233535308873 -> 0535308873)
 */
export function normalizeTextNumbers(text: string): string {
  return text
    // Replace international prefix +233 or 233 with 0
    .replace(/(?:^|[^\d+])(?:\+?233)\s*([25]\d{8})\b/g, (m, p) =>
      m.startsWith("+") || !/\d/.test(m[0]) ? (m[0] === "+" ? "0" + p : m[0] + "0" + p) : "0" + p
    )
    // Replace 9-digit Ghanaian mobile numbers (starting with 2 or 5) not preceded by a digit with 0...
    .replace(/(?:^|[^\d])([25]\d{8})\b/g, (m, p) => (m.length > 9 ? m[0] + "0" + p : "0" + p));
}

/** True once the (normalized) number has reached full local length. */
function isCompletePhone(raw: string): boolean {
  return normalizePhone(raw).length >= 10;
}

/**
 * Splits bulk order text into individual order lines.
 * Handles newlines and inline orders separated by commas/semicolons where
 * a comma/semicolon is followed by a new Ghanaian phone number.
 */
export function splitOrderLines(text: string): string[] {
  const cleanText = normalizeTextNumbers(text);
  return cleanText
    .replace(/[,;]\s*(?=(?:\+?233|0)?[25]\d{8}\b)/g, "\n")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Detects if a line is a header row (e.g. "Numbers gb", "Phone GB", "Recipient Size", etc.)
 * or a non-order line without any Ghanaian phone number.
 */
export function isHeaderLine(line: string): boolean {
  const clean = line.trim();
  if (!clean) return true;
  // If line contains no digits at all, it cannot be an order line
  if (!/\d/.test(clean)) return true;

  // Check if it has a phone number pattern
  const hasPhone =
    /(?:\+?233|0)?[235]\d[\s.-]?\d{3}[\s.-]?\d{4}\b|\b[235]\d{8}\b|(?:^|[^\d])0[235]\d{8}(?:[^\d]|$)/.test(
      clean
    );
  if (
    !hasPhone &&
    /(?:number|numbers|phone|recipient|beneficiary|msisdn|contact|gb|gbs|size|data|package|network|amount|qty|vol|volume|s\/n|sn|no\.?)/i.test(
      clean
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Parses one order line in any flexible format (e.g. `0535308873 5gb`,
 * `0257467983 4gb`, `0557802534 4`, `1. 0535308873 - 5gb`, `Phone: 0535308873, GB: 5`).
 * Intelligently ignores text labels and letters, extracts the phone number and GB amount,
 * and matches the available package.
 * Returns null for headers/blank/invalid lines.
 */
export function parseOrderLine(
  line: string,
  packages: OrderParsePackage[],
  defaultNetwork: string,
  defaultGb?: number
): ParsedOrderLine | null {
  if (isHeaderLine(line)) return null;

  // 1. Strip leading item / list numbering e.g. "1. ", "1) ", "#1 ", "No. 12: "
  let workingLine = line.trim().replace(/^\s*(?:no\.?|#)?\s*\d{1,4}[.)\-:]\s+/i, "");

  // 2. Intelligently locate and extract the phone number
  let phone: string | null = null;
  let rawPhoneMatch = "";

  // International format: (+233 or 233) followed by 9 digits
  const intlMatch = workingLine.match(/(?:\+?233)\s*([235]\d{2}[\s.-]?\d{3}[\s.-]?\d{3})\b/);
  if (intlMatch) {
    const digits = intlMatch[1].replace(/\D/g, "");
    if (digits.length === 9) {
      phone = "0" + digits;
      rawPhoneMatch = intlMatch[0];
    }
  }

  // Local 10-digit with optional spaces/dashes (e.g. 024 123 4567, 0535308873)
  if (!phone) {
    const localMatch = workingLine.match(/\b(0[235]\d[\s.-]?\d{3}[\s.-]?\d{4})\b/);
    if (localMatch) {
      const digits = localMatch[1].replace(/\D/g, "");
      if (digits.length === 10) {
        phone = digits;
        rawPhoneMatch = localMatch[0];
      }
    }
  }

  // Continuous 10 digits starting with 02, 03, 05
  if (!phone) {
    const contMatch = workingLine.match(/(?:^|[^\d])(0[235]\d{8})(?:[^\d]|$)/);
    if (contMatch) {
      phone = contMatch[1];
      rawPhoneMatch = contMatch[1];
    }
  }

  // 9 digits without leading 0
  if (!phone) {
    const nineMatch = workingLine.match(/\b([235]\d{8})\b/);
    if (nineMatch) {
      phone = "0" + nineMatch[1];
      rawPhoneMatch = nineMatch[0];
    }
  }

  if (!phone) return null;
  if (!phoneSchema.safeParse(phone).success) return null;

  // 3. Remove the matched phone number to isolate the remainder of the line
  let rem = workingLine.replace(rawPhoneMatch, " ");

  // 4. Extract network if explicitly mentioned
  let network: string | null = null;
  if (/\bMTN\b/i.test(rem)) network = "MTN";
  else if (/\b(?:TELECEL|VODAFONE|VOD)\b/i.test(rem)) network = "TELECEL";
  else if (/\b(?:AIRTELTIGO|AIRTEL|TIGO|AT)\b/i.test(rem)) network = "AIRTELTIGO";

  if (network) {
    rem = rem.replace(new RegExp(`\\b${network}\\b`, "gi"), " ");
  }
  rem = rem.replace(/\b(?:MTN|TELECEL|VODAFONE|AIRTELTIGO|AIRTEL|TIGO|AT)\b/gi, " ");

  // 5. Remove common label words: "number", "numbers", "phone", "recipient", "size", etc.
  rem = rem.replace(
    /\b(?:number|numbers|phone|recipient|beneficiary|size|amount|data|package|item|no|qty)\b/gi,
    " "
  );

  // 6. Extract GB amount (e.g. "5gb", "5 GB", "5", "5 gig", "5g", "4.5gb")
  const gbMatch = rem.match(/(?:^|[^\d.])(\d+(?:[.,]\d+)?)\s*(?:gb|gbs|gig|gigs|gigabytes|g)?(?=[^\d.]|$)/i);
  let gbAmount: number | null = null;
  if (gbMatch) {
    const n = parseFloat(gbMatch[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0 && n <= 1000) {
      gbAmount = n;
    }
  }

  const effectiveGb = gbAmount ?? defaultGb ?? null;
  if (effectiveGb == null) return null;

  const resolved = network ?? defaultNetwork;
  const price =
    packages.find((q) => q.network === resolved && q.gbAmount === effectiveGb)?.price ?? null;
  if (price == null) return null;

  return { phoneNumber: phone, network: resolved, gbAmount: effectiveGb, price };
}