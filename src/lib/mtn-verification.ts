import { prisma } from "./prisma";
import { recordAudit } from "./audit";
import {
  normalizeGhanaPhoneNumber,
  normalizeGhanaPhone,
  isValidGhanaPhoneNumber,
  isMtnPhoneNumber,
  getNetworkFromGhanaPhone,
  MTN_PREFIXES,
  TELECEL_PREFIXES,
  AIRTELTIGO_PREFIXES,
  GHANA_PHONE_REGEX,
  MTN_PHONE_REGEX,
  detectNetworkNameByPrefix,
} from "./phone-utils";
import { consumeImportStagingSession } from "./mtn-staging";

export * from "./phone-utils";
export * from "./mtn-staging";


export const SETTING_MTN_VERIFICATION_ENABLED = "mtn_number_verification_enabled";
export const SETTING_MTN_VERIFICATION_INSTRUCTIONS = "mtn_verification_instructions";

// ---------------------------------------------------------------------------
// Settings Helpers
// ---------------------------------------------------------------------------

async function getSystemSetting(key: string, fallback = ""): Promise<string> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  return row?.value ?? fallback;
}

async function setSystemSetting(key: string, value: string): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function isMtnVerificationEnabled(): Promise<boolean> {
  const val = await getSystemSetting(SETTING_MTN_VERIFICATION_ENABLED, "false");
  return val === "true";
}

export async function setMtnVerificationEnabled(enabled: boolean): Promise<void> {
  await setSystemSetting(SETTING_MTN_VERIFICATION_ENABLED, enabled ? "true" : "false");
}

export async function getMtnVerificationInstructions(): Promise<string> {
  return getSystemSetting(
    SETTING_MTN_VERIFICATION_INSTRUCTIONS,
    "Submit your MTN number for verification before placing an MTN bundle order. Numbers are verified within 24-48 hours."
  );
}

export async function setMtnVerificationInstructions(text: string): Promise<void> {
  await setSystemSetting(SETTING_MTN_VERIFICATION_INSTRUCTIONS, text);
}

// ---------------------------------------------------------------------------
// Accepted MTN Numbers
// ---------------------------------------------------------------------------

export async function isMtnNumberAccepted(normalizedNumber: string): Promise<boolean> {
  const canonical = normalizeGhanaPhoneNumber(normalizedNumber);
  const row = await prisma.acceptedMtnNumber.findUnique({
    where: { normalizedNumber: canonical },
    select: { id: true },
  });
  return !!row;
}

export class MtnNumberNotVerifiedError extends Error {
  constructor(message = "This MTN number has not been verified yet. Please submit the number for verification before purchasing an MTN package.") {
    super(message);
    this.name = "MtnNumberNotVerifiedError";
  }
}

/**
 * Centrally validates a recipient number for an MTN order.
 * - If network is NOT MTN, returns { allowed: true } immediately.
 * - If network IS MTN:
 *   - Normalizes number
 *   - Checks if number is in Accepted MTN Numbers
 *   - If verification is ON:
 *     - If accepted: { allowed: true }
 *     - If not accepted: throws or returns { allowed: false, reason: ... }
 *   - If verification is OFF:
 *     - If accepted: { allowed: true }
 *     - If not accepted: records/updates in BlockedMtnNumber (unverified review list) and returns { allowed: true }
 */
export async function validateMtnOrderRecipient(
  phoneNumber: string,
  network: string,
  userId?: string | null,
  opts: { throwOnFailure?: boolean; recordUnverified?: boolean } = {}
): Promise<{ allowed: boolean; reason?: string }> {
  const net = network.toUpperCase();
  if (net !== "MTN") {
    return { allowed: true };
  }

  const normalized = normalizeGhanaPhoneNumber(phoneNumber);
  const verificationEnabled = await isMtnVerificationEnabled();
  let isAccepted = await isMtnNumberAccepted(normalized);
  if (verificationEnabled && !isAccepted) {
    const clickyfiedSetting = await prisma.systemSetting.findUnique({
      where: { key: "clickyfied_mtn_verification_enabled" },
    });
    if (clickyfiedSetting?.value === "true") {
      try {
        const { getProviderRoutingConfig } = await import("./provider-apis/router");
        const { ClickyfiedClient } = await import("./provider-apis/clickyfied");
        const config = await getProviderRoutingConfig();
        const client = new ClickyfiedClient(config.clickyfied);
        const res = await client.verifyNumbers([normalized]);
        const validNorms = new Set(res.validNumbers.map((n) => normalizeGhanaPhoneNumber(n)));
        if (validNorms.has(normalized)) {
          await addAcceptedMtnNumber(normalized, "CLICKYFIED_API", "Automated Verification API").catch(() => {});
          isAccepted = true;
        }
      } catch (err) {
        console.error("Clickyfied single number verification error:", err);
      }
    }
  }

  if (verificationEnabled && !isAccepted) {
    const reason =
      "This MTN number has not been verified yet. Please submit the number for verification before purchasing an MTN package.";
    if (opts.throwOnFailure) {
      throw new MtnNumberNotVerifiedError(reason);
    }
    return { allowed: false, reason };
  }

  if (!isAccepted && opts.recordUnverified !== false) {
    // Verification is OFF: allow the purchase, but record in Blocked/Unverified review list (§2, §13)
    await recordUnverifiedMtnNumber({
      number: normalized,
      userId: userId ?? null,
    });
  }

  return { allowed: true };
}

