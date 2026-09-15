import { prisma } from "./prisma";
import { syncCommissionForOrder } from "./storefront";
import { dispatchWebhookEvent } from "./webhooks";
import {
  canTransition,
  normalizeOrderStatus,
  type BatchStatus,
  type ExportBatchStatus,
  type OrderStatus,
} from "./types";

import { validateMtnOrderRecipient } from "./mtn-verification";

export async function getSetting(key: string, fallback = ""): Promise<string> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  return row?.value ?? fallback;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function isOrderProcessingHalted(): Promise<boolean> {
  return (await getSetting("order_processing_halted", "false")) === "true";
}

export async function getPricingForProfile(
  profileId: string | null,
  gbAmount: number,
  network?: string | null
): Promise<number | null> {
  if (!profileId) return null;

  if (network) {
    try {
      const netUpper = network.toUpperCase();
      const setting = await prisma.systemSetting.findUnique({
        where: { key: `pricing_profile_network_rates:${profileId}` },
      });
      if (setting?.value) {
        const netRates = JSON.parse(setting.value);
        if (Array.isArray(netRates[netUpper])) {
          const match = netRates[netUpper].find(
            (t: { gbAmount: number; priceGHS: number }) => t.gbAmount === gbAmount
          );
          if (match && typeof match.priceGHS === "number" && match.priceGHS > 0) {
            return match.priceGHS;
          }
        }
      }
    } catch {
      // ignore
    }
  }

  const tier = await prisma.priceTier.findUnique({
    where: { profileId_gbAmount: { profileId, gbAmount } },
  });
  return tier ? tier.priceGHS : null;
}

export async function getDefaultProfileId(): Promise<string | null> {
  const profile = await prisma.pricingProfile.findFirst({
    where: { isDefault: true },
    select: { id: true },
  });
  return profile?.id ?? null;
}

export interface CreateOrderInput {
  userId: string;
  phoneNumber: string;
  network: string;
  gbAmount: number;
  packageId?: string | null;
  amount?: number;
  source?: "WEB" | "API" | "STOREFRONT";
  batchId?: string | null;
  externalReference?: string | null;
  apiCredentialId?: string | null;
  isSandbox?: boolean;
  createdAt?: Date;
  status?: OrderStatus;
  historyNote?: string;
  historyBy?: string;
  skipMtnValidation?: boolean;
}

/**
 * Creates a single recipient order. Orders start as PENDING and are submitted
 * to the provider by the admin export workflow (PENDING -> PROCESSING), so the
 * pending queue is meaningful and networks are never mixed inside an export.
 */
export async function createOrder(input: CreateOrderInput) {
  const userRecord = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { pricingProfileId: true },
  });
  const profileId = userRecord?.pricingProfileId ?? null;
  const profile = profileId
    ? await prisma.pricingProfile.findUnique({ where: { id: profileId } })
    : null;
  const isCustomProfile = profile && !profile.isDefault;

  let price: number | null | undefined = input.amount;
  if (price == null) {
    if (isCustomProfile && profileId) {
      const customPrice = await getPricingForProfile(profileId, input.gbAmount, input.network);
      if (customPrice != null) price = customPrice;
    }
    if (price == null && input.packageId) {
      const pkg = await prisma.dataPackage.findUnique({ where: { id: input.packageId } });
      if (pkg?.retailPriceGHS != null) price = pkg.retailPriceGHS;
    }
    if (price == null && input.network && input.gbAmount) {
      const pkg = await prisma.dataPackage.findUnique({
        where: { network_gbAmount: { network: input.network, gbAmount: input.gbAmount } },
      });
      if (pkg?.retailPriceGHS != null) price = pkg.retailPriceGHS;
    }
    if (price == null) {
      const effectiveProfileId = profileId ?? (await getDefaultProfileId());
      price = await getPricingForProfile(effectiveProfileId, input.gbAmount, input.network);
    }
  }

  if (price == null) {
    throw new Error("No price configured for this package in your profile");
  }
  
  if (price === 0) {
    const allowZero = await getSetting("allow_zero_price_orders", "true");
    if (allowZero === "false") {
      throw new Error("Free packages (zero price) are not allowed.");
    }
  }

  // Central MTN Number Verification Check (§16, §17)
  if (!input.skipMtnValidation) {
    await validateMtnOrderRecipient(input.phoneNumber, input.network, input.userId, {
      throwOnFailure: true,
    });
  }

  const status = input.status ?? "PENDING";
  const createdAt = input.createdAt ?? new Date();

  const order = await prisma.order.create({
    data: {
      userId: input.userId,
      phoneNumber: input.phoneNumber,
      network: input.network,
      gbAmount: input.gbAmount,
      packageId: input.packageId ?? null,
      amount: price,
      status,
      source: input.source ?? "WEB",
      batchId: input.batchId ?? null,
      externalReference: input.externalReference ?? null,
      apiCredentialId: input.apiCredentialId ?? null,
      isSandbox: input.isSandbox ?? false,
      createdAt,
      updatedAt: createdAt,
      history: {
        create: {
          status,
          previousStatus: null,
          note: input.historyNote ?? "Order created",
          changedBy: input.historyBy ?? "system",
          createdAt,
        },
      },
    },
  });

  // If provider API routing is enabled, automatically dispatch the new order
  if (!input.isSandbox) {
    try {
      const { getProviderRoutingConfig, dispatchOrder } = await import("./provider-apis/router");
      const config = await getProviderRoutingConfig();
      if (config.enabled && config.autoDispatch) {
        dispatchOrder(order.id).catch((err) => {
          console.error(`Auto-dispatch failed for order #${order.id}:`, err);
        });
      }
    } catch (err) {
      console.error(`Provider routing check failed for order #${order.id}:`, err);
    }
  }

  return order;
}

/**
 * Recomputes an OrderBatch status from the individual order statuses (§24).
 */
export async function recomputeBatchStatus(
  batchId: string | null | undefined,
  client: Pick<typeof prisma, "order" | "orderBatch"> = prisma
): Promise<BatchStatus | null> {
  if (!batchId) return null;
  const grouped = await client.order.groupBy({
    by: ["status"],
    where: { batchId },
    _count: { _all: true },
  });
  const counts: Record<string, number> = {};
  let total = 0;
  for (const row of grouped) {
    counts[row.status] = row._count._all;
    total += row._count._all;
  }
  const pending = counts["PENDING"] ?? 0;
  const completed = counts["SUCCESS"] ?? 0;
  const failed = counts["FAILED"] ?? 0;
  const cancelled = counts["CANCELLED"] ?? 0;
  const refunded = counts["REFUNDED"] ?? 0;
  const processing = counts["PROCESSING"] ?? 0;

  let next: BatchStatus;
  if (total === 0) {
    next = "PENDING";
  } else if (completed === total) {
    next = "COMPLETED";
  } else if (cancelled === total) {
    next = "CANCELLED";
  } else if (failed + refunded === total) {
    next = "FAILED";
  } else if (processing > 0 || (pending > 0 && completed + failed + refunded + cancelled > 0)) {
    // In-flight work or mixed in-progress work: PROCESSING
    next = "PROCESSING";
  } else if (completed > 0) {
    next = "COMPLETED";
  } else {
    next = "PENDING";
  }

  const batch = await client.orderBatch.findUnique({
    where: { id: batchId },
    select: { status: true },
  });
  if (!batch || batch.status === next) return next;
  await client.orderBatch.update({ where: { id: batchId }, data: { status: next } });
  return next;
}

/**
 * Derives an ExportBatch status from the per-status counts of its orders.
 * Mirrors the OrderBatch rules (§24): in-flight work always wins.
 */
