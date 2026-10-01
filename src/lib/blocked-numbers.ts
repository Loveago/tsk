import { prisma } from "./prisma";
import { normalizeGhanaPhoneNumber, isValidGhanaPhoneNumber } from "./phone-utils";
import { recordAudit } from "./audit";

/**
 * Checks whether a given phone number is blocked from purchasing on the system.
 */
export async function isPhoneNumberBlocked(phoneNumber: string): Promise<boolean> {
  if (!phoneNumber) return false;
  const canonical = normalizeGhanaPhoneNumber(phoneNumber);
  if (!canonical) return false;

  const found = await prisma.blockedNumber.findUnique({
    where: { normalizedNumber: canonical },
    select: { id: true },
  });

  return Boolean(found);
}

/**
 * Gets the blocked number record if it exists.
 */
export async function getBlockedNumberRecord(phoneNumber: string) {
  if (!phoneNumber) return null;
  const canonical = normalizeGhanaPhoneNumber(phoneNumber);
  if (!canonical) return null;

  return prisma.blockedNumber.findUnique({
    where: { normalizedNumber: canonical },
  });
}

/**
 * Adds a single phone number to the blocked list.
 */
export async function addBlockedNumber(
  phoneNumber: string,
  reason?: string,
  actorLabel = "Admin"
) {
  const canonical = normalizeGhanaPhoneNumber(phoneNumber);
  if (!canonical || !isValidGhanaPhoneNumber(canonical)) {
    throw new Error(`Invalid Ghanaian phone number: ${phoneNumber}`);
  }

  const existing = await prisma.blockedNumber.findUnique({
    where: { normalizedNumber: canonical },
  });

  if (existing) {
    if (reason && reason !== existing.reason) {
      const updated = await prisma.blockedNumber.update({
        where: { id: existing.id },
        data: { reason, blockedBy: actorLabel },
      });
      return updated;
    }
    return existing;
  }

  const record = await prisma.blockedNumber.create({
    data: {
      number: phoneNumber.trim(),
      normalizedNumber: canonical,
      reason: reason?.trim() || "Blocked by administrator",
      blockedBy: actorLabel,
    },
  });

  await recordAudit({
    actorLabel,
    action: "ADMIN_ADDED_BLOCKED_NUMBER",
    target: `blocked_number:${canonical}`,
    newValue: JSON.stringify({ number: canonical, reason }),
  });

  return record;
}

/**
 * Bulk adds multiple phone numbers to the blocked list.
 */
export async function bulkAddBlockedNumbers(
  phoneNumbers: string[],
  reason?: string,
  actorLabel = "Admin"
): Promise<{ added: number; skipped: number; totalProcessed: number }> {
  const defaultReason = reason?.trim() || "Blocked by administrator";
  const validMap = new Map<string, string>(); // canonical -> original

  for (const raw of phoneNumbers) {
    const trimmed = String(raw || "").trim();
    if (!trimmed) continue;
    const canonical = normalizeGhanaPhoneNumber(trimmed);
    if (canonical && isValidGhanaPhoneNumber(canonical)) {
      if (!validMap.has(canonical)) {
        validMap.set(canonical, trimmed);
      }
    }
  }

  if (validMap.size === 0) {
    return { added: 0, skipped: 0, totalProcessed: 0 };
  }

  const canonicals = Array.from(validMap.keys());
  const existingRecords = await prisma.blockedNumber.findMany({
    where: { normalizedNumber: { in: canonicals } },
    select: { normalizedNumber: true },
  });
  const existingSet = new Set(existingRecords.map((r) => r.normalizedNumber));

  const toInsert = canonicals
    .filter((num) => !existingSet.has(num))
    .map((num) => ({
      number: validMap.get(num) ?? num,
      normalizedNumber: num,
      reason: defaultReason,
      blockedBy: actorLabel,
    }));

  if (toInsert.length > 0) {
    await prisma.blockedNumber.createMany({
      data: toInsert,
      skipDuplicates: true,
    });

    await recordAudit({
      actorLabel,
      action: "ADMIN_BULK_ADDED_BLOCKED_NUMBERS",
      target: `bulk:${toInsert.length}_blocked_numbers`,
      newValue: JSON.stringify({ count: toInsert.length, reason: defaultReason }),
    });
  }

  return {
    added: toInsert.length,
    skipped: canonicals.length - toInsert.length,
    totalProcessed: canonicals.length,
  };
}

/**
 * Removes a single number from the blocked list.
 */
export async function removeBlockedNumber(id: string, actorLabel = "Admin"): Promise<void> {
  const existing = await prisma.blockedNumber.findUnique({ where: { id } });
  if (!existing) return;

  await prisma.blockedNumber.delete({ where: { id } });

  await recordAudit({
    actorLabel,
    action: "ADMIN_REMOVED_BLOCKED_NUMBER",
    target: `blocked_number:${existing.normalizedNumber}`,
    previousValue: JSON.stringify(existing),
  });
}

/**
 * Bulk removes numbers from the blocked list by ID.
 */
export async function bulkRemoveBlockedNumbers(ids: string[], actorLabel = "Admin"): Promise<number> {
  const existing = await prisma.blockedNumber.findMany({
    where: { id: { in: ids } },
    select: { id: true, normalizedNumber: true },
  });

  const res = await prisma.blockedNumber.deleteMany({
    where: { id: { in: ids } },
  });

  await recordAudit({
    actorLabel,
    action: "ADMIN_BULK_REMOVED_BLOCKED_NUMBERS",
    target: `bulk:${res.count}_blocked_numbers`,
    newValue: JSON.stringify({ count: res.count, ids }),
  });

  return res.count;
}

/**
 * Clears all numbers from the blocked list.
 */
export async function clearAllBlockedNumbers(actorLabel = "Admin"): Promise<number> {
  const count = await prisma.blockedNumber.count();
  await prisma.blockedNumber.deleteMany({});

  await recordAudit({
    actorLabel,
    action: "ADMIN_CLEARED_ALL_BLOCKED_NUMBERS",
    target: "all_blocked_numbers",
    newValue: JSON.stringify({ countDeleted: count }),
  });

  return count;
}
