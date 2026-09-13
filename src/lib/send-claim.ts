import { prisma } from "./prisma";
import { recordAudit } from "./audit";
import { parseMomoSms, normalizeTransactionReference } from "./momo-parser";
import { sendClaimSuccessEmail, sendClaimRejectedEmail } from "./email";
import { timingSafeEqual } from "crypto";
import { getSetting } from "./orders";

export const DEFAULT_EXPIRY_HOURS = 168; // 7 days
export const DEFAULT_MIN_AMOUNT = 1;
export const DEFAULT_MAX_AMOUNT = 5000;

/**
 * In-memory sliding rate limiter for failed claims:
 * Max 5 failed claims per 15 minutes per key (user or IP).
 */
const failedClaimAttempts = new Map<string, number[]>();

export function checkClaimRateLimit(key: string, maxAttempts = 5, windowMs = 15 * 60 * 1000): boolean {
  const now = Date.now();
  const timestamps = failedClaimAttempts.get(key) ?? [];
  const valid = timestamps.filter((t) => now - t < windowMs);
  if (valid.length >= maxAttempts) {
    return false; // Rate limited
  }
  return true;
}

export function recordFailedClaimAttempt(key: string): void {
  const now = Date.now();
  const timestamps = failedClaimAttempts.get(key) ?? [];
  timestamps.push(now);
  failedClaimAttempts.set(key, timestamps);
}

export function resetFailedClaimAttempts(key: string): void {
  failedClaimAttempts.delete(key);
}

/**
 * Get Send & Claim settings with defaults fallback
 */
export async function getSendClaimSettings() {
  const settings = await prisma.sendClaimSettings.findUnique({
    where: { id: "default" },
  });

  if (!settings) {
    return prisma.sendClaimSettings.create({
      data: {
        id: "default",
        enabled: true,
        network: "MTN",
        momoNumber: "0240000000",
        accountName: "Clickyfied",
        instructions: "Send money to the Mobile Money number below, then enter your transaction details to claim the funds.",
        minimumAmount: DEFAULT_MIN_AMOUNT,
        maximumAmount: DEFAULT_MAX_AMOUNT,
        claimExpiryHours: DEFAULT_EXPIRY_HOURS,
      },
    });
  }

  return settings;
}

/**
 * Update Send & Claim settings
 */
export async function updateSendClaimSettings(data: {
  enabled?: boolean;
  network?: string;
  momoNumber?: string;
  accountName?: string;
  instructions?: string;
  minimumAmount?: number;
  maximumAmount?: number;
  claimExpiryHours?: number;
}) {
  return prisma.sendClaimSettings.upsert({
    where: { id: "default" },
    update: {
      ...(data.enabled !== undefined && { enabled: data.enabled }),
      ...(data.network !== undefined && { network: data.network }),
      ...(data.momoNumber !== undefined && { momoNumber: data.momoNumber }),
      ...(data.accountName !== undefined && { accountName: data.accountName }),
      ...(data.instructions !== undefined && { instructions: data.instructions }),
      ...(data.minimumAmount !== undefined && { minimumAmount: data.minimumAmount }),
      ...(data.maximumAmount !== undefined && { maximumAmount: data.maximumAmount }),
      ...(data.claimExpiryHours !== undefined && { claimExpiryHours: data.claimExpiryHours }),
    },
    create: {
      id: "default",
      enabled: data.enabled ?? true,
      network: data.network ?? "MTN",
      momoNumber: data.momoNumber ?? "0240000000",
      accountName: data.accountName ?? "Clickyfied",
      instructions: data.instructions ?? "Send money to the Mobile Money number below, then enter your transaction details to claim the funds.",
      minimumAmount: data.minimumAmount ?? DEFAULT_MIN_AMOUNT,
      maximumAmount: data.maximumAmount ?? DEFAULT_MAX_AMOUNT,
      claimExpiryHours: data.claimExpiryHours ?? DEFAULT_EXPIRY_HOURS,
    },
  });
}

/**
 * Timing-safe secret verification for SMS forwarder webhook
 */
