export interface ParsedMomoTransaction {
  transactionReference: string;
  amount: number;
  currency: string;
  network: "MTN" | "TELECEL" | "AIRTELTIGO";
  senderPhone?: string | null;
  senderName?: string | null;
  recipientPhone?: string | null;
  balance?: number | null;
  transactionAt?: Date | null;
  transactionType?: string;
  isSuccessful: boolean;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

/**
 * Clean and normalize transaction ID / reference:
 * - uppercase alphanumeric
 * - strip surrounding punctuation
 */
export function normalizeTransactionReference(raw: string): string {
  return raw.trim().toUpperCase().replace(/^[:.\-#\s]+|[:.\-#\s]+$/g, "");
}

/**
 * Clean phone number if present:
 * E.g., "233241234567" -> "0241234567"
 */
export function normalizeSenderPhone(raw?: string | null): string | null {
  if (!raw) return null;
  let p = raw.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (p.startsWith("233") && p.length === 12) p = `0${p.slice(3)}`;
  if (p.length === 9 && !p.startsWith("0")) p = `0${p}`;
  return p;
}

/**
 * Helper to extract amount in GHS from text.
 * Matches:
 * "GHS 100.00", "GHS 100", "GHC 50.50", "GH¢ 20.00", "GHS100.00", etc.
 */
function extractAmount(text: string): number | null {
  const match = text.match(/(?:GHS|GH[¢C]|GHC)\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!match) return null;
  const num = parseFloat(match[1].replace(/,/g, ""));
  return isNaN(num) || num <= 0 ? null : num;
}

/**
 * Helper to extract transaction/reference ID.
 * Matches:
 * "Transaction ID: 1234567890", "Financial Transaction Id: 987654", "Trans ID: AT1234", "Txn ID: 5678"
 */
function extractTransactionId(text: string): string | null {
  const patterns = [
    /(?:Financial\s+Transaction\s+Id|Transaction\s+Id|Trans(?:action)?\s+ID|Txn\s+ID|Trans\.\s+ID|Reference\s+ID)\s*(?:[:.]|is)?\s*([A-Za-z0-9_-]+)/i,
    /(?:Ref(?:erence)?\s*(?:no|num|number)?\s*[:.-]\s*)([A-Za-z0-9_-]{5,})/i,
    /(?:Transaction\s*[:.-]\s*)([A-Za-z0-9_-]{6,})/i,
  ];

  for (const pat of patterns) {
    const m = text.match(pat);
    if (m && m[1]) {
      return normalizeTransactionReference(m[1]);
    }
  }
  return null;
}

/**
 * Check if the SMS is an outgoing debit / cash out rather than an incoming credit.
 */
export function isOutgoingTransaction(text: string): boolean {
  const outgoingPattern = /(?:Payment\s*(?:made|of)|Cash\s*Out|Cash-Out|You\s*have\s*paid|You\s*have\s*sent|transferred\s*to|Withdrawal|debited|Money\s*sent|Airtime\s*purchase)/i;
  const incomingPattern = /(?:Payment\s*received|Cash\s*In\s*received|Cash-In\s*received|You\s*have\s*received|deposit\s*received|deposit\s*of|received\s*for)/i;

  if (incomingPattern.test(text)) {
    return false;
  }
  return outgoingPattern.test(text);
}

/**
 * Helper to extract date and time from SMS text.
 */
export function extractDateTime(text: string): Date | null {
  // ISO or standard date: 2026-09-12 14:30(:00)?
  const isoMatch = text.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:[T\s]\d{1,2}:\d{2}(?::\d{2})?)?)/);
  if (isoMatch) {
    const d = new Date(isoMatch[1].replace(/\//g, "-"));
    if (!isNaN(d.getTime())) return d;
  }

  // DD/MM/YYYY or DD-MM-YYYY HH:MM(:SS)?
  const dmyMatch = text.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(?:at\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?)?/i);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const hour = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0;
    const minute = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
    const second = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
    const d = new Date(year, month, day, hour, minute, second);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

/**
 * Helper to extract recipient phone if available
 */
function extractRecipient(text: string): string | null {
  const toMatch = text.match(/(?:to|at)\s+([^\n\r.]+?)(?:\.\s+|Current|Available|Balance|Reference|Transaction|Fee|New\s+balance|$)/i);
  if (!toMatch) return null;
  const raw = toMatch[1].trim();
  const phoneMatch = raw.match(/([\d+]{9,14})/);
  return phoneMatch ? normalizeSenderPhone(phoneMatch[1]) : null;
}

/**
 * Helper to extract sender phone and/or name.
 * Matches:
 * "from 0241234567 - JOHN DOE"
 * "from 233241234567 (JOHN DOE)"
 * "from 0241234567"
 * "from JOHN DOE"
 */
function extractSender(text: string): { phone: string | null; name: string | null } {
  const fromMatch = text.match(/from\s+([^\n\r.]+?)(?:\.\s+|Current|Available|Balance|Reference|Transaction|Fee|New\s+balance|$)/i);
  if (!fromMatch) return { phone: null, name: null };

  const rawSender = fromMatch[1].trim();

  // Pattern: "0241234567 - NAME" or "233241234567 - NAME"
  const hyphenMatch = rawSender.match(/^([\d+]+)\s*[-–—]\s*(.+)$/);
  if (hyphenMatch) {
    return {
      phone: normalizeSenderPhone(hyphenMatch[1]),
      name: hyphenMatch[2].trim(),
    };
  }

  // Pattern: "0241234567 (NAME)"
  const parenMatch = rawSender.match(/^([\d+]+)\s*\((.+)\)$/);
  if (parenMatch) {
    return {
      phone: normalizeSenderPhone(parenMatch[1]),
      name: parenMatch[2].trim(),
    };
  }

  // Pure phone
  const phoneOnlyMatch = rawSender.match(/^([\d+]{9,14})$/);
  if (phoneOnlyMatch) {
    return {
      phone: normalizeSenderPhone(phoneOnlyMatch[1]),
      name: null,
    };
  }

  // Phone with name attached: "0241234567 NAME"
  const phonePrefixMatch = rawSender.match(/^([\d+]{9,14})\s+(.+)$/);
  if (phonePrefixMatch) {
    return {
      phone: normalizeSenderPhone(phonePrefixMatch[1]),
      name: phonePrefixMatch[2].trim(),
    };
  }

  return { phone: null, name: rawSender.length > 2 ? rawSender : null };
}

/**
 * MTN MoMo SMS parser
 */
export function parseMtnSms(rawSms: string): ParsedMomoTransaction | null {
  const isMtn = /MTN|MobileMoney|Cash\s*In\s*received|Payment\s*received\s*for|Financial\s*Transaction\s*Id|TRANSACTION\s*FEE/i.test(rawSms);
  const amount = extractAmount(rawSms);
  const txId = extractTransactionId(rawSms);

  if (!amount || !txId) return null;

  const sender = extractSender(rawSms);
  const recipientPhone = extractRecipient(rawSms);
  const transactionAt = extractDateTime(rawSms);
  const isDebit = isOutgoingTransaction(rawSms);

  let txType = "RECEIVED";
  if (isDebit) txType = "DEBIT";
  else if (/Cash\s*In/i.test(rawSms)) txType = "CASH_IN";
  else if (/Payment\s*received/i.test(rawSms)) txType = "PAYMENT";

  return {
    transactionReference: txId,
    amount,
    currency: "GHS",
    network: "MTN",
    senderPhone: sender.phone,
    senderName: sender.name,
    recipientPhone,
    transactionAt,
    transactionType: txType,
    isSuccessful: !isDebit,
    confidence: isDebit ? "LOW" : (isMtn ? "HIGH" : "MEDIUM"),
  };
}

/**
 * Telecel (Vodafone Cash) SMS parser
 */
export function parseTelecelSms(rawSms: string): ParsedMomoTransaction | null {
  const isTelecel = /Telecel|Vodafone|VF-Cash|TelecelCash/i.test(rawSms);
  const amount = extractAmount(rawSms);
  const txId = extractTransactionId(rawSms);

  if (!amount || !txId) return null;

  const sender = extractSender(rawSms);
  const recipientPhone = extractRecipient(rawSms);
  const transactionAt = extractDateTime(rawSms);
  const isDebit = isOutgoingTransaction(rawSms);

  let txType = "RECEIVED";
  if (isDebit) txType = "DEBIT";
  else if (/Cash\s*In/i.test(rawSms)) txType = "CASH_IN";
  else if (/Payment/i.test(rawSms)) txType = "PAYMENT";

  return {
    transactionReference: txId,
    amount,
    currency: "GHS",
    network: "TELECEL",
    senderPhone: sender.phone,
    senderName: sender.name,
    recipientPhone,
    transactionAt,
    transactionType: txType,
    isSuccessful: !isDebit,
    confidence: isDebit ? "LOW" : (isTelecel ? "HIGH" : "MEDIUM"),
  };
}

/**
 * AirtelTigo (AT Money) SMS parser
 */
export function parseAirtelTigoSms(rawSms: string): ParsedMomoTransaction | null {
  const isAT = /AirtelTigo|AT\s*Money|Airtel|Tigo/i.test(rawSms);
  const amount = extractAmount(rawSms);
  const txId = extractTransactionId(rawSms);

  if (!amount || !txId) return null;

  const sender = extractSender(rawSms);
  const recipientPhone = extractRecipient(rawSms);
  const transactionAt = extractDateTime(rawSms);
  const isDebit = isOutgoingTransaction(rawSms);

  let txType = "RECEIVED";
  if (isDebit) txType = "DEBIT";
  else if (/Cash\s*In/i.test(rawSms)) txType = "CASH_IN";
  else if (/Payment/i.test(rawSms)) txType = "PAYMENT";

  return {
    transactionReference: txId,
    amount,
    currency: "GHS",
    network: "AIRTELTIGO",
    senderPhone: sender.phone,
    senderName: sender.name,
    recipientPhone,
    transactionAt,
    transactionType: txType,
    isSuccessful: !isDebit,
    confidence: isDebit ? "LOW" : (isAT ? "HIGH" : "MEDIUM"),
  };
}

/**
 * Generic MoMo SMS parser fallback
 */
export function parseGenericMomoSms(rawSms: string, networkHint?: string): ParsedMomoTransaction | null {
  const amount = extractAmount(rawSms);
  const txId = extractTransactionId(rawSms);

  if (!amount || !txId) return null;

  // Infer network from text or hint
  let network: "MTN" | "TELECEL" | "AIRTELTIGO" = "MTN";
  if (networkHint && ["MTN", "TELECEL", "AIRTELTIGO"].includes(networkHint.toUpperCase())) {
    network = networkHint.toUpperCase() as "MTN" | "TELECEL" | "AIRTELTIGO";
  } else if (/Telecel|Vodafone|VF/i.test(rawSms)) {
    network = "TELECEL";
  } else if (/Airtel|Tigo|ATMoney|AT\s*Money/i.test(rawSms)) {
    network = "AIRTELTIGO";
  } else if (/MTN|MobileMoney/i.test(rawSms)) {
    network = "MTN";
  }

  const sender = extractSender(rawSms);
  const recipientPhone = extractRecipient(rawSms);
  const transactionAt = extractDateTime(rawSms);
  const isDebit = isOutgoingTransaction(rawSms);

  return {
    transactionReference: txId,
    amount,
    currency: "GHS",
    network,
    senderPhone: sender.phone,
    senderName: sender.name,
    recipientPhone,
    transactionAt,
    transactionType: isDebit ? "DEBIT" : "RECEIVED",
    isSuccessful: !isDebit,
    confidence: isDebit ? "LOW" : "MEDIUM",
  };
}

/**
 * Main parser entry point: tries specific network parsers first,
 * or detects the appropriate one, with generic fallback.
 */
export function parseMomoSms(
  rawSms: string,
  networkHint?: string
): ParsedMomoTransaction | null {
  if (!rawSms || typeof rawSms !== "string") return null;

  const text = rawSms.trim();
  if (text.length < 10) return null;

  const hint = networkHint?.toUpperCase();

  if (hint === "MTN") {
    const res = parseMtnSms(text);
    if (res) return res;
  } else if (hint === "TELECEL") {
    const res = parseTelecelSms(text);
    if (res) return res;
  } else if (hint === "AIRTELTIGO") {
    const res = parseAirtelTigoSms(text);
    if (res) return res;
  }

  // Network detection based on content
  if (/Telecel|Vodafone/i.test(text)) {
    const res = parseTelecelSms(text);
    if (res) return res;
  }
  if (/Airtel|Tigo/i.test(text)) {
    const res = parseAirtelTigoSms(text);
    if (res) return res;
  }
  if (/MTN|MobileMoney|Payment\s*received\s*for|Cash\s*In\s*received|TRANSACTION\s*FEE/i.test(text)) {
    const res = parseMtnSms(text);
    if (res) return res;
  }

  // Generic fallback
  return parseGenericMomoSms(text, networkHint);
}
