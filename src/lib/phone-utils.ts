/**
 * Standalone, client-safe phone number utilities for Ghanaian networks.
 * Zero server-side, Next.js header, or database dependencies.
 */

export const MTN_PREFIXES = ["024", "025", "053", "054", "055", "059"];
export const TELECEL_PREFIXES = ["020", "050"];
export const AIRTELTIGO_PREFIXES = ["026", "027", "056", "057"];

export const GHANA_PHONE_REGEX = /^0(24|25|53|54|55|59|20|50|26|27|56|57)\d{7}$/;
export const MTN_PHONE_REGEX = /^0(24|25|53|54|55|59)\d{7}$/;

/**
 * Normalizes any Ghanaian phone number into the canonical 10-digit format:
 * e.g., 0241234567.
 * Handles:
 *  - 0241234567 -> 0241234567
 *  - +233241234567 -> 0241234567
 *  - 233241234567 -> 0241234567
 *  - 241234567 -> 0241234567
 *  - Spaced or punctuated numbers: "+233 (024) 123-4567" -> 0241234567
 */
export function normalizeGhanaPhoneNumber(raw: string): string {
  if (!raw) return "";
  let p = String(raw).trim().replace(/[^\d+]/g, "").replace(/^\+/, "");
  // Handles international 00233 prefix
  if (p.startsWith("00233")) {
    p = p.slice(2);
  }
  // Handles +233 or 233 prefix with 9 or 10 digits following
  if (p.startsWith("233")) {
    const without233 = p.slice(3);
    if (without233.startsWith("0")) {
      p = without233;
    } else {
      p = `0${without233}`;
    }
  }
  // Dropped leading zero, e.g. 241234567 (9 digits) -> 0241234567
  if (p.length === 9 && !p.startsWith("0")) {
    p = `0${p}`;
  }
  return p;
}

export const normalizeGhanaPhone = normalizeGhanaPhoneNumber;

export function isValidGhanaPhoneNumber(raw: string): boolean {
  const normalized = normalizeGhanaPhoneNumber(raw);
  return GHANA_PHONE_REGEX.test(normalized);
}

export function isMtnPhoneNumber(raw: string): boolean {
  const normalized = normalizeGhanaPhoneNumber(raw);
  return MTN_PHONE_REGEX.test(normalized);
}

export function getNetworkFromGhanaPhone(
  raw: string
): "MTN" | "TELECEL" | "AIRTELTIGO" | null {
  const normalized = normalizeGhanaPhoneNumber(raw);
  if (!GHANA_PHONE_REGEX.test(normalized)) return null;
  const prefix = normalized.slice(0, 3);
  if (MTN_PREFIXES.includes(prefix)) return "MTN";
  if (TELECEL_PREFIXES.includes(prefix)) return "TELECEL";
  if (AIRTELTIGO_PREFIXES.includes(prefix)) return "AIRTELTIGO";
  return null;
}

export function isMtnPrefix(raw: string): boolean {
  const normalized = normalizeGhanaPhoneNumber(raw);
  return MTN_PREFIXES.includes(normalized.slice(0, 3));
}

export function detectNetworkNameByPrefix(raw: string): string {
  const normalized = normalizeGhanaPhoneNumber(raw);
  const prefix = normalized.slice(0, 3);
  if (MTN_PREFIXES.includes(prefix)) return "MTN";
  if (TELECEL_PREFIXES.includes(prefix)) return "Telecel";
  if (AIRTELTIGO_PREFIXES.includes(prefix)) return "AirtelTigo";
  return "Unknown";
}