export function verifyForwarderSecret(providedToken?: string | null): boolean {
  const configuredSecret = process.env.SMS_FORWARDER_SECRET || "clickyfied_forwarder_secret_2026";
  if (!providedToken) return false;

  const cleanProvided = providedToken.replace(/^Bearer\s+/i, "").trim();
  const bufA = Buffer.from(cleanProvided);
  const bufB = Buffer.from(configuredSecret);

  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Process incoming SMS payload from SMS forwarder
 */
export async function processIncomingForwardedSms(input: {
  rawSms: string;
  senderPhone?: string | null;
  recipientPhone?: string | null;
  networkHint?: string | null;
  source?: string;
}) {
  const settings = await getSendClaimSettings();
  const parsed = parseMomoSms(input.rawSms, input.networkHint ?? undefined);

  if (!parsed) {
    // Unmatched / unparseable SMS
    const tx = await prisma.incomingMomoTransaction.create({
      data: {
        transactionReference: `UNM-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        network: input.networkHint?.toUpperCase() || "MTN",
        amount: 0,
        currency: "GHS",
        senderPhone: input.senderPhone ?? null,
        recipientPhone: input.recipientPhone ?? settings.momoNumber,
        rawSms: input.rawSms,
        parsedData: null,
        source: input.source || "SMS_FORWARDER",
        status: "UNMATCHED",
      },
    });

    await recordAudit({
      actorLabel: "sms-forwarder",
      action: "momo.sms_unmatched",
      target: `incoming-momo:${tx.id}`,
      newValue: JSON.stringify({ rawSms: input.rawSms }),
    });

    return {
      success: true,
      transactionId: tx.id,
      status: "UNMATCHED",
      message: "SMS received but could not extract transaction details. Marked as UNMATCHED for review.",
    };
  }

  // If parsed as an outgoing debit or cash out transaction, reject it immediately
  if (!parsed.isSuccessful || parsed.transactionType === "DEBIT") {
    const normalizedRef = normalizeTransactionReference(parsed.transactionReference);
    const debitTx = await prisma.incomingMomoTransaction.create({
      data: {
        transactionReference: `${normalizedRef}-DEBIT-${Date.now()}`,
        network: parsed.network,
        amount: parsed.amount,
        currency: parsed.currency || "GHS",
        senderPhone: parsed.senderPhone ?? input.senderPhone ?? null,
        recipientPhone: parsed.recipientPhone ?? input.recipientPhone ?? settings.momoNumber,
        transactionAt: parsed.transactionAt ?? new Date(),
        rawSms: input.rawSms,
        parsedData: JSON.stringify(parsed),
        source: input.source || "SMS_FORWARDER",
        status: "REJECTED",
      },
    });

    await recordAudit({
      actorLabel: "sms-forwarder",
      action: "momo.sms_rejected_debit",
      target: `incoming-momo:${debitTx.id}`,
      newValue: JSON.stringify({
        reference: normalizedRef,
        amount: parsed.amount,
        type: parsed.transactionType,
      }),
    });

    return {
      success: true,
      transactionId: debitTx.id,
      reference: normalizedRef,
      amount: parsed.amount,
      network: parsed.network,
      status: "REJECTED",
      message: "Outgoing or debit transaction rejected. Not claimable.",
    };
  }

  const normalizedRef = normalizeTransactionReference(parsed.transactionReference);

  // Check for duplicate transaction reference
  const existing = await prisma.incomingMomoTransaction.findUnique({
    where: { transactionReference: normalizedRef },
  });

  if (existing) {
    // Duplicate SMS sent by forwarder
    const dupTx = await prisma.incomingMomoTransaction.create({
      data: {
        transactionReference: `${normalizedRef}-DUP-${Date.now()}`,
        network: parsed.network,
        amount: parsed.amount,
        currency: parsed.currency || "GHS",
        senderPhone: parsed.senderPhone ?? input.senderPhone ?? null,
        recipientPhone: parsed.recipientPhone ?? input.recipientPhone ?? settings.momoNumber,
        rawSms: input.rawSms,
        parsedData: JSON.stringify(parsed),
        source: input.source || "SMS_FORWARDER",
        status: "DUPLICATE",
      },
    });

    await recordAudit({
      actorLabel: "sms-forwarder",
      action: "momo.sms_duplicate",
      target: `incoming-momo:${dupTx.id}`,
      newValue: JSON.stringify({ reference: normalizedRef, originalId: existing.id }),
    });

    return {
      success: true,
      transactionId: dupTx.id,
      status: "DUPLICATE",
      message: "Duplicate transaction received. Kept for audit trail.",
    };
  }

  // Validate amount limits
  let status = "AVAILABLE";
  if (parsed.amount < settings.minimumAmount || parsed.amount > settings.maximumAmount) {
    status = "REJECTED";
  }

  try {
    const newTx = await prisma.incomingMomoTransaction.create({
      data: {
        transactionReference: normalizedRef,
        network: parsed.network,
        amount: parsed.amount,
        currency: parsed.currency || "GHS",
        senderPhone: parsed.senderPhone ?? input.senderPhone ?? null,
        recipientPhone: parsed.recipientPhone ?? input.recipientPhone ?? settings.momoNumber,
        transactionAt: parsed.transactionAt ?? new Date(),
        rawSms: input.rawSms,
        parsedData: JSON.stringify(parsed),
        source: input.source || "SMS_FORWARDER",
        status,
      },
    });

    await recordAudit({
      actorLabel: "sms-forwarder",
      action: status === "AVAILABLE" ? "momo.sms_available" : "momo.sms_rejected_limit",
      target: `incoming-momo:${newTx.id}`,
      newValue: JSON.stringify({
        reference: normalizedRef,
        network: parsed.network,
        amount: parsed.amount,
        status,
      }),
    });

    return {
      success: true,
      transactionId: newTx.id,
      reference: normalizedRef,
      amount: parsed.amount,
      network: parsed.network,
      status,
    };
  } catch (err: any) {
    // Handle concurrent duplicate webhook race condition
    if (err?.code === "P2002") {
      const dupTx = await prisma.incomingMomoTransaction.create({
        data: {
          transactionReference: `${normalizedRef}-DUP-${Date.now()}`,
          network: parsed.network,
          amount: parsed.amount,
          currency: parsed.currency || "GHS",
          senderPhone: parsed.senderPhone ?? input.senderPhone ?? null,
          recipientPhone: parsed.recipientPhone ?? input.recipientPhone ?? settings.momoNumber,
          rawSms: input.rawSms,
          parsedData: JSON.stringify(parsed),
          source: input.source || "SMS_FORWARDER",
          status: "DUPLICATE",
        },
      });

      await recordAudit({
        actorLabel: "sms-forwarder",
        action: "momo.sms_duplicate",
        target: `incoming-momo:${dupTx.id}`,
        newValue: JSON.stringify({ reference: normalizedRef, raceHandled: true }),
      });

      return {
        success: true,
        transactionId: dupTx.id,
        status: "DUPLICATE",
        message: "Duplicate transaction received concurrently. Kept for audit trail.",
      };
    }
    throw err;
  }
}

export interface ClaimSuccessResult {
  success: true;
  claimId: string;
  amount: number;
  network: string;
  transactionReference: string;
  newBalance: number;
  creditedAt: Date;
}

/**
 * Claim an incoming Mobile Money transaction.
 * Completely atomic inside database transaction.
 */
export async function claimMomoTransaction(input: {
  userId: string;
  userEmail: string;
  transactionReference: string;
  amount: number;
  network: string;
  senderPhone?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<ClaimSuccessResult> {

  const rateLimitKey = `claim:${input.userId}:${input.ip ?? "unknown"}`;
  if (!checkClaimRateLimit(rateLimitKey)) {
    throw new Error("Too many failed claim attempts. Please wait 15 minutes before trying again.");
  }

  const normalizedRef = normalizeTransactionReference(input.transactionReference);
  const normalizedNetwork = input.network.trim().toUpperCase();
  const settings = await getSendClaimSettings();

  if (!settings.enabled) {
    throw new Error("Send & Claim top-ups are currently disabled by the administrator.");
  }

  // Helper to record rejected claim record, audit log, and dispatch notification
  const handleClaimRejection = async (reason: string, incomingId?: string | null, userName?: string) => {
    recordFailedClaimAttempt(rateLimitKey);

    await prisma.sendClaim.create({
      data: {
        userId: input.userId,
        incomingMomoTransactionId: incomingId ?? null,
        transactionReference: normalizedRef,
        claimedAmount: input.amount,
        network: normalizedNetwork,
        senderPhone: input.senderPhone ?? null,
        status: "REJECTED",
        rejectionReason: reason,
        processedAt: new Date(),
        ipAddress: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      },
    });

    await recordAudit({
      userId: input.userId,
      actorLabel: input.userEmail,
      action: "claim.rejected",
      target: `claim:${normalizedRef}`,
      newValue: JSON.stringify({
        reference: normalizedRef,
        amount: input.amount,
        network: normalizedNetwork,
        reason,
      }),
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });

    sendClaimRejectedEmail(input.userEmail, userName ?? "User", normalizedRef, "We couldn't verify this transaction against our incoming records.").catch(() => {});
  };

  // 1. Check user status: must exist and be ACTIVE (suspended users cannot claim)
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, name: true, email: true, status: true, balance: true },
  });

  if (!user || user.status !== "ACTIVE") {
    await handleClaimRejection("Account is suspended or inactive", null, user?.name);
    throw new Error("Your account is suspended or inactive. Please contact support.");
  }


  // Check if transaction has expired and update status before transaction
  const preCheck = await prisma.incomingMomoTransaction.findFirst({
    where: {
      transactionReference: { equals: normalizedRef, mode: "insensitive" },
    },
  });

  if (preCheck && preCheck.status === "AVAILABLE") {
    const expirySetting = parseFloat(await getSetting("send_claim_expiry_hours", String(DEFAULT_EXPIRY_HOURS)));
    const expiryMs = (isNaN(expirySetting) ? DEFAULT_EXPIRY_HOURS : expirySetting) * 3600 * 1000;
    const createdAtTime = preCheck.createdAt.getTime();
    if (Date.now() - createdAtTime > expiryMs) {
      await prisma.incomingMomoTransaction.update({
        where: { id: preCheck.id },
        data: { status: "EXPIRED" },
      });
      await recordAudit({
        actorLabel: "system",
        action: "momo.transaction_expired",
        target: `incoming-momo:${preCheck.id}`,
        newValue: JSON.stringify({ reference: preCheck.transactionReference }),
      });
      await handleClaimRejection("Transaction has expired", preCheck.id);
      throw new Error("This transaction has expired and can no longer be claimed.");
    }
  }

  const claimResult = await prisma.$transaction(async (tx) => {
    // 1. Find the incoming MoMo transaction
    const incoming = await tx.incomingMomoTransaction.findFirst({
      where: {
        transactionReference: { equals: normalizedRef, mode: "insensitive" },
      },
    });

    if (!incoming) {
      return { failed: true, reason: "No matching transaction found", incomingId: null, safeMessage: "We couldn't find a matching Mobile Money transaction. Make sure the transaction ID, network, and amount are correct." };
    }

    // 2. Check transaction status
    if (incoming.status === "CLAIMED") {
      return { failed: true, reason: "Transaction already claimed", incomingId: incoming.id, safeMessage: "This transaction has already been claimed." };
    }

    if (incoming.status !== "AVAILABLE") {
      return { failed: true, reason: "Transaction status not AVAILABLE", incomingId: incoming.id, safeMessage: "This transaction is not available for claiming." };
    }

    // 3. Verify network
    if (incoming.network.toUpperCase() !== normalizedNetwork) {
      return { failed: true, reason: "Network mismatch", incomingId: incoming.id, safeMessage: "We couldn't find a matching Mobile Money transaction. Make sure the transaction ID, network, and amount are correct." };
    }

    // 4. Verify amount strictly (must match within 0.01)
    if (Math.abs(incoming.amount - input.amount) > 0.01) {
      return { failed: true, reason: "Amount mismatch", incomingId: incoming.id, safeMessage: "We couldn't find a matching Mobile Money transaction. Make sure the transaction ID, network, and amount are correct." };
    }

    // 5. Expiration check inside transaction as fallback
    const expirySetting = parseFloat(await getSetting("send_claim_expiry_hours", String(DEFAULT_EXPIRY_HOURS)));
    const expiryMs = (isNaN(expirySetting) ? DEFAULT_EXPIRY_HOURS : expirySetting) * 3600 * 1000;
    const createdAtTime = incoming.createdAt.getTime();
    if (Date.now() - createdAtTime > expiryMs) {
      await tx.incomingMomoTransaction.update({
        where: { id: incoming.id },
        data: { status: "EXPIRED" },
      });
      return { failed: true, reason: "Transaction expired", incomingId: incoming.id, safeMessage: "This transaction has expired and can no longer be claimed." };
    }

    // 6. Atomically lock & mark as CLAIMED
    const updateResult = await tx.incomingMomoTransaction.updateMany({
      where: {
        id: incoming.id,
        status: "AVAILABLE",
      },
      data: {
        status: "CLAIMED",
      },
    });

    if (updateResult.count === 0) {
      return { failed: true, reason: "Concurrent claim collision", incomingId: incoming.id, safeMessage: "This transaction has already been claimed." };
    }

    // 7. Create wallet transaction ledger entry (ALWAYS using verified incoming.amount)
    const walletTx = await tx.walletTransaction.create({
      data: {
        userId: input.userId,
        type: "TOPUP",
        amount: incoming.amount,
        status: "APPROVED",
        reference: `MOMO-CLAIM-${incoming.transactionReference}`,
        note: `Send & Claim top-up (${incoming.network} Ref: ${incoming.transactionReference})`,
      },
    });

    // 8. Update user's wallet balance
    const updatedUser = await tx.user.update({
      where: { id: input.userId },
      data: { balance: { increment: incoming.amount } },
      select: { balance: true },
    });

    // 9. Create dedicated SendClaim record
    const claim = await tx.sendClaim.create({
      data: {
        userId: input.userId,
        incomingMomoTransactionId: incoming.id,
        walletTransactionId: walletTx.id,
        transactionReference: incoming.transactionReference,
        claimedAmount: incoming.amount,
        network: incoming.network,
        senderPhone: input.senderPhone ?? incoming.senderPhone ?? null,
        status: "APPROVED",
        processedAt: new Date(),
        ipAddress: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      },
    });

    // 10. Audit log
    await tx.auditLog.create({
      data: {
        userId: input.userId,
        actorLabel: input.userEmail,
        action: "wallet.send_and_claim_approved",
        target: `claim:${claim.id}`,
        newValue: JSON.stringify({
          incomingId: incoming.id,
          reference: incoming.transactionReference,
          amount: incoming.amount,
          newBalance: updatedUser.balance,
          walletTransactionId: walletTx.id,
        }),
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      },
    });

    return {
      failed: false,
      success: true,
      claimId: claim.id,
      amount: incoming.amount,
      network: incoming.network,
      transactionReference: incoming.transactionReference,
      newBalance: updatedUser.balance,
      creditedAt: claim.createdAt,
    };
  }, { maxWait: 15000, timeout: 20000 });

  if (claimResult.failed) {
    await handleClaimRejection(claimResult.reason!, claimResult.incomingId);
    throw new Error(claimResult.safeMessage!);
  }

  // Reset rate limit on success
  resetFailedClaimAttempts(rateLimitKey);

  // Send successful claim notification (§17)
  sendClaimSuccessEmail(
    input.userEmail,
    user.name,
    claimResult.amount!,
    claimResult.transactionReference!,
    claimResult.network!
  ).catch(() => {});

  return {
    success: true,
    claimId: claimResult.claimId!,
    amount: claimResult.amount!,
    network: claimResult.network!,
    transactionReference: claimResult.transactionReference!,
    newBalance: claimResult.newBalance!,
    creditedAt: claimResult.creditedAt!,
  };
}


/**
 * Manual wallet credit by administrator
 */
export async function adminManualCreditWallet(input: {
  adminId: string;
  adminEmail: string;
  userId: string;
  amount: number;
  reason: string;
  reference?: string;
  ip?: string | null;
}) {
  if (input.amount <= 0) {
    throw new Error("Credit amount must be positive");
  }

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: input.userId } });
    if (!user) throw new Error("User not found");

    const ref = input.reference?.trim() || `MANUAL-${Date.now()}`;

    const walletTx = await tx.walletTransaction.create({
      data: {
        userId: input.userId,
        type: "ADJUSTMENT",
        amount: input.amount,
        status: "APPROVED",
        reference: ref,
        note: input.reason,
      },
    });

    const updatedUser = await tx.user.update({
      where: { id: input.userId },
      data: { balance: { increment: input.amount } },
      select: { balance: true, email: true, name: true },
    });

    try {
      await tx.auditLog.create({
        data: {
          userId: input.userId,
          actorLabel: input.adminEmail,
          action: "wallet.admin_manual_credit",
          target: `user:${input.userId}`,
          previousValue: JSON.stringify({ balance: user.balance }),
          newValue: JSON.stringify({
            amount: input.amount,
            newBalance: updatedUser.balance,
            reason: input.reason,
            reference: ref,
            walletTransactionId: walletTx.id,
          }),
          ip: input.ip ?? null,
        },
      });
    } catch {
      // Audit log fallback
    }

    return {
      success: true,
      amount: input.amount,
      newBalance: updatedUser.balance,
      walletTransactionId: walletTx.id,
      reference: ref,
    };
  });
}