export function computeExportStatusFromCounts(
  counts: Record<string, number>
): ExportBatchStatus | null {
  let total = 0;
  for (const value of Object.values(counts)) total += value;
  if (total === 0) return null; // nothing linked yet — keep current status

  const completed = counts["SUCCESS"] ?? 0;
  const failed = counts["FAILED"] ?? 0;
  const cancelled = counts["CANCELLED"] ?? 0;
  const refunded = counts["REFUNDED"] ?? 0;
  const inFlight = (counts["PROCESSING"] ?? 0) + (counts["PENDING"] ?? 0);

  if (completed === total) return "COMPLETED";
  if (cancelled === total) return "CANCELLED";
  if (failed + refunded === total) return "FAILED";
  if (inFlight > 0) return "PROCESSING";
  if (completed > 0) return "COMPLETED";
  return "FAILED";
}

/**
 * Recomputes an ExportBatch status from the individual order statuses linked
 * via `exportBatchId`. Keeps the Export Center in sync when orders are
 * completed/failed/cancelled from anywhere in the admin panel.
 */
export async function recomputeExportBatchStatus(
  exportBatchId: string | null | undefined,
  client: Pick<typeof prisma, "order" | "exportBatch"> = prisma
): Promise<ExportBatchStatus | null> {
  if (!exportBatchId) return null;
  const grouped = await client.order.groupBy({
    by: ["status"],
    where: { exportBatchId },
    _count: { _all: true },
  });
  const counts: Record<string, number> = {};
  for (const row of grouped) counts[row.status] = row._count._all;

  const next = computeExportStatusFromCounts(counts);
  if (!next) return null;

  const exportBatch = await client.exportBatch.findUnique({
    where: { id: exportBatchId },
    select: { status: true },
  });
  if (!exportBatch || exportBatch.status === next) return next;
  await client.exportBatch.update({
    where: { id: exportBatchId },
    data: { status: next },
  });
  return next;
}

export interface Actor {
  id: string;
  label: string;
}

export async function changeOrderStatus(
  orderId: number,
  next: string,
  reason: string | null,
  actor: Actor,
  opts: { force?: boolean; skipBatchRecompute?: boolean } = {}
): Promise<{ changed: boolean; override?: boolean }> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Order not found");

  const target = normalizeOrderStatus(next);
  if (order.status === target) return { changed: false };

  const { allowed, override } = canTransition(order.status, target);
  if (!allowed && !opts.force) {
    throw new Error(
      `Illegal status transition ${order.status} → ${target}. Use the override option to force it.`
    );
  }
  if (override && !opts.force) {
    return { changed: false, override: true };
  }

  const note =
    target === "FAILED" && reason ? reason : reason ?? (override ? "Admin override" : undefined);

  await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: {
        status: target,
        // The 24h "Not Received" reporting window starts at completion (§3)
        ...(target === "SUCCESS" ? { completedAt: new Date() } : {}),
        failureReason: target === "FAILED" ? reason || order.failureReason : null,
      },
    }),
    prisma.orderStatusHistory.create({
      data: {
        orderId,
        status: target,
        previousStatus: order.status,
        note: note ?? undefined,
        changedBy: actor.label,
      },
    }),
  ]);

  if (!opts.skipBatchRecompute) {
    await recomputeBatchStatus(order.batchId);
    await recomputeExportBatchStatus(order.exportBatchId);
  }

  // Storefront commission lifecycle (§25/§38): release on SUCCESS, reverse on
  // refund/failure. No-op for ordinary orders.
  await syncCommissionForOrder(orderId, target);

  // If order is REFUNDED:
  // Ordinary orders (WEB / API): refund to user's wallet balance.
  // Storefront orders: DO NOT credit the agent's wallet — customer is refunded via Paystack.
  if (target === "REFUNDED") {
    if (order.source !== "STOREFRONT" && order.userId) {
      await prisma.$transaction([
        prisma.user.update({
          where: { id: order.userId },
          data: { balance: { increment: order.amount } },
        }),
        prisma.walletTransaction.create({
          data: {
            userId: order.userId,
            type: "REFUND",
            amount: order.amount,
            status: "APPROVED",
            reference: `REF-ORDER-${order.id}`,
            note: `Refund for Order #${order.id} (${order.phoneNumber})`,
          },
        }),
      ]);
    }
  }

  // Webhook notification for API and order status updates
  const eventMap: Record<string, "order.created" | "order.processing" | "order.completed" | "order.failed" | "order.cancelled"> = {
    PENDING: "order.created",
    PROCESSING: "order.processing",
    SUCCESS: "order.completed",
    FAILED: "order.failed",
    CANCELLED: "order.cancelled",
  };
  const webhookEvent = eventMap[target];
  if (webhookEvent && order.userId) {
    dispatchWebhookEvent(
      order.userId,
      webhookEvent,
      {
        orderId: `CLK-${order.id}`,
        reference: order.externalReference || null,
        network: order.network,
        gbAmount: order.gbAmount,
        amount: order.amount,
        phoneNumber: order.phoneNumber,
        status: target === "SUCCESS" ? "COMPLETED" : target,
        failureReason: target === "FAILED" ? (reason || order.failureReason) : null,
        createdAt: order.createdAt,
        completedAt: target === "SUCCESS" ? new Date() : order.completedAt,
      },
      order.id
    ).catch(() => undefined);
  }

  return { changed: true, override };
}