/**
 * Upserts a number into BlockedMtnNumber list (§13, §21) without creating duplicates.
 * Increments orderCount and updates lastSeenAt and lastUserId.
 */
export async function recordUnverifiedMtnNumber({
  number,
  userId,
}: {
  number: string;
  userId?: string | null;
}): Promise<void> {
  const canonical = normalizeGhanaPhoneNumber(number);
  const now = new Date();
  await prisma.blockedMtnNumber.upsert({
    where: { normalizedNumber: canonical },
    create: {
      number: canonical,
      normalizedNumber: canonical,
      firstSeenAt: now,
      lastSeenAt: now,
      firstUserId: userId ?? null,
      lastUserId: userId ?? null,
      orderCount: 1,
      status: "UNVERIFIED",
    },
    update: {
      lastSeenAt: now,
      lastUserId: userId ?? undefined,
      orderCount: { increment: 1 },
    },
  });
}

/**
 * Bulk upserts multiple numbers into BlockedMtnNumber list in batch,
 * avoiding connection pool exhaustion and slow sequential per-row roundtrips.
 */
export async function recordUnverifiedMtnNumbersBatch(
  items: Array<{ number: string; userId?: string | null }>
): Promise<void> {
  if (!items.length) return;
  const countMap = new Map<string, { number: string; userId?: string | null; count: number }>();
  for (const item of items) {
    const canonical = normalizeGhanaPhoneNumber(item.number);
    const existing = countMap.get(canonical);
    if (existing) {
      existing.count += 1;
      if (item.userId) existing.userId = item.userId;
    } else {
      countMap.set(canonical, { number: canonical, userId: item.userId, count: 1 });
    }
  }

  const now = new Date();
  const canonicalNumbers = Array.from(countMap.keys());
  const existingRows = await prisma.blockedMtnNumber.findMany({
    where: { normalizedNumber: { in: canonicalNumbers } },
    select: { id: true, normalizedNumber: true, orderCount: true },
  });
  const existingSet = new Map(existingRows.map((r) => [r.normalizedNumber, r]));

  const toCreate: Array<{
    number: string;
    normalizedNumber: string;
    firstSeenAt: Date;
    lastSeenAt: Date;
    firstUserId: string | null;
    lastUserId: string | null;
    orderCount: number;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }> = [];

  const updatePromises: Promise<unknown>[] = [];

  for (const [norm, data] of countMap) {
    const existing = existingSet.get(norm);
    if (existing) {
      updatePromises.push(
        prisma.blockedMtnNumber.update({
          where: { normalizedNumber: norm },
          data: {
            lastSeenAt: now,
            lastUserId: data.userId ?? undefined,
            orderCount: { increment: data.count },
          },
        })
      );
    } else {
      toCreate.push({
        number: data.number,
        normalizedNumber: norm,
        firstSeenAt: now,
        lastSeenAt: now,
        firstUserId: data.userId ?? null,
        lastUserId: data.userId ?? null,
        orderCount: data.count,
        status: "UNVERIFIED",
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  if (toCreate.length > 0) {
    await prisma.blockedMtnNumber.createMany({
      data: toCreate,
      skipDuplicates: true,
    });
  }

  if (updatePromises.length > 0) {
    await Promise.all(updatePromises);
  }
}

/**
 * Synchronizes pending requests and blocked entries when a number becomes accepted (§20).
 * Any corresponding verification request automatically becomes VERIFIED.
 * Any corresponding blocked entry becomes ACCEPTED.
 */
export async function syncAcceptedNumberStatus(
  canonicalNumber: string,
  verifiedBy?: string | null
): Promise<void> {
  const now = new Date();
  // 1. Update verification requests for this number
  await prisma.mtnVerificationRequest.updateMany({
    where: {
      normalizedNumber: canonicalNumber,
      status: { in: ["SUBMITTED", "PROCESSING"] },
    },
    data: {
      status: "VERIFIED",
      verifiedAt: now,
    },
  });

  // 2. Update blocked numbers for this number
  await prisma.blockedMtnNumber.updateMany({
    where: {
      normalizedNumber: canonicalNumber,
      status: { in: ["UNVERIFIED", "SUBMITTED", "PROCESSING"] },
    },
    data: {
      status: "ACCEPTED",
    },
  });
}

/**
 * Adds a single number to AcceptedMtnNumber list and syncs requests.
 */
export async function addAcceptedMtnNumber(
  number: string,
  source = "MANUAL",
  verifiedBy?: string | null,
  batchId?: string | null
) {
  const canonical = normalizeGhanaPhoneNumber(number);
  if (!isValidGhanaPhoneNumber(canonical)) {
    throw new Error(`Invalid Ghanaian phone number: ${number}`);
  }
  const isPorted = !isMtnPhoneNumber(canonical);
  const detectedNetwork = isPorted ? detectNetworkNameByPrefix(canonical) : "MTN";

  const existing = await prisma.acceptedMtnNumber.findUnique({
    where: { normalizedNumber: canonical },
  });
  if (existing) {
    return existing;
  }

  const record = await prisma.acceptedMtnNumber.create({
    data: {
      number: canonical,
      normalizedNumber: canonical,
      source,
      batchId: batchId ?? null,
      verifiedBy: verifiedBy ?? null,
      verifiedAt: new Date(),
    },
  });

  await syncAcceptedNumberStatus(canonical, verifiedBy);

  if (verifiedBy) {
    await recordAudit({
      actorLabel: verifiedBy,
      action: "ADMIN_ADDED_ACCEPTED_MTN_NUMBER",
      target: `mtn_accepted:${canonical}`,
      newValue: JSON.stringify({ number: canonical, source, isPorted, originalNetwork: detectedNetwork }),
    });
  }

  return record;
}

/**
 * Removes a number from AcceptedMtnNumber whitelist (§5, §20).
 */
export async function removeAcceptedMtnNumber(id: string, actorLabel = "Admin") {
  const record = await prisma.acceptedMtnNumber.findUnique({ where: { id } });
  if (!record) return;

  await prisma.acceptedMtnNumber.delete({ where: { id } });

  await recordAudit({
    actorLabel,
    action: "ADMIN_REMOVED_ACCEPTED_MTN_NUMBER",
    target: `mtn_accepted:${record.normalizedNumber}`,
    previousValue: JSON.stringify(record),
  });
}

/**
 * Bulk removes accepted MTN numbers.
 */
export async function bulkRemoveAcceptedMtnNumbers(ids: string[], actorLabel = "Admin") {
  const records = await prisma.acceptedMtnNumber.findMany({
    where: { id: { in: ids } },
    select: { id: true, normalizedNumber: true },
  });

  const res = await prisma.acceptedMtnNumber.deleteMany({
    where: { id: { in: ids } },
  });

  await recordAudit({
    actorLabel,
    action: "ADMIN_REMOVED_ACCEPTED_MTN_NUMBER",
    target: `bulk:${res.count}_numbers`,
    newValue: JSON.stringify({ count: res.count, numbers: records.map((r) => r.normalizedNumber) }),
  });

  return res.count;
}

// ---------------------------------------------------------------------------
// File Parsing for Import (TXT / CSV) (§3, §4, §30)
// ---------------------------------------------------------------------------

export interface FileParseResult {
  totalRows: number;
  validNumbers: string[];
  portedCount: number;
  portedNumbers: string[];
  samplePorted: { number: string; network: string }[];
  duplicateCount: number;
  duplicates: string[];
  alreadyAcceptedCount: number;
  alreadyAccepted: string[];
  invalidCount: number;
  invalid: { line: number; raw: string; reason: string }[];
}

/**
 * Parses TXT or CSV file content for MTN number imports.
 * Supports:
 *  - TXT: 1 phone number per line
 *  - CSV: column 'number', 'phone', 'phonenumber', 'msisdn', etc., or 1st column
 *  - Allows valid Ghanaian numbers ported to MTN (Telecel/AirtelTigo prefixes)
 */
export async function parseMtnNumbersFile(
  content: string,
  filename: string
): Promise<FileParseResult> {
  const isTxt = filename.toLowerCase().endsWith(".txt");
  const isCsv = filename.toLowerCase().endsWith(".csv") || (!isTxt && content.includes(","));

  const duplicateSet = new Set<string>();
  const invalidList: { line: number; raw: string; reason: string }[] = [];
  const normalizedValid: string[] = [];
  const portedSet = new Set<string>();
  const seenInFile = new Set<string>();
  let totalRows = 0;

  if (isCsv) {
    // For CSV, split lines once or scan
    const rawLines = content.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    if (rawLines.length > 0) {
      const firstLine = rawLines[0];
      const delimiter = firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";
      const headerTokens = firstLine.split(delimiter).map((t) => t.trim().replace(/^["']|["']$/g, ""));
      const cleanToken = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

      const KNOWN_HEADERS = new Set([
        "number",
        "phone",
        "phonenumber",
        "phoneno",
        "telephone",
        "telephonenumber",
        "mobile",
        "mobilenumber",
        "mobileno",
        "msisdn",
        "mtnnumber",
        "mtnno",
        "mtn",
        "recipient",
        "recipientnumber",
        "recipientphone",
        "contact",
        "cellphone",
        "customerphone",
      ]);

      let colIndex = headerTokens.findIndex((h) => KNOWN_HEADERS.has(cleanToken(h)));
      let startIndex = 0;

      if (colIndex !== -1) {
        startIndex = 1;
      } else {
        const row0Cols = firstLine.split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ""));
        const row0PhoneCol = row0Cols.findIndex((c) => isValidGhanaPhoneNumber(c) || isMtnPhoneNumber(c));

        if (row0PhoneCol !== -1) {
          colIndex = row0PhoneCol;
          startIndex = 0;
        } else if (rawLines.length > 1) {
          const row1Cols = rawLines[1].split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ""));
          const row1PhoneCol = row1Cols.findIndex((c) => isValidGhanaPhoneNumber(c) || isMtnPhoneNumber(c));
          if (row1PhoneCol !== -1) {
            colIndex = row1PhoneCol;
            startIndex = 1;
          } else {
            colIndex = 0;
            startIndex = 0;
          }
        } else {
          colIndex = 0;
          startIndex = 0;
        }
      }

      for (let i = startIndex; i < rawLines.length; i++) {
        const line = rawLines[i];
        if (!line || line.startsWith("#") || line.startsWith("//")) continue;
        const cols = line.split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ""));
        const raw = cols[colIndex] ?? cols[0] ?? "";
        if (!raw) continue;

        totalRows++;
        const lineNum = i + 1;
        const normalized = normalizeGhanaPhoneNumber(raw);

        if (!isValidGhanaPhoneNumber(normalized)) {
          invalidList.push({ line: lineNum, raw, reason: "Invalid Ghanaian phone number format" });
          continue;
        }
        if (!isMtnPhoneNumber(normalized)) {
          portedSet.add(normalized);
        }
        if (seenInFile.has(normalized)) {
          duplicateSet.add(normalized);
          continue;
        }
        seenInFile.add(normalized);
        normalizedValid.push(normalized);
      }
    }
  } else {
    // Ultra fast, memory-friendly text scanning for large TXT files
    let lineStart = 0;
    let lineNum = 0;
    const len = content.length;

    while (lineStart < len) {
      let lineEnd = content.indexOf("\n", lineStart);
      if (lineEnd === -1) lineEnd = len;

      lineNum++;
      let line = content.slice(lineStart, lineEnd).trim();
      lineStart = lineEnd + 1;

      if (!line || line.startsWith("#") || line.startsWith("//")) continue;

      // Strip comments only if comment characters are present
      const withoutComment = (line.includes("#") || line.includes("/"))
        ? line.replace(/(?:#|\/\/).*$/, "").trim()
        : line;
      if (!withoutComment) continue;

      let raw = withoutComment;
      if (raw.includes(",")) {
        raw = raw.split(",")[0].trim();
      } else if (raw.includes(";")) {
        raw = raw.split(";")[0].trim();
      }
      if (!raw) continue;

      totalRows++;
      const normalized = normalizeGhanaPhoneNumber(raw);

      if (!isValidGhanaPhoneNumber(normalized)) {
        invalidList.push({ line: lineNum, raw, reason: "Invalid Ghanaian phone number format" });
        continue;
      }

      if (!isMtnPhoneNumber(normalized)) {
        portedSet.add(normalized);
      }

      if (seenInFile.has(normalized)) {
        duplicateSet.add(normalized);
        continue;
      }
      seenInFile.add(normalized);
      normalizedValid.push(normalized);
    }
  }

  // Fast check for already accepted numbers
  const alreadyAcceptedSet = new Set<string>();
  const totalAcceptedInDb = await prisma.acceptedMtnNumber.count();

  if (totalAcceptedInDb < 300000) {
    const existing = await prisma.acceptedMtnNumber.findMany({
      select: { normalizedNumber: true },
    });
    for (const r of existing) {
      alreadyAcceptedSet.add(r.normalizedNumber);
    }
  } else {
    // For very large existing tables, query matching subsets in chunks
    const DB_CHUNK_SIZE = 5000;
    for (let i = 0; i < normalizedValid.length; i += DB_CHUNK_SIZE) {
      const slice = normalizedValid.slice(i, i + DB_CHUNK_SIZE);
      const existing = await prisma.acceptedMtnNumber.findMany({
        where: { normalizedNumber: { in: slice } },
        select: { normalizedNumber: true },
      });
      for (const r of existing) {
        alreadyAcceptedSet.add(r.normalizedNumber);
      }
    }
  }

  const validNumbersToImport = normalizedValid.filter((n) => !alreadyAcceptedSet.has(n));
  const alreadyAcceptedList = normalizedValid.filter((n) => alreadyAcceptedSet.has(n));
  const portedNumbersList = validNumbersToImport.filter((n) => portedSet.has(n));
  const samplePorted = portedNumbersList.slice(0, 10).map((num) => ({
    number: num,
    network: detectNetworkNameByPrefix(num),
  }));

  return {
    totalRows,
    validNumbers: validNumbersToImport,
    portedCount: portedNumbersList.length,
    portedNumbers: portedNumbersList,
    samplePorted,
    duplicateCount: duplicateSet.size,
    duplicates: Array.from(duplicateSet),
    alreadyAcceptedCount: alreadyAcceptedList.length,
    alreadyAccepted: alreadyAcceptedList,
    invalidCount: invalidList.length,
    invalid: invalidList,
  };
}

/**
 * High-performance bulk imports pre-validated MTN numbers into AcceptedMtnNumber.
 * Supports direct array of numbers or staged sessionId.
 * Uses PostgreSQL UNNEST batch insertion and instant set-based request/blocked updates.
 */
export async function bulkImportAcceptedMtnNumbers({
  numbers,
  sessionId,
  source,
  actorLabel,
  batchId,
}: {
  numbers?: string[];
  sessionId?: string;
  source: string;
  actorLabel: string;
  batchId?: string | null;
}): Promise<{ imported: number; portedCount: number; batchId?: string | null; batchReference?: string }> {
  let numbersToImport: string[] = [];

  if (sessionId) {
    const staged = await consumeImportStagingSession(sessionId);
    if (!staged || staged.length === 0) {
      throw new Error("Staging session expired or contained no valid numbers to import");
    }
    numbersToImport = staged;
  } else if (numbers) {
    numbersToImport = numbers;
  }

  if (numbersToImport.length === 0) {
    return { imported: 0, portedCount: 0, batchId: batchId ?? null };
  }

  const portedCount = numbersToImport.filter((n) => !isMtnPhoneNumber(n)).length;

  let totalImported = 0;
  const now = new Date();
  let effectiveBatchId = batchId;
  let batchRef = "";

  // Every imported group should have a batch/import record (§5)
  if (!effectiveBatchId && numbersToImport.length > 0) {
    batchRef = await generateBatchReference();
    const notes = portedCount > 0
      ? `Imported from ${source} (${portedCount.toLocaleString()} ported numbers accepted)`
      : `Imported from ${source}`;
    const batch = await prisma.mtnVerificationBatch.create({
      data: {
        batchReference: batchRef,
        status: "COMPLETED",
        createdBy: actorLabel,
        totalNumbers: numbersToImport.length,
        verifiedCount: numbersToImport.length,
        notes,
        completedAt: now,
      },
    });
    effectiveBatchId = batch.id;
  }

  // Fast bulk insertion using UNNEST in batches of 15,000
  const INGEST_CHUNK_SIZE = 15000;
  for (let i = 0; i < numbersToImport.length; i += INGEST_CHUNK_SIZE) {
    const chunk = numbersToImport.slice(i, i + INGEST_CHUNK_SIZE);
    const count = await prisma.$executeRaw`
      INSERT INTO "AcceptedMtnNumber" ("id", "number", "normalizedNumber", "source", "batchId", "verifiedAt", "verifiedBy", "createdAt", "updatedAt")
      SELECT
        gen_random_uuid()::text,
        val,
        val,
        ${source},
        ${effectiveBatchId ?? null},
        ${now},
        ${actorLabel},
        ${now},
        ${now}
      FROM unnest(${chunk}::text[]) AS val
      ON CONFLICT ("normalizedNumber") DO NOTHING;
    `;
    totalImported += count;
  }

  // Instant set-based status synchronization
  if (effectiveBatchId) {
    await prisma.$executeRaw`
      UPDATE "MtnVerificationRequest"
      SET "status" = 'VERIFIED', "verifiedAt" = ${now}, "updatedAt" = ${now}
      WHERE "status" IN ('SUBMITTED', 'PROCESSING')
        AND EXISTS (
          SELECT 1 FROM "AcceptedMtnNumber"
          WHERE "AcceptedMtnNumber"."batchId" = ${effectiveBatchId}
            AND "AcceptedMtnNumber"."normalizedNumber" = "MtnVerificationRequest"."normalizedNumber"
        );
    `;

    await prisma.$executeRaw`
      UPDATE "BlockedMtnNumber"
      SET "status" = 'ACCEPTED', "updatedAt" = ${now}
      WHERE "status" IN ('UNVERIFIED', 'SUBMITTED', 'PROCESSING')
        AND EXISTS (
          SELECT 1 FROM "AcceptedMtnNumber"
          WHERE "AcceptedMtnNumber"."batchId" = ${effectiveBatchId}
            AND "AcceptedMtnNumber"."normalizedNumber" = "BlockedMtnNumber"."normalizedNumber"
        );
    `;
  } else {
    const SYNC_CHUNK_SIZE = 25000;
    for (let i = 0; i < numbersToImport.length; i += SYNC_CHUNK_SIZE) {
      const chunk = numbersToImport.slice(i, i + SYNC_CHUNK_SIZE);
      await prisma.$executeRaw`
        UPDATE "MtnVerificationRequest"
        SET "status" = 'VERIFIED', "verifiedAt" = ${now}, "updatedAt" = ${now}
        WHERE "status" IN ('SUBMITTED', 'PROCESSING')
          AND "normalizedNumber" = ANY(${chunk}::text[]);
      `;
      await prisma.$executeRaw`
        UPDATE "BlockedMtnNumber"
        SET "status" = 'ACCEPTED', "updatedAt" = ${now}
        WHERE "status" IN ('UNVERIFIED', 'SUBMITTED', 'PROCESSING')
          AND "normalizedNumber" = ANY(${chunk}::text[]);
      `;
    }
  }

  await recordAudit({
    actorLabel,
    action: "ADMIN_IMPORTED_MTN_NUMBERS",
    target: `accepted_mtn_import:${source}`,
    newValue: JSON.stringify({ count: totalImported, portedCount, source, batchId: effectiveBatchId, batchReference: batchRef }),
  });

  return { imported: totalImported, portedCount, batchId: effectiveBatchId ?? null, batchReference: batchRef };
}


// ---------------------------------------------------------------------------
// Verification Requests (§6, §7, §8, §27)
// ---------------------------------------------------------------------------

export interface SubmitVerificationResult {
  status: "VERIFIED" | "SUBMITTED" | "ALREADY_PENDING";
  message: string;
  request?: any;
}

/**
 * Handles user submission of an MTN number for verification (§6, §7, §27).
 * - Validates Ghanaian format & MTN prefix
 * - If already in Accepted MTN Numbers: returns status: "VERIFIED"
 * - If active request exists (SUBMITTED/PROCESSING): returns status: "ALREADY_PENDING"
 * - If previously REJECTED: creates new request
 * - Otherwise: creates SUBMITTED request
 */
export async function submitVerificationRequest(
  userId: string,
  rawNumber: string,
  userEmail?: string
): Promise<SubmitVerificationResult> {
  const normalized = normalizeGhanaPhoneNumber(rawNumber);

  if (!isValidGhanaPhoneNumber(normalized)) {
    throw new Error("Enter a valid Ghanaian phone number (e.g. 0241234567)");
  }

  if (!isMtnPhoneNumber(normalized)) {
    throw new Error("Only MTN numbers can be submitted for MTN verification (prefixes 024, 025, 053, 054, 055, 059)");
  }

  // 1. Check if already in Accepted MTN Numbers
  const isAccepted = await isMtnNumberAccepted(normalized);
  if (isAccepted) {
    return {
      status: "VERIFIED",
      message: "This number is already verified",
    };
  }

  // 2. Check if this user (or anyone) already has an active request (§27)
  const existingActive = await prisma.mtnVerificationRequest.findFirst({
    where: {
      normalizedNumber: normalized,
      status: { in: ["SUBMITTED", "PROCESSING"] },
    },
  });

  if (existingActive) {
    return {
      status: "ALREADY_PENDING",
      message: "This number already has a pending verification request in progress.",
      request: existingActive,
    };
  }

  // 3. Create verification request
  const request = await prisma.mtnVerificationRequest.create({
    data: {
      userId,
      number: normalized,
      normalizedNumber: normalized,
      status: "SUBMITTED",
      submittedAt: new Date(),
    },
  });

  // If number was in BlockedMtnNumber, update status to SUBMITTED
  await prisma.blockedMtnNumber.updateMany({
    where: { normalizedNumber: normalized, status: "UNVERIFIED" },
    data: { status: "SUBMITTED" },
  });

  await recordAudit({
    userId,
    actorLabel: userEmail ?? "User",
    action: "USER_SUBMITTED_MTN_VERIFICATION",
    target: `mtn_request:${normalized}`,
    newValue: JSON.stringify({ requestId: request.id, number: normalized }),
  });

  return {
    status: "SUBMITTED",
    message: "Number submitted successfully for verification",
    request,
  };
}

// ---------------------------------------------------------------------------
// Verification Batches (§9, §10, §11, §12)
// ---------------------------------------------------------------------------

export async function generateBatchReference(): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const prefix = `MTN-VERIFIED-${year}${month}${day}-`;

  const latest = await prisma.mtnVerificationBatch.findFirst({
    where: { batchReference: { startsWith: prefix } },
    orderBy: { batchReference: "desc" },
    select: { batchReference: true },
  });

  let nextSeq = 1;
  if (latest?.batchReference) {
    const parts = latest.batchReference.split("-");
    const lastPart = parts[parts.length - 1];
    const parsed = parseInt(lastPart, 10);
    if (!isNaN(parsed)) {
      nextSeq = parsed + 1;
    }
  }

  let candidate = `${prefix}${String(nextSeq).padStart(3, "0")}`;
  while (await prisma.mtnVerificationBatch.findUnique({ where: { batchReference: candidate } })) {
    nextSeq++;
    candidate = `${prefix}${String(nextSeq).padStart(3, "0")}`;
  }

  return candidate;
}

/**
 * Creates a verification batch from selected MtnVerificationRequest IDs (§9).
 */
export async function createVerificationBatch({
  requestIds,
  actorLabel = "Admin",
}: {
  requestIds: string[];
  actorLabel?: string;
}) {
  if (!requestIds.length) {
    throw new Error("Select at least one number to create a batch");
  }

  const requests = await prisma.mtnVerificationRequest.findMany({
    where: { id: { in: requestIds } },
  });

  if (!requests.length) {
    throw new Error("No matching verification requests found");
  }

  const batchRef = await generateBatchReference();

  const batch = await prisma.mtnVerificationBatch.create({
    data: {
      batchReference: batchRef,
      status: "READY",
      createdBy: actorLabel,
      totalNumbers: requests.length,
    },
  });

  // Create batch number items
  await prisma.mtnVerificationBatchNumber.createMany({
    data: requests.map((r) => ({
      batchId: batch.id,
      verificationRequestId: r.id,
      number: r.normalizedNumber,
      normalizedNumber: r.normalizedNumber,
      status: "READY",
    })),
  });

  // Link requests to batch and update status to PROCESSING
  await prisma.mtnVerificationRequest.updateMany({
    where: { id: { in: requestIds } },
    data: {
      batchId: batch.id,
      status: "PROCESSING",
      processedAt: new Date(),
    },
  });

  // Update corresponding blocked numbers to PROCESSING
  const numbers = requests.map((r) => r.normalizedNumber);
  await prisma.blockedMtnNumber.updateMany({
    where: { normalizedNumber: { in: numbers } },
    data: { status: "PROCESSING" },
  });

  await recordAudit({
    actorLabel,
    action: "ADMIN_CREATED_MTN_VERIFICATION_BATCH",
    target: `batch:${batchRef}`,
    newValue: JSON.stringify({ batchId: batch.id, count: requests.length }),
  });

  return batch;
}

/**
 * Exports a batch as TXT or CSV for submission to the MTN portal (§10).
 * Does not automatically mark as verified!
 */
export async function exportVerificationBatch(
  batchId: string,
  format: "txt" | "csv",
  actorLabel = "Admin"
): Promise<{ content: string; filename: string; mimeType: string }> {
  const batch = await prisma.mtnVerificationBatch.findUnique({
    where: { id: batchId },
    include: {
      numbers: { orderBy: { number: "asc" } },
    },
  });

  if (!batch) {
    throw new Error("Batch not found");
  }

  const numbers = batch.numbers.map((n) => n.number);

  let content = "";
  let filename = "";
  let mimeType = "";

  if (format === "csv") {
    content = "number\n" + numbers.join("\n");
    filename = `${batch.batchReference}.csv`;
    mimeType = "text/csv";
  } else {
    content = numbers.join("\n");
    filename = `${batch.batchReference}.txt`;
    mimeType = "text/plain";
  }

  // Update batch exportedAt and status to EXPORTED if currently READY
  await prisma.mtnVerificationBatch.update({
    where: { id: batchId },
    data: {
      exportedAt: new Date(),
      status: batch.status === "READY" ? "EXPORTED" : batch.status,
    },
  });

  await recordAudit({
    actorLabel,
    action: "ADMIN_EXPORTED_MTN_BATCH",
    target: `batch:${batch.batchReference}`,
    newValue: JSON.stringify({ format, count: numbers.length }),
  });

  return { content, filename, mimeType };
}

/**
 * Completes a verification batch with either FULL or PARTIAL results, or REJECTS batch (§11, §12).
 * Mode:
 *  - "ALL": all numbers in batch are verified
 *  - "SELECTED": selected numbers are verified, remainder are rejected
 *  - "REJECT": all numbers in batch are rejected
 */
export async function completeBatchVerification({
  batchId,
  mode,
  verifiedNumberIds,
  rejectionReason = "Verification rejected by MTN portal",
  actorLabel = "Admin",
}: {
  batchId: string;
  mode: "ALL" | "SELECTED" | "REJECT";
  verifiedNumberIds?: string[];
  rejectionReason?: string;
  actorLabel?: string;
}) {
  const batch = await prisma.mtnVerificationBatch.findUnique({
    where: { id: batchId },
    include: { numbers: true },
  });

  if (!batch) {
    throw new Error("Batch not found");
  }

  const now = new Date();
  const allBatchNumbers = batch.numbers;

  let verifiedNumbers: typeof allBatchNumbers = [];
  let rejectedNumbers: typeof allBatchNumbers = [];

  if (mode === "ALL") {
    verifiedNumbers = allBatchNumbers;
    rejectedNumbers = [];
  } else if (mode === "REJECT") {
    verifiedNumbers = [];
    rejectedNumbers = allBatchNumbers;
  } else {
    const verifiedSet = new Set(verifiedNumberIds ?? []);
    verifiedNumbers = allBatchNumbers.filter(
      (n) => verifiedSet.has(n.id) || verifiedSet.has(n.number) || verifiedSet.has(n.normalizedNumber)
    );
    rejectedNumbers = allBatchNumbers.filter(
      (n) => !verifiedSet.has(n.id) && !verifiedSet.has(n.number) && !verifiedSet.has(n.normalizedNumber)
    );
  }

  // 1. Update batch numbers status
  if (verifiedNumbers.length > 0) {
    await prisma.mtnVerificationBatchNumber.updateMany({
      where: { id: { in: verifiedNumbers.map((n) => n.id) } },
      data: { status: "VERIFIED" },
    });

    // Insert verified numbers into AcceptedMtnNumber
    const acceptedData = verifiedNumbers.map((n) => ({
      number: n.normalizedNumber,
      normalizedNumber: n.normalizedNumber,
      source: "BATCH_VERIFICATION",
      batchId: batch.id,
      verifiedBy: actorLabel,
      verifiedAt: now,
    }));

    await prisma.acceptedMtnNumber.createMany({
      data: acceptedData,
      skipDuplicates: true,
    });

    // Update corresponding MtnVerificationRequests to VERIFIED
    const verifiedRequestIds = verifiedNumbers
      .map((n) => n.verificationRequestId)
      .filter((id): id is string => !!id);

    if (verifiedRequestIds.length > 0) {
      await prisma.mtnVerificationRequest.updateMany({
        where: { id: { in: verifiedRequestIds } },
        data: {
          status: "VERIFIED",
          verifiedAt: now,
        },
      });
    }

    // Update corresponding blocked numbers to ACCEPTED
    const verifiedPhoneList = verifiedNumbers.map((n) => n.normalizedNumber);
    await prisma.blockedMtnNumber.updateMany({
      where: { normalizedNumber: { in: verifiedPhoneList } },
      data: { status: "ACCEPTED" },
    });
  }

  if (rejectedNumbers.length > 0) {
    await prisma.mtnVerificationBatchNumber.updateMany({
      where: { id: { in: rejectedNumbers.map((n) => n.id) } },
      data: {
        status: "REJECTED",
        rejectionReason,
      },
    });

    const rejectedRequestIds = rejectedNumbers
      .map((n) => n.verificationRequestId)
      .filter((id): id is string => !!id);

    if (rejectedRequestIds.length > 0) {
      await prisma.mtnVerificationRequest.updateMany({
        where: { id: { in: rejectedRequestIds } },
        data: {
          status: "REJECTED",
          rejectedAt: now,
          rejectionReason,
        },
      });
    }

    const rejectedPhoneList = rejectedNumbers.map((n) => n.normalizedNumber);
    await prisma.blockedMtnNumber.updateMany({
      where: { normalizedNumber: { in: rejectedPhoneList } },
      data: { status: "REJECTED" },
    });
  }

  // Update batch overall status
  let batchStatus = "COMPLETED";
  if (mode === "REJECT") {
    batchStatus = "REJECTED";
  } else if (rejectedNumbers.length > 0 && verifiedNumbers.length > 0) {
    batchStatus = "PARTIALLY_VERIFIED";
  }

  await prisma.mtnVerificationBatch.update({
    where: { id: batch.id },
    data: {
      status: batchStatus,
      completedAt: now,
      verifiedCount: verifiedNumbers.length,
      rejectedCount: rejectedNumbers.length,
    },
  });

  await recordAudit({
    actorLabel,
    action: mode === "REJECT" ? "ADMIN_REJECTED_MTN_BATCH" : "ADMIN_VERIFIED_MTN_BATCH",
    target: `batch:${batch.batchReference}`,
    newValue: JSON.stringify({
      mode,
      verifiedCount: verifiedNumbers.length,
      rejectedCount: rejectedNumbers.length,
      total: allBatchNumbers.length,
    }),
  });

  return {
    verifiedCount: verifiedNumbers.length,
    rejectedCount: rejectedNumbers.length,
    batchReference: batch.batchReference,
  };
}

// ---------------------------------------------------------------------------
// Blocked / Unverified MTN Numbers (§13, §14)
// ---------------------------------------------------------------------------

/**
 * Promotes a blocked/unverified number directly to Accepted MTN Numbers (§14).
 */
export async function promoteBlockedToAccepted(blockedId: string, actorLabel = "Admin") {
  const blocked = await prisma.blockedMtnNumber.findUnique({ where: { id: blockedId } });
  if (!blocked) throw new Error("Blocked number record not found");

  const accepted = await addAcceptedMtnNumber(
    blocked.normalizedNumber,
    "BLOCKED_NUMBER_PROMOTION",
    actorLabel
  );

  await prisma.blockedMtnNumber.update({
    where: { id: blockedId },
    data: { status: "ACCEPTED" },
  });

  return accepted;
}

/**
 * Submits a blocked number for verification request.
 */
export async function submitBlockedForVerification(blockedId: string, actorLabel = "Admin") {
  const blocked = await prisma.blockedMtnNumber.findUnique({ where: { id: blockedId } });
  if (!blocked) throw new Error("Blocked number record not found");

  // Create verification request on behalf of the user who first or last ordered
  const userId = blocked.lastUserId ?? blocked.firstUserId;
  if (!userId) {
    // Find admin or any system user if none
    const adminUser = await prisma.user.findFirst({ where: { role: "ADMIN" } });
    if (!adminUser) throw new Error("No user found to associate verification request");
    return submitVerificationRequest(adminUser.id, blocked.normalizedNumber, actorLabel);
  }

  return submitVerificationRequest(userId, blocked.normalizedNumber, actorLabel);
}

// ---------------------------------------------------------------------------
// MTN Verification Statistics (§8, §24)
// ---------------------------------------------------------------------------

export async function getMtnVerificationStats() {
  const [accepted, pending, processing, verified, rejected, blocked] = await Promise.all([
    prisma.acceptedMtnNumber.count(),
    prisma.mtnVerificationRequest.count({ where: { status: "SUBMITTED" } }),
    prisma.mtnVerificationRequest.count({ where: { status: "PROCESSING" } }),
    prisma.mtnVerificationRequest.count({ where: { status: "VERIFIED" } }),
    prisma.mtnVerificationRequest.count({ where: { status: "REJECTED" } }),
    prisma.blockedMtnNumber.count(),
  ]);

  return {
    accepted,
    pending,
    processing,
    verified,
    rejected,
    blocked,
  };
}

/**
 * Creates a verification batch from selected BlockedMtnNumber IDs (§14, §25).
 * Ensures an MtnVerificationRequest exists for each blocked number,
 * then groups them into a new MtnVerificationBatch.
 */
export async function createBatchFromBlockedNumbers({
  blockedIds,
  actorLabel = "Admin",
}: {
  blockedIds: string[];
  actorLabel?: string;
}) {
  if (!blockedIds.length) {
    throw new Error("Select at least one blocked number to create a batch");
  }

  const blockedRows = await prisma.blockedMtnNumber.findMany({
    where: { id: { in: blockedIds } },
  });

  if (!blockedRows.length) {
    throw new Error("No matching blocked numbers found");
  }

  const requestIds: string[] = [];
  const now = new Date();

  const adminUser = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!adminUser) throw new Error("No admin user found to associate verification requests");

  for (const row of blockedRows) {
    let req = await prisma.mtnVerificationRequest.findFirst({
      where: {
        normalizedNumber: row.normalizedNumber,
        status: { in: ["SUBMITTED", "PROCESSING"] },
      },
    });

    if (!req) {
      req = await prisma.mtnVerificationRequest.create({
        data: {
          userId: row.lastUserId ?? row.firstUserId ?? adminUser.id,
          number: row.normalizedNumber,
          normalizedNumber: row.normalizedNumber,
          status: "SUBMITTED",
          submittedAt: now,
        },
      });
    }
    requestIds.push(req.id);
  }

  return createVerificationBatch({
    requestIds,
    actorLabel,
  });
}

/**
 * Retrieves comprehensive details for a single MTN number across whitelist,
 * requests, batches, and blocked records (§5, §8, §29).
 */
export async function getMtnNumberDetails(rawNumber: string) {
  const canonical = normalizeGhanaPhoneNumber(rawNumber);
  const [accepted, requests, blocked] = await Promise.all([
    prisma.acceptedMtnNumber.findUnique({
      where: { normalizedNumber: canonical },
      include: {
        batch: { select: { id: true, batchReference: true, createdAt: true, status: true } },
      },
    }),
    prisma.mtnVerificationRequest.findMany({
      where: { normalizedNumber: canonical },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        batch: { select: { id: true, batchReference: true, status: true } },
      },
    }),
    prisma.blockedMtnNumber.findUnique({
      where: { normalizedNumber: canonical },
    }),
  ]);

  let user = null;
  if (blocked && (blocked.lastUserId || blocked.firstUserId)) {
    const uId = blocked.lastUserId || blocked.firstUserId;
    if (uId) {
      user = await prisma.user.findUnique({
        where: { id: uId },
        select: { id: true, name: true, email: true },
      });
    }
  }

  return {
    number: canonical,
    network: isMtnPhoneNumber(canonical) ? "MTN" : getNetworkFromGhanaPhone(canonical) || "OTHER",
    isMtn: isMtnPhoneNumber(canonical),
    accepted,
    requests,
    blocked: blocked ? { ...blocked, user } : null,
  };
}

