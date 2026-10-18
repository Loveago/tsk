import { normalizeGhanaPhoneNumber, GHANA_PHONE_REGEX } from "./phone-utils";

export interface ParsedRefundEntry {
  originalLine: string;
  phone: string;
  normalizedPhone: string;
  gbAmount: number;
}

const WORD_TO_NUMBER: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  twentyfive: 25,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
};

/**
 * Extracts a Ghanaian phone number from a line of text.
 * Handles 10-digit formats (024..., 053...), 9-digit formats (535..., 241...),
 * international prefix (+233..., 233...), spaced/punctuated formats,
 * or 9-10 digit numbers starting with 02, 03, 05.
 */
export function extractPhoneFromRefundLine(line: string): { phone: string; rawMatch: string } | null {
  const working = line.trim().replace(/^\s*(?:no\.?|#)?\s*\d{1,4}[.)\-:]\s+/i, "");

  // 1. International format: (+233 or 233) followed by 9-10 digits
  const intlMatch = working.match(/(?:\+?233)\s*([235]\d{2}[\s.-]?\d{3}[\s.-]?\d{3,4})\b/);
  if (intlMatch) {
    const digits = intlMatch[1].replace(/\D/g, "");
    const normalized = "0" + digits.slice(-9);
    return { phone: normalized, rawMatch: intlMatch[0] };
  }

  // 2. Standard 10 digits with optional separators (e.g. 024 123 4567, 0535308873)
  const localMatch = working.match(/\b(0[235]\d[\s.-]?\d{3}[\s.-]?\d{4})\b/);
  if (localMatch) {
    const digits = localMatch[1].replace(/\D/g, "");
    if (digits.length === 10) {
      return { phone: digits, rawMatch: localMatch[0] };
    }
  }

  // 3. 9 digits without leading zero (e.g. 535308873, 241234567)
  const nineMatch = working.match(/\b([235]\d{8})\b/);
  if (nineMatch) {
    return { phone: "0" + nineMatch[1], rawMatch: nineMatch[0] };
  }

  // 4. Continuous 9-10 digits starting with 02, 03, 05 (e.g. 053308873 or 0535308873)
  const contMatch = working.match(/(?:^|[^\d])(0[235]\d{7,8})(?:[^\d]|$)/);
  if (contMatch) {
    return { phone: contMatch[1], rawMatch: contMatch[1] };
  }

  return null;
}

/**
 * Extracts a GB amount from a line (or remainder of line after phone is removed).
 * Handles numbers with units (e.g. "2gb", "5 GB", "10 gig", "1.5g", "2 gigabytes"),
 * conversational formats ("plus the gig, which is maybe 2 GB", "and the gig, so 5 attached to it"),
 * word numbers ("five", "two"), or standalone integers/decimals.
 */
export function extractGbFromRefundLine(lineWithoutPhone: string): number | null {
  let rem = lineWithoutPhone.trim();

  // Strip network names and label tokens that might distract number extraction
  rem = rem.replace(/\b(?:MTN|TELECEL|AIRTELTIGO|VODAFONE|AIRTEL|TIGO|AT|ATBT|BIGTIME|ISHARE)\b/gi, " ");

  // 1. Explicit pattern: number followed by gb/g/gig/gigs/gigabyte(s)
  const gbUnitMatch = rem.match(/(?:^|[^\d.])(\d+(?:[.,]\d+)?)\s*(?:gb|gbs|gig|gigs|gigabytes?|g)\b/i);
  if (gbUnitMatch) {
    const n = parseFloat(gbUnitMatch[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0 && n <= 1000) return n;
  }

  // 2. Word numbers followed by or near gig / gb / data / bundle / size / plus / so
  const wordUnitMatch = rem.match(
    /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|twentyfive|thirty|forty|fifty|hundred)\b/i
  );
  if (wordUnitMatch) {
    const word = wordUnitMatch[1].toLowerCase();
    if (WORD_TO_NUMBER[word] !== undefined) {
      // Check if context has gig, data, gb, plus, or similar
      if (rem.match(/(?:gig|gb|data|bundle|size|plus|attached|so|is)/i)) {
        return WORD_TO_NUMBER[word];
      }
    }
  }

  // 3. Conversational context: "gig, so 5", "plus 5", "gig is 2", "size 10"
  const contextMatch = rem.match(/(?:gig|plus|size|bundle|attached|so|is)[^0-9a-z]*(\d+(?:[.,]\d+)?)/i);
  if (contextMatch) {
    const n = parseFloat(contextMatch[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0 && n <= 1000) return n;
  }

  // 4. Standalone number in remainder (e.g. "0535308873 5", "0535308873, 2", "0535308873\t10")
  const standaloneMatch = rem.match(/(?:^|[^\d.])(\d+(?:[.,]\d+)?)(?=[^\d.]|$)/);
  if (standaloneMatch) {
    const n = parseFloat(standaloneMatch[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0 && n <= 1000) {
      return n;
    }
  }

  // 5. Standalone word number without context
  if (wordUnitMatch) {
    const word = wordUnitMatch[1].toLowerCase();
    if (WORD_TO_NUMBER[word] !== undefined) {
      return WORD_TO_NUMBER[word];
    }
  }

  return null;
}

/**
 * Splits raw pasted text into individual entry lines.
 * Handles:
 * - Line breaks (\n, \r\n)
 * - Comma/semicolon separation between distinct entries (e.g. "0535308873 2gb, 0241234567 5gb")
 * - Multi-line pairs where phone number is on one line and GB is on the next line:
 *   0535308873
 *   2gb
 */
export function splitRefundLines(text: string): string[] {
  if (!text) return [];

  // Normalize line breaks
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Split lines if comma/semicolon separates distinct entries that start with a phone number
  const splitInline = normalized.replace(/[,;]\s*(?=(?:\+?233|0)?[235]\d{8}\b)/g, "\n");

  const rawLines = splitInline
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const merged: string[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const phoneRes = extractPhoneFromRefundLine(line);
    const rem = phoneRes ? line.replace(phoneRes.rawMatch, " ") : line;
    const gb = extractGbFromRefundLine(rem);

    // Case 1: Line already has both phone and GB
    if (phoneRes && gb !== null) {
      merged.push(line);
      continue;
    }

    // Case 2: Line has phone, but NO GB. Check next line!
    if (phoneRes && gb === null && i + 1 < rawLines.length) {
      const nextLine = rawLines[i + 1];
      const nextPhoneRes = extractPhoneFromRefundLine(nextLine);
      const nextGb = extractGbFromRefundLine(nextLine);

      if (!nextPhoneRes && nextGb !== null) {
        merged.push(`${line} ${nextLine}`);
        i++; // skip next line as it was merged
        continue;
      }
    }

    // Case 3: Line has GB, but NO phone. Check next line!
    if (!phoneRes && gb !== null && i + 1 < rawLines.length) {
      const nextLine = rawLines[i + 1];
      const nextPhoneRes = extractPhoneFromRefundLine(nextLine);
      const nextRem = nextPhoneRes ? nextLine.replace(nextPhoneRes.rawMatch, " ") : nextLine;
      const nextGb = extractGbFromRefundLine(nextRem);

      if (nextPhoneRes && nextGb === null) {
        merged.push(`${nextLine} ${line}`);
        i++;
        continue;
      }
    }

    // Keep line as-is
    merged.push(line);
  }

  return merged;
}

/**
 * Parses full raw pasted refund text into an array of structured refund entries.
 */
export function parseRefundText(text: string): ParsedRefundEntry[] {
  const lines = splitRefundLines(text);
  const entries: ParsedRefundEntry[] = [];

  for (const line of lines) {
    const phoneRes = extractPhoneFromRefundLine(line);
    if (!phoneRes) continue;

    const rem = line.replace(phoneRes.rawMatch, " ");
    const gb = extractGbFromRefundLine(rem);
    if (gb === null) continue;

    const normalizedPhone = normalizeGhanaPhoneNumber(phoneRes.phone);

    entries.push({
      originalLine: line,
      phone: phoneRes.phone,
      normalizedPhone: normalizedPhone || phoneRes.phone,
      gbAmount: gb,
    });
  }

  return entries;
}
