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
 * Parses one order line in the form "number gb" (e.g. `0535308873,1` or
 * `0507904981 10gb`, or just `535308873` defaulting to 1GB). The selected network
 * applies unless the line carries an explicit network token.
 * Automatically restores missing leading 0 (e.g. `535308873` -> `0535308873`).
 * Returns null for blank/invalid lines.
 */
export function parseOrderLine(
  line: string,
  packages: OrderParsePackage[],
  defaultNetwork: string,
  defaultGb: number = 1
): ParsedOrderLine | null {
  const tokens = splitTokens(line);
  if (!tokens.length) return null;
  // A phone number may be typed with spaces (e.g. "024 123 4567") — gather
  // leading digit groups until the number is complete.
  const phoneParts = [tokens[0]];
  let i = 1;
  while (
    i < tokens.length &&
    !isCompletePhone(phoneParts.join("")) &&
    /^\d+$/.test(tokens[i])
  ) {
    phoneParts.push(tokens[i]);
    i++;
  }
  const phone = normalizePhone(phoneParts.join(""));
  let network: string | null = null;
  let gb: number | null = null;
  for (const t of tokens.slice(i)) {
    const net = normalizeNetworkToken(t);
    if (net) {
      network ??= net;
      continue;
    }
    gb ??= parseGbToken(t);
  }
  const resolved = network ?? defaultNetwork;
  if (!phone) return null;
  const effectiveGb = gb ?? defaultGb;
  if (!phoneSchema.safeParse(phone).success) return null;
  const price =
    packages.find((q) => q.network === resolved && q.gbAmount === effectiveGb)?.price ?? null;
  if (price == null) return null;
  return { phoneNumber: phone, network: resolved, gbAmount: effectiveGb, price };
}