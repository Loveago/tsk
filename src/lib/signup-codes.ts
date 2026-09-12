import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";

export type SignupCodeMode = "DISABLED" | "OPTIONAL" | "REQUIRED";

export function normalizeSignupCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * Retrieve global signup code mode: DISABLED | OPTIONAL | REQUIRED
 */
export async function getSignupCodeMode(): Promise<SignupCodeMode> {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: "signup_code_mode" },
  });
  if (setting?.value && ["DISABLED", "OPTIONAL", "REQUIRED"].includes(setting.value)) {
    return setting.value as SignupCodeMode;
  }
  return "OPTIONAL";
}

/**
 * Set global signup code mode
 */
export async function setSignupCodeMode(mode: SignupCodeMode): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: "signup_code_mode" },
    update: { value: mode },
    create: { key: "signup_code_mode", value: mode },
  });
}

/**
 * Validate signup code safely (server-side).
 * Do not leak whether code exists or why it failed.
 */
export async function validateSignupCode(rawCode: string): Promise<{
  valid: boolean;
  message?: string;
  codeId?: string;
  code?: string;
}> {
  const normalized = normalizeSignupCode(rawCode);
  if (!normalized) {
    return { valid: false, message: "Signup code is required" };
  }

  const record = await prisma.signupCode.findUnique({
    where: { code: normalized },
  });

  if (!record) {
    return { valid: false, message: "Invalid or expired signup code" };
  }

  const now = new Date();

  // Check expiration
  if (record.expiresAt && record.expiresAt < now) {
    if (record.status !== "EXPIRED") {
      await prisma.signupCode.update({
        where: { id: record.id },
        data: { status: "EXPIRED" },
      });
    }
    return { valid: false, message: "Invalid or expired signup code" };
  }

  // Check usage limit
  if (record.maxUses !== null && record.usageCount >= record.maxUses) {
    if (record.status !== "EXHAUSTED") {
      await prisma.signupCode.update({
        where: { id: record.id },
        data: { status: "EXHAUSTED" },
      });
    }
    return { valid: false, message: "Invalid or expired signup code" };
  }

  if (record.status !== "ACTIVE") {
    return { valid: false, message: "Invalid or expired signup code" };
  }

  return { valid: true, codeId: record.id, code: record.code };
}

/**
 * Atomically claim and register usage of a signup code during user registration.
 * Must run inside the registration's Prisma transaction.
 */
export async function applySignupCodeInTx(
  tx: Prisma.TransactionClient,
  input: {
    rawCode: string;
    userId: string;
    ip?: string | null;
    userAgent?: string | null;
  }
): Promise<{ signupCodeId: string; code: string }> {
  const normalized = normalizeSignupCode(input.rawCode);
  const now = new Date();

  const codeRecord = await tx.signupCode.findUnique({
    where: { code: normalized },
  });

  if (!codeRecord || codeRecord.status !== "ACTIVE") {
    throw new Error("Invalid or expired signup code");
  }

  if (codeRecord.expiresAt && codeRecord.expiresAt < now) {
    await tx.signupCode.update({
      where: { id: codeRecord.id },
      data: { status: "EXPIRED" },
    });
    throw new Error("Invalid or expired signup code");
  }

  if (codeRecord.maxUses !== null && codeRecord.usageCount >= codeRecord.maxUses) {
    await tx.signupCode.update({
      where: { id: codeRecord.id },
      data: { status: "EXHAUSTED" },
    });
    throw new Error("Invalid or expired signup code");
  }

  // Atomically increment usage with concurrency guard
  const updated = await tx.signupCode.updateMany({
    where: {
      id: codeRecord.id,
      status: "ACTIVE",
      ...(codeRecord.maxUses !== null ? { usageCount: { lt: codeRecord.maxUses } } : {}),
    },
    data: {
      usageCount: { increment: 1 },
    },
  });

  if (updated.count === 0) {
    throw new Error("Invalid or expired signup code");
  }

  // Check if now exhausted
  const refreshed = await tx.signupCode.findUnique({
    where: { id: codeRecord.id },
  });
  if (refreshed && refreshed.maxUses !== null && refreshed.usageCount >= refreshed.maxUses) {
    await tx.signupCode.update({
      where: { id: codeRecord.id },
      data: { status: "EXHAUSTED" },
    });
  }

  // Create usage record
  await tx.signupCodeUsage.create({
    data: {
      signupCodeId: codeRecord.id,
      userId: input.userId,
      ipAddress: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    },
  });

  return { signupCodeId: codeRecord.id, code: codeRecord.code };
}

/**
 * Generate cryptographically secure random alphanumeric code segment
 */
function randomAlphanumeric(length: number): string {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // Base32 ambiguous-char-free alphabet
  let res = "";
  for (let i = 0; i < length; i++) {
    res += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return res;
}

/**
 * Bulk generate unique signup codes
 */
export async function bulkGenerateSignupCodes(input: {
  quantity: number;
  prefix?: string;
  length?: number;
  maxUses?: number | null;
  expiresAt?: Date | null;
  notes?: string | null;
  createdBy?: string | null;
}): Promise<string[]> {
  const { quantity, prefix = "CLICK", length = 8, maxUses = null, expiresAt = null, notes = null, createdBy = null } = input;
  const cleanPrefix = prefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const codeLen = Math.max(4, Math.min(20, length));
  const count = Math.max(1, Math.min(1000, quantity));

  const generatedCodes = new Set<string>();

  // Fetch existing codes to prevent collision
  const existing = await prisma.signupCode.findMany({
    select: { code: true },
  });
  const existingSet = new Set(existing.map((c) => c.code));

  while (generatedCodes.size < count) {
    const code = cleanPrefix
      ? `${cleanPrefix}-${randomAlphanumeric(codeLen)}`
      : randomAlphanumeric(codeLen);
    if (!existingSet.has(code) && !generatedCodes.has(code)) {
      generatedCodes.add(code);
    }
  }

  const codeList = Array.from(generatedCodes);
  await prisma.signupCode.createMany({
    data: codeList.map((code) => ({
      code,
      status: "ACTIVE",
      maxUses,
      expiresAt,
      notes,
      createdBy,
    })),
  });

  return codeList;
}