/** Bulk status change. Returns applied + skipped counts and whether an override was required. */
export async function bulkChangeOrderStatus(
  orderIds: number[],
  next: string,
  reason: string | null,
  actor: Actor,
  opts: { force?: boolean } = {}
): Promise<{ applied: number; skipped: number; overrideRequired: boolean }> {
  let applied = 0;
  let skipped = 0;
  let overrideRequired = false;
  for (const id of orderIds) {
    try {
      const result = await changeOrderStatus(id, next, reason, actor, {
        ...opts,
        skipBatchRecompute: true,
      });
      if (result.changed) applied += 1;
      else skipped += 1;
      if (result.override) overrideRequired = true;
    } catch {
      skipped += 1;
    }
  }
  const batchRows = await prisma.order.findMany({
    where: { id: { in: orderIds }, batchId: { not: null } },
    select: { batchId: true },
    distinct: ["batchId"],
  });
  for (const row of batchRows) {
    await recomputeBatchStatus(row.batchId);
  }
  const exportBatchRows = await prisma.order.findMany({
    where: { id: { in: orderIds }, exportBatchId: { not: null } },
    select: { exportBatchId: true },
    distinct: ["exportBatchId"],
  });
  for (const row of exportBatchRows) {
    await recomputeExportBatchStatus(row.exportBatchId);
  }
  return { applied, skipped, overrideRequired };
}

/**
 * Resolves when an order was completed (§3): uses the stored completedAt when
 * present, otherwise derives it from the most recent SUCCESS history entry so
 * legacy orders created before the field existed still get a reporting window.
 */
export function deriveCompletedAt(order: {
  status: string;
  completedAt?: Date | null;
  history?: { status: string; createdAt: Date }[];
  updatedAt?: Date;
}): Date | null {
  if (order.status !== "SUCCESS") return null;
  if (order.completedAt) return order.completedAt;
  const successEntry = [...(order.history ?? [])]
    .reverse()
    .find((h) => h.status === "SUCCESS");
  return successEntry?.createdAt ?? order.updatedAt ?? null;
}

export async function getOrderStats(where: Record<string, unknown>) {
  const [total, byStatus, revenue] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    }),
    prisma.order.aggregate({
      where: { ...(where as any), status: "SUCCESS" },
      _sum: { amount: true },
    }),
  ]);

  const statusCounts: Record<string, number> = {};
  for (const row of byStatus) statusCounts[row.status] = row._count._all;

  return {
    total,
    success: statusCounts["SUCCESS"] ?? 0,
    pending: statusCounts["PENDING"] ?? 0,
    processing: statusCounts["PROCESSING"] ?? 0,
    failed: statusCounts["FAILED"] ?? 0,
    cancelled: statusCounts["CANCELLED"] ?? 0,
    refunded: statusCounts["REFUNDED"] ?? 0,
    revenue: revenue._sum.amount ?? 0,
  };
}
