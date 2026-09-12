import { prisma } from "./prisma";
import { AuthError } from "./auth";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// Money — all storefront money is stored as integer pesewas (GHS x 100) so
// that every calculation is exact (§46). Convert at the API/UI boundary.
// ---------------------------------------------------------------------------

export function toPesewas(ghs: number): number {
  return Math.round(ghs * 100);
}

export function fromPesewas(pesewas: number): number {
  return Math.round(pesewas) / 100;
}

export function formatGhs(pesewas: number): string {
  return `GHS ${fromPesewas(pesewas).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const STOREFRONT_STATUSES = [
  "NOT_ENABLED",
  "PENDING",
  "ENABLED",
  "SUSPENDED",
  "REJECTED",
] as const;
export type StorefrontStatus = (typeof STOREFRONT_STATUSES)[number];

/** Statuses that grant access to the storefront owner area. */
export function isOwnedStorefrontStatus(status: string): boolean {
  return status === "ENABLED" || status === "SUSPENDED";
}

export const COMMISSION_STATES = ["PENDING", "AVAILABLE", "WITHDRAWN", "REVERSED"] as const;
export type CommissionState = (typeof COMMISSION_STATES)[number];

export const MIN_WITHDRAWAL_P = 50 * 100; // GHS 50.00 (§26)

export type PrismaTransactionClient = Prisma.TransactionClient;

/** Slugs: lowercase letters, numbers and dashes, 3-32 chars (§5). */
export function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{2,31}$/.test(slug) && !slug.includes("--");
}

export function storefrontOrderCode(seq: number): string {
  return `CF-ST-${String(seq).padStart(5, "0")}`;
}

export function withdrawalCode(seq: number): string {
  return `CF-WD-${String(seq).padStart(5, "0")}`;
}

/** Reserved slugs that would collide with real routes (§5). */
export const RESERVED_SLUGS = new Set([
  "api", "admin", "dashboard", "storefront", "store", "login", "register",
  "forgot-password", "reset-password", "public", "_next", "settings",
]);

// ---------------------------------------------------------------------------
// Access gating (§1/§2) — enforced server-side, never just a hidden nav item
// ---------------------------------------------------------------------------

export async function getStorefrontForUser(userId: string) {
  return prisma.storefront.findUnique({
    where: { userId },
  });
}

export async function getEnabledStorefrontBySlug(slug: string) {
  return prisma.storefront.findUnique({ where: { slug } });
}

/**
 * Requires the signed-in user to have a storefront. Throws AuthError 404 for
 * users that never had one. SUSPENDED storefronts still get read access to
 * their orders/wallet (§6); write surfaces must check `status === "ENABLED"`.
 */
export async function requireStorefront(userId: string) {
  const storefront = await prisma.storefront.findUnique({ where: { userId } });
  if (!storefront || !isOwnedStorefrontStatus(storefront.status)) {
    throw new AuthError("You do not have storefront access", 404);
  }
  return storefront;
}

/**
 * Server-component gate for owner pages. Redirects to the apply page when the
 * user has no (or a revoked) storefront, and to the status page while an
 * application is pending or was rejected.
 */
export async function requireActiveStorefront(userId: string): Promise<
  NonNullable<Awaited<ReturnType<typeof getStorefrontForUser>>>
> {
  const storefront = await getStorefrontForUser(userId);
  if (!storefront || storefront.status === "NOT_ENABLED") {
    redirect("/dashboard/storefront/apply");
  }
  if (!isOwnedStorefrontStatus(storefront.status)) {
    redirect("/dashboard/storefront/pending");
  }
  return storefront;
}

/** Admin-configured global markup bounds (§10/§34), from SystemSetting. */
export async function getMarkupBounds(): Promise<{ minMarkupP: number; maxMarkupP: number }> {
  const [min, max] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { key: "storefront_min_markup" } }),
    prisma.systemSetting.findUnique({ where: { key: "storefront_max_markup" } }),
  ]);
  const minMarkupP = min ? Math.max(0, Math.round(Number(min.value) * 100)) : 0;
  const maxMarkupP = max ? Math.max(0, Math.round(Number(max.value) * 100)) : Number.MAX_SAFE_INTEGER;
  return { minMarkupP, maxMarkupP };
}

export async function nextStorefrontSeq(
  tx: PrismaTransactionClient,
  model: "storefrontOrder" | "storefrontWithdrawal"
): Promise<number> {
  if (model === "storefrontOrder") {
    const agg = await tx.storefrontOrder.aggregate({ _max: { seq: true } });
    return (agg._max.seq ?? 0) + 1;
  }
  const agg = await tx.storefrontWithdrawal.aggregate({ _max: { seq: true } });
  return (agg._max.seq ?? 0) + 1;
}

// ---------------------------------------------------------------------------
// Wallet — every balance movement goes through a ledger row (§23/§24).
// `applyLedgerEntry` runs inside a caller transaction; the guarded update
// (`where: { id, balance, pendingBalance }`) makes concurrent writers fail
// loudly instead of silently corrupting the audit trail.
// ---------------------------------------------------------------------------

export type LedgerType =
  | "COMMISSION"
  | "COMMISSION_RELEASE"
  | "COMMISSION_REVERSAL"
  | "WITHDRAWAL"
  | "WITHDRAWAL_REVERSAL"
  | "ADJUSTMENT";

export interface LedgerEntry {
  type: LedgerType;
  /** pesewas — positive credits, negative debits */
  amount: number;
  reference?: string;
  description?: string;
}

export async function applyLedgerEntry(
  tx: PrismaTransactionClient,
  walletId: string,
  entry: LedgerEntry
): Promise<void> {
  const wallet = await tx.storefrontWallet.findUniqueOrThrow({ where: { id: walletId } });
  const balanceBefore = wallet.balance;
  const pendingBefore = wallet.pendingBalance;
  let balanceAfter = balanceBefore;
  let pendingAfter = pendingBefore;

  switch (entry.type) {
    case "COMMISSION":
      // Payment confirmed, underlying order still in flight (§25)
      pendingAfter += entry.amount;
      break;
    case "COMMISSION_RELEASE":
      // Order completed -> pending becomes withdrawable (§25)
      pendingAfter -= entry.amount;
      balanceAfter += entry.amount;
      break;
    case "COMMISSION_REVERSAL": {
      // Refund/failure after crediting — take pending first, then balance (§38).
      // If the commission was already withdrawn the balance clamps at 0
      // (platform absorbs it) so the ledger stays consistent.
      const fromPending = Math.min(pendingBefore, entry.amount);
      pendingAfter = pendingBefore - fromPending;
      balanceAfter = Math.max(0, balanceBefore - (entry.amount - fromPending));
      break;
    }
    case "WITHDRAWAL":
      balanceAfter += entry.amount; // negative
      break;
    case "WITHDRAWAL_REVERSAL":
      balanceAfter -= entry.amount; // positive (money comes back)
      break;
    case "ADJUSTMENT":
      balanceAfter += entry.amount;
      break;
  }

  await tx.storefrontWallet.update({
    where: { id: walletId, balance: balanceBefore, pendingBalance: pendingBefore },
    data: { balance: balanceAfter, pendingBalance: pendingAfter },
  });

  await tx.storefrontWalletTransaction.create({
    data: {
      walletId,
      type: entry.type,
      amount: entry.amount,
      balanceBefore,
      balanceAfter,
      pendingBefore,
      pendingAfter,
      reference: entry.reference,
      description: entry.description,
    },
  });
}

/**
 * Ensures a wallet exists for the user (created lazily on first use) and
 * returns it.
 */
export async function ensureWallet(userId: string) {
  return prisma.storefrontWallet.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}

// ---------------------------------------------------------------------------
// Commission lifecycle (§25/§37/§38) — driven from changeOrderStatus
// ---------------------------------------------------------------------------

/**
 * Applies the commission transition for a storefront order whose underlying
 * order changed status:
 *  - SUCCESS      -> PENDING becomes AVAILABLE (money moves to balance)
 *  - FAILED/REFUNDED/CANCELLED after payment -> commission REVERSED
 * Runs in a single transaction with the StorefrontOrder row update so the
 * ledger can never drift from the order state.
 */
export async function syncCommissionForOrder(
  orderId: number,
  status: string
): Promise<void> {
  const storeOrder = await prisma.storefrontOrder.findUnique({
    where: { underlyingOrderId: orderId },
  });
  if (!storeOrder) return; // ordinary Clickyfied order — nothing to do

  const releasing = status === "SUCCESS";
  const reversing = ["FAILED", "REFUNDED", "CANCELLED"].includes(status);
  if (!releasing && !reversing) return;
  if (releasing && storeOrder.commissionState !== "PENDING") return;
  if (reversing && storeOrder.commissionState === "REVERSED") return;

  // storefrontOrder.storefrontId -> storefront -> owner's wallet
  const storefront = await prisma.storefront.findUnique({
    where: { id: storeOrder.storefrontId },
    select: { userId: true },
  });
  if (!storefront) return;
  const walletRow = await ensureWallet(storefront.userId);

  await prisma.$transaction(async (tx) => {
    if (releasing) {
      await applyLedgerEntry(tx, walletRow.id, {
        type: "COMMISSION_RELEASE",
        amount: storeOrder.commission,
        reference: storefrontOrderCode(storeOrder.seq),
        description: `Order completed — commission released`,
      });
      await tx.storefrontOrder.update({
        where: { id: storeOrder.id },
        data: { commissionState: "AVAILABLE", status: "COMPLETED", completedAt: new Date() },
      });
    } else {
      await applyLedgerEntry(tx, walletRow.id, {
        type: "COMMISSION_REVERSAL",
        amount: storeOrder.commission,
        reference: storefrontOrderCode(storeOrder.seq),
        description: `Order ${status.toLowerCase()} — commission reversed`,
      });
      await tx.storefrontOrder.update({
        where: { id: storeOrder.id },
        data: { commissionState: "REVERSED", status },
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Storefront checkout settlement (§29-§31) — idempotent Paystack settlement.
// References use the STF- prefix and are routed here from the webhook and the
// callback. Creating the underlying Order + StorefrontOrder is atomic, and the
// unique paymentReference makes double-settlement impossible.
// ---------------------------------------------------------------------------

export function isStorefrontReference(reference: string): boolean {
  return reference.startsWith("STF-");
}

/** 10-digit local Ghanaian mobile number starting with 0 (§14). */
export function isValidBeneficiaryPhone(phone: string): boolean {
  return /^0\d{9}$/.test(phone);
}

export interface SettleStorefrontPaymentInput {
  reference: string; // STF-<storefrontOrderRowId>
  paystackAmount: number; // pesewas as reported by Paystack
  paidAt?: Date;
}

export async function settleStorefrontPayment(
  input: SettleStorefrontPaymentInput
): Promise<{ settled: boolean; reason?: string }> {
  const row = await prisma.storefrontOrder.findUnique({
    where: { paymentReference: input.reference },
    include: { product: { include: { dataPackage: true } } },
  });
  if (!row) return { settled: false, reason: "unknown reference" };
  if (row.underlyingOrderId) return { settled: true }; // already settled — idempotent

  if (input.paystackAmount !== row.sellingPrice) {
    return { settled: false, reason: "amount mismatch" };
  }

  const storefront = await prisma.storefront.findUnique({
    where: { id: row.storefrontId },
    select: { userId: true },
  });
  if (!storefront) return { settled: false, reason: "storefront missing" };

  const wallet = await ensureWallet(storefront.userId);

  await prisma.$transaction(async (tx) => {
    // 1. Underlying Clickyfied order so the order lifecycle stays uniform.
    const order = await tx.order.create({
      data: {
        userId: storefront.userId, // fulfilled via the store owner's account
        packageId: row.product.packageId,
        phoneNumber: row.customerPhone,
        network: row.product.dataPackage.network,
        gbAmount: row.product.dataPackage.gbAmount,
        amount: fromPesewas(row.sellingPrice),
        status: "PENDING",
        source: "STOREFRONT",
      },
    });

    // 2. Link + mark the storefront order paid (now in fulfillment).
    await tx.storefrontOrder.update({
      where: { id: row.id },
      data: {
        status: "PROCESSING",
        underlyingOrderId: order.id,
        paidAt: input.paidAt ?? new Date(),
      },
    });

    // 3. Commission enters the wallet as pending (§25).
    await applyLedgerEntry(tx, wallet.id, {
      type: "COMMISSION",
      amount: row.commission,
      reference: storefrontOrderCode(row.seq),
      description: `Storefront sale ${storefrontOrderCode(row.seq)}`,
    });
  });

  return { settled: true };
}

/**
 * Approves a withdrawal: debits the wallet balance, writes the ledger row and
 * flips the request state — all atomically (§28).
 */
export async function approveWithdrawal(withdrawalId: string, adminNote?: string) {
  return prisma.$transaction(async (tx) => {
    const wd = await tx.storefrontWithdrawal.findUnique({ where: { id: withdrawalId } });
    if (!wd) throw new Error("Withdrawal not found");
    if (wd.status !== "PENDING") throw new Error("Withdrawal is not pending review");

    const wallet = await tx.storefrontWallet.findUnique({ where: { userId: wd.userId } });
    if (!wallet || wallet.balance < wd.amount) throw new Error("Insufficient wallet balance");

    await applyLedgerEntry(tx, wallet.id, {
      type: "WITHDRAWAL",
      amount: -wd.amount,
      reference: withdrawalCode(wd.seq),
      description: wd.network ? `MoMo payout via ${wd.network}` : "MoMo payout",
    });

    return tx.storefrontWithdrawal.update({
      where: { id: withdrawalId },
      data: { status: "APPROVED", adminNote },
    });
  });
}

/** Rejects a pending withdrawal without touching the wallet (§28). */
export async function rejectWithdrawal(withdrawalId: string, adminNote?: string) {
  const wd = await prisma.storefrontWithdrawal.findUnique({ where: { id: withdrawalId } });
  if (!wd) throw new Error("Withdrawal not found");
  if (wd.status !== "PENDING") throw new Error("Withdrawal is not pending review");
  return prisma.storefrontWithdrawal.update({
    where: { id: withdrawalId },
    data: { status: "REJECTED", adminNote },
  });
}

