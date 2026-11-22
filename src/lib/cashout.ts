import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";

export interface CashoutConfig {
  enabled: boolean;
  deviceKey: string;
  siteName: string;
  minAmount: number;
  maxAmount: number;
  allowedSenders: string[];
}

export async function getCashoutConfig(): Promise<CashoutConfig> {
  const keys = [
    "cashout_enabled",
    "cashout_device_key",
    "cashout_site_name",
    "cashout_min_amount",
    "cashout_max_amount",
    "cashout_allowed_senders",
  ];
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: keys } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const minVal = parseFloat(map.get("cashout_min_amount") || "1");
  const maxVal = parseFloat(map.get("cashout_max_amount") || "5000");
  const rawSenders = (map.get("cashout_allowed_senders") ?? "MobileMoney,MTN,TelecelCash,ATMoney").trim();
  const allowedSenders = rawSenders
    ? rawSenders
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  return {
    enabled: map.get("cashout_enabled") === "true",
    deviceKey: (map.get("cashout_device_key") || process.env.CASHOUT_DEVICE_KEY || "").trim(),
    siteName: (map.get("cashout_site_name") || "Tskconnect").trim(),
    minAmount: Number.isFinite(minVal) && minVal > 0 ? minVal : 1,
    maxAmount: Number.isFinite(maxVal) && maxVal > 0 ? maxVal : 5000,
    allowedSenders,
  };
}

/**
 * Normalizes a Ghanaian phone number to 10 digits starting with 0 (e.g. 0241234567).
 */
export function normalizeCashoutPhone(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.startsWith("233") && digits.length === 12) {
    return `0${digits.slice(3)}`;
  }
  if (digits.length === 9) {
    return `0${digits}`;
  }
  return digits;
}

/**
 * Verifies M-AVETECH Cash-Out gateway signature:
 * X-Agent-Time: Unix seconds (within 300s window)
 * X-Agent-Sign: lowercase hex HMAC-SHA256 of "<X-Agent-Time>.<raw body>"
 */
export async function verifyAgentAppRequest(
  rawBody: string,
  timeHeader: string | null,
  signHeader: string | null
): Promise<boolean> {
  const config = await getCashoutConfig();
  if (!config.deviceKey || !timeHeader || !signHeader) return false;

  const ts = Number(timeHeader.trim());
  if (!Number.isFinite(ts)) return false;

  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > 300) return false;

  const expectedHex = createHmac("sha256", config.deviceKey)
    .update(`${timeHeader.trim()}.${rawBody}`, "utf8")
    .digest("hex")
    .toLowerCase();

  const providedHex = signHeader.trim().toLowerCase();
  const a = Buffer.from(expectedHex, "utf8");
  const b = Buffer.from(providedHex, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Parses amount and settlement transaction ID from a MoMo Cash-Out SMS body.
 */
export function parseCashoutSms(body: string): {
  amount: number | null;
  transactionId: string | null;
} {
  const text = (body || "").trim();
  if (!text) return { amount: null, transactionId: null };

  // Extract amount: e.g. "GHS 5.00", "GHC 5.00", "GH₵5.00", "5.00 GHS"
  let amount: number | null = null;
  const amountPatterns = [
    /(?:GHS|GHC|GH₵)\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/i,
    /([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)\s*(?:GHS|GHC|cedis)/i,
  ];
  for (const pat of amountPatterns) {
    const m = text.match(pat);
    if (m?.[1]) {
      const parsed = parseFloat(m[1].replace(/,/g, ""));
      if (Number.isFinite(parsed) && parsed > 0) {
        amount = parsed;
        break;
      }
    }
  }

  // Extract Transaction ID: e.g. "Financial Transaction ID: 90659976372"
  let transactionId: string | null = null;
  const txPatterns = [
    /Financial\s+Transaction\s+ID\s*[:#-]?\s*([A-Z0-9-]{6,40})/i,
    /Transaction\s+ID\s*[:#-]?\s*([A-Z0-9-]{6,40})/i,
    /Trans(?:action)?\s*Ref(?:erence)?\s*[:#-]?\s*([A-Z0-9-]{6,40})/i,
    /Tx(?:n)?\s*ID\s*[:#-]?\s*([A-Z0-9-]{6,40})/i,
    /Reference\s*[:#-]?\s*([A-Z0-9-]{6,40})/i,
  ];
  for (const pat of txPatterns) {
    const m = text.match(pat);
    if (m?.[1]) {
      transactionId = m[1].trim();
      break;
    }
  }

  return { amount, transactionId };
}

/**
 * Pulls the next queued Cash-Out job one at a time.
 * Holds the queue if another job is currently PULLED awaiting /report.
 */
export async function pullNextCashoutJob(): Promise<{
  id: number;
  phone: string;
  amount: string;
} | null> {
  // Release stale PULLED jobs older than 3 minutes so a crashed client cannot deadlock the queue
  const staleCutoff = new Date(Date.now() - 3 * 60 * 1000);
  await prisma.cashoutRequest.updateMany({
    where: {
      status: "PULLED",
      pulledAt: { lt: staleCutoff },
    },
    data: {
      status: "QUEUED",
      pulledAt: null,
    },
  });

  // Hand out one at a time — hold the next until the current one is reported
  const activePulled = await prisma.cashoutRequest.findFirst({
    where: { status: "PULLED" },
    select: { id: true },
  });
  if (activePulled) {
    return null;
  }

  const oldestQueued = await prisma.cashoutRequest.findFirst({
    where: { status: "QUEUED" },
    orderBy: { createdAt: "asc" },
  });
  if (!oldestQueued) return null;

  const updated = await prisma.cashoutRequest.updateMany({
    where: { id: oldestQueued.id, status: "QUEUED" },
    data: {
      status: "PULLED",
      pulledAt: new Date(),
    },
  });
  if (updated.count === 0) return null;

  const amountStr = Number.isInteger(oldestQueued.amount)
    ? String(oldestQueued.amount)
    : oldestQueued.amount.toFixed(2).replace(/\.?0+$/, "");

  return {
    id: oldestQueued.id,
    phone: oldestQueued.phone,
    amount: amountStr,
  };
}

/**
 * Records the gateway's /agent-app/report callback for a pulled job.
 */
export async function reportCashoutJob(input: {
  id: number;
  ok: boolean;
  text?: string | null;
}): Promise<void> {
  const existing = await prisma.cashoutRequest.findUnique({
    where: { id: input.id },
  });
  if (!existing || existing.status === "SETTLED") return;

  await prisma.cashoutRequest.update({
    where: { id: input.id },
    data: {
      status: input.ok ? "AWAITING_SETTLEMENT" : "FAILED",
      reportedAt: new Date(),
      reportText: input.text ? String(input.text).slice(0, 500) : null,
    },
  });
}

/**
 * Handles /agent-app/sms settlement message:
 * - Validates sender allow-list
 * - Parses amount & transaction ID
 * - Idempotently skips already-settled references
 * - Matches an AWAITING_SETTLEMENT (or PULLED) CashoutRequest by amount and credits wallet once
 * - Holds unmatched/disallowed messages in IncomingMomoTransaction for manual reconciliation / claim
 */
export async function settleCashoutFromSms(input: {
  body: string;
  sender?: string | null;
  time?: number | null;
}): Promise<{
  ok: boolean;
  status: string;
  transactionId?: string | null;
  cashoutId?: number;
}> {
  const config = await getCashoutConfig();
  const sender = (input.sender || "").trim();
  const isSenderAllowed =
    config.allowedSenders.length === 0 ||
    config.allowedSenders.includes("*") ||
    config.allowedSenders.some((s) => s.toLowerCase() === sender.toLowerCase());

  const parsed = parseCashoutSms(input.body);

  if (!isSenderAllowed || !parsed.amount || !parsed.transactionId) {
    const fallbackRef = parsed.transactionId || `CSH-UNM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const existingUnm = await prisma.incomingMomoTransaction.findUnique({
      where: { transactionReference: fallbackRef },
      select: { id: true },
    });
    if (!existingUnm) {
      await prisma.incomingMomoTransaction.create({
        data: {
          transactionReference: fallbackRef,
          network: "MTN",
          amount: parsed.amount ?? 0,
          currency: "GHS",
          senderPhone: sender || null,
          transactionAt: input.time ? new Date(input.time * 1000) : new Date(),
          rawSms: input.body,
          parsedData: JSON.stringify({ ...parsed, sender, isSenderAllowed }),
          source: "CASHOUT_GATEWAY",
          status: "UNMATCHED",
        },
      });
    }
    return {
      ok: true,
      status: !isSenderAllowed ? "UNMATCHED_SENDER" : "UNMATCHED",
      transactionId: parsed.transactionId,
    };
  }

  const txRef = parsed.transactionId;
  const walletRef = `CASHOUT-${txRef}`;

  // Idempotency: skip a reference we've already settled
  const alreadyCashout = await prisma.cashoutRequest.findUnique({
    where: { transactionReference: txRef },
  });
  if (alreadyCashout?.status === "SETTLED") {
    return { ok: true, status: "ALREADY_SETTLED", transactionId: txRef, cashoutId: alreadyCashout.id };
  }

  const alreadyWalletTx = await prisma.walletTransaction.findFirst({
    where: { reference: walletRef },
  });
  if (alreadyWalletTx) {
    return { ok: true, status: "ALREADY_SETTLED", transactionId: txRef };
  }

  // Match an awaiting transaction by amount (oldest first)
  const candidates = await prisma.cashoutRequest.findMany({
    where: {
      status: { in: ["AWAITING_SETTLEMENT", "PULLED"] },
    },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  const matched = candidates.find(
    (c) => Math.abs(c.amount - parsed.amount!) <= 0.01
  );

  if (!matched) {
    // Store in IncomingMomoTransaction so user can still claim by Transaction ID or admin can reconcile
    const existingMomo = await prisma.incomingMomoTransaction.findUnique({
      where: { transactionReference: txRef },
      select: { id: true },
    });
    if (!existingMomo) {
      await prisma.incomingMomoTransaction.create({
        data: {
          transactionReference: txRef,
          network: "MTN",
          amount: parsed.amount,
          currency: "GHS",
          senderPhone: sender || null,
          transactionAt: input.time ? new Date(input.time * 1000) : new Date(),
          rawSms: input.body,
          parsedData: JSON.stringify({ ...parsed, sender }),
          source: "CASHOUT_GATEWAY",
          status: "AVAILABLE",
        },
      });
    }
    return { ok: true, status: "UNMATCHED_NO_AWAITING_ORDER", transactionId: txRef };
  }

  // Atomically settle and credit the wallet once
  const settled = await prisma.$transaction(async (tx) => {
    const guard = await tx.cashoutRequest.updateMany({
      where: {
        id: matched.id,
        status: { in: ["AWAITING_SETTLEMENT", "PULLED"] },
      },
      data: {
        status: "SETTLED",
        transactionReference: txRef,
        smsSender: sender || null,
        smsBody: input.body,
        settledAt: new Date(),
      },
    });
    if (guard.count === 0) return false;

    const wtx = await tx.walletTransaction.create({
      data: {
        userId: matched.userId,
        type: "TOPUP",
        amount: matched.amount,
        status: "APPROVED",
        reference: walletRef,
        note: `Cash-Out MoMo deposit (${matched.phone}, Tx ID: ${txRef})`,
      },
    });

    await tx.cashoutRequest.update({
      where: { id: matched.id },
      data: { walletTransactionId: wtx.id },
    });

    await tx.user.update({
      where: { id: matched.userId },
      data: { balance: { increment: matched.amount } },
    });

    return true;
  });

  if (settled) {
    await recordAudit({
      userId: matched.userId,
      actorLabel: "cashout-gateway",
      action: "cashout.settled",
      target: `cashout:${matched.id}`,
      newValue: JSON.stringify({
        cashoutId: matched.id,
        amount: matched.amount,
        phone: matched.phone,
        transactionReference: txRef,
      }),
    });
  }

  return {
    ok: true,
    status: settled ? "SETTLED" : "ALREADY_SETTLED",
    transactionId: txRef,
    cashoutId: matched.id,
  };
}

/**
 * Allows a user to verify/claim a Cash-Out deposit using the Transaction ID
 * displayed after completing the MoMo Cash-Out prompt.
 * Never double-credits if the SMS webhook already settled it.
 */
export async function claimCashoutByTransactionId(input: {
  userId: string;
  transactionId: string;
  cashoutId?: number;
}): Promise<{
  ok: boolean;
  alreadyCredited?: boolean;
  pending?: boolean;
  amount?: number;
  transactionReference?: string;
  message: string;
}> {
  const txRef = input.transactionId.trim();
  if (!txRef) {
    return { ok: false, message: "Please enter a valid Transaction ID." };
  }

  // 1. Check if this user's CashoutRequest was already settled with this Transaction ID
  const existingForRef = await prisma.cashoutRequest.findUnique({
    where: { transactionReference: txRef },
  });
  if (existingForRef) {
    if (existingForRef.userId !== input.userId) {
      return { ok: false, message: "This Transaction ID belongs to another account." };
    }
    if (existingForRef.status === "SETTLED") {
      return {
        ok: true,
        alreadyCredited: true,
        amount: existingForRef.amount,
        transactionReference: txRef,
        message: `Deposit of GHS ${existingForRef.amount.toFixed(2)} (Tx ID: ${txRef}) is already credited to your wallet.`,
      };
    }
  }

  // 2. Check if already credited via WalletTransaction
  const walletRef = `CASHOUT-${txRef}`;
  const existingWtx = await prisma.walletTransaction.findFirst({
    where: { reference: walletRef },
  });
  if (existingWtx) {
    if (existingWtx.userId !== input.userId) {
      return { ok: false, message: "This Transaction ID has already been claimed." };
    }
    return {
      ok: true,
      alreadyCredited: true,
      amount: existingWtx.amount,
      transactionReference: txRef,
      message: `Deposit of GHS ${existingWtx.amount.toFixed(2)} (Tx ID: ${txRef}) is already credited to your wallet.`,
    };
  }

  // 3. Look for an AVAILABLE / UNMATCHED IncomingMomoTransaction from the Cash-Out gateway
  const momoTx = await prisma.incomingMomoTransaction.findUnique({
    where: { transactionReference: txRef },
  });

  if (!momoTx || momoTx.source !== "CASHOUT_GATEWAY" || momoTx.amount <= 0) {
    return {
      ok: false,
      pending: true,
      message: "Transaction ID has not been received from the gateway yet. Please wait a few seconds and try again.",
    };
  }

  if (momoTx.status === "CLAIMED") {
    return { ok: false, message: "This Transaction ID has already been claimed." };
  }

  // 4. Atomically claim and credit the user's wallet once
  const creditedAmount = momoTx.amount;
  const result = await prisma.$transaction(async (tx) => {
    const claimGuard = await tx.incomingMomoTransaction.updateMany({
      where: {
        id: momoTx.id,
        status: { in: ["AVAILABLE", "UNMATCHED"] },
      },
      data: { status: "CLAIMED" },
    });
    if (claimGuard.count === 0) return { ok: false };

    const wtx = await tx.walletTransaction.create({
      data: {
        userId: input.userId,
        type: "TOPUP",
        amount: creditedAmount,
        status: "APPROVED",
        reference: walletRef,
        note: `Cash-Out MoMo claim (Tx ID: ${txRef})`,
      },
    });

    if (input.cashoutId) {
      await tx.cashoutRequest.updateMany({
        where: { id: input.cashoutId, userId: input.userId },
        data: {
          status: "SETTLED",
          transactionReference: txRef,
          walletTransactionId: wtx.id,
          settledAt: new Date(),
        },
      });
    }

    await tx.user.update({
      where: { id: input.userId },
      data: { balance: { increment: creditedAmount } },
    });

    return { ok: true };
  });

  if (!result.ok) {
    return { ok: false, message: "This Transaction ID was already claimed." };
  }

  await recordAudit({
    userId: input.userId,
    actorLabel: "cashout-claim",
    action: "cashout.claimed",
    target: `incoming-momo:${momoTx.id}`,
    newValue: JSON.stringify({ transactionReference: txRef, amount: creditedAmount }),
  });

  return {
    ok: true,
    amount: creditedAmount,
    transactionReference: txRef,
    message: `Successfully claimed GHS ${creditedAmount.toFixed(2)} (Tx ID: ${txRef}) into your wallet!`,
  };
}
