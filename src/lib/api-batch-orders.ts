import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { phoneSchema } from "@/lib/validation";
import { detectNetworkNameByPrefix } from "@/lib/phone-utils";
import { resolveUserWholesalePrice } from "@/lib/orders";
import { nextBatchCode } from "@/lib/batches";
import { sanitizeCustomerRefundNote } from "@/lib/types";
import { ApiError, formatApiSuccess, logApiRequestEntry } from "@/lib/developer-api";
import { dispatchWebhookEvent } from "@/lib/webhooks";

export interface BatchEntryInput {
  number?: string;
  phoneNumber?: string;
  recipient?: string;
  allocationGB?: number | string;
  gbAmount?: number | string;
  network?: string;
  packageId?: string;
}

export interface FilteredOutEntry {
  number: string;
  allocationGB: number;
  reason: string;
  type: "blocked" | "invalid" | "duplicate" | "in_flight" | "unavailable";
}

export interface ValidBatchEntry {
  phoneNumber: string;
  rawNumber: string;
  network: string;
  gbAmount: number;
  packageId: string;
  packageName: string;
  price: number;
}

/**
 * Validates, deduplicates, and filters batch entries against:
 * 1. Valid Ghanaian mobile number format
 * 2. Blocked numbers list (BlockedMtnNumber status: REJECTED)
 * 3. Intra-batch duplicates
 * 4. Active in-flight orders for the same recipient
 * 5. Available active DataPackages
 */
export async function validateAndFilterBatchEntries(
  entries: BatchEntryInput[],
  defaultNetwork?: string,
  user?: any
): Promise<{
  validEntries: ValidBatchEntry[];
  filteredOutEntries: FilteredOutEntry[];
}> {
  const validEntries: ValidBatchEntry[] = [];
  const filteredOutEntries: FilteredOutEntry[] = [];
  const seenNumbers = new Set<string>();

  // Fetch rejected/blocked numbers
  const blockedRows = await prisma.blockedMtnNumber.findMany({
    where: { status: "REJECTED" },
    select: { normalizedNumber: true },
  });
  const blockedSet = new Set(blockedRows.map((b) => b.normalizedNumber));

  // Fetch all active packages for pricing/resolution
  const activePackages = await prisma.dataPackage.findMany({
    where: { active: true },
  });

  for (const entry of entries) {
    const rawNumber = String(entry.number || entry.phoneNumber || entry.recipient || "").trim();
    const rawAlloc = entry.allocationGB ?? entry.gbAmount ?? 0;
    const alloc = typeof rawAlloc === "number" ? rawAlloc : parseFloat(String(rawAlloc)) || 0;

    // 1. Phone number format validation
    const phoneValidation = phoneSchema.safeParse(rawNumber);
    if (!phoneValidation.success) {
      filteredOutEntries.push({
        number: rawNumber || "unknown",
        allocationGB: alloc,
        reason: "Invalid Ghanaian phone number format",
        type: "invalid",
      });
      continue;
    }

    const normalizedPhone = phoneValidation.data;

    // 2. Intra-batch deduplication
    if (seenNumbers.has(normalizedPhone)) {
      filteredOutEntries.push({
        number: rawNumber,
        allocationGB: alloc,
        reason: "Duplicate recipient number in submission batch",
        type: "duplicate",
      });
      continue;
    }
    seenNumbers.add(normalizedPhone);

    // 3. Blocked numbers check
    if (blockedSet.has(normalizedPhone)) {
      filteredOutEntries.push({
        number: rawNumber,
        allocationGB: alloc,
        reason: "Number is blocked by provider",
        type: "blocked",
      });
      continue;
    }

    // 4. Data allocation validity
    if (alloc <= 0) {
      filteredOutEntries.push({
        number: rawNumber,
        allocationGB: alloc,
        reason: "Invalid data allocation amount (allocationGB must be greater than 0)",
        type: "invalid",
      });
      continue;
    }

    // 5. Network resolution
    const net = (
      entry.network ||
      defaultNetwork ||
      detectNetworkNameByPrefix(normalizedPhone) ||
      "MTN"
    )
      .toUpperCase()
      .trim();

    // 6. Matching active package resolution
    let matchedPkg = activePackages.find(
      (p) => p.network.toUpperCase() === net && Math.abs(p.gbAmount - alloc) < 0.01
    );

    if (!matchedPkg && entry.packageId) {
      matchedPkg = activePackages.find((p) => p.id === entry.packageId);
    }

    if (!matchedPkg) {
      filteredOutEntries.push({
        number: rawNumber,
        allocationGB: alloc,
        reason: `No active ${net} package available for ${alloc}GB`,
        type: "unavailable",
      });
      continue;
    }

    // 7. Active in-flight check
    const inFlight = await prisma.order.findFirst({
      where: {
        phoneNumber: normalizedPhone,
        status: { in: ["PENDING", "PROCESSING"] },
      },
      select: { id: true, status: true },
    });

    if (inFlight) {
      filteredOutEntries.push({
        number: rawNumber,
        allocationGB: alloc,
        reason: `Recipient currently has an active order in ${inFlight.status.toLowerCase()} status`,
        type: "in_flight",
      });
      continue;
    }

    // 8. Wholesale price resolution
    let price = 0;
    if (user) {
      price = await resolveUserWholesalePrice(user, matchedPkg);
    }
    if (!price || price <= 0) {
      price = matchedPkg.retailPriceGHS ?? 0;
    }

    validEntries.push({
      phoneNumber: normalizedPhone,
      rawNumber,
      network: matchedPkg.network,
      gbAmount: matchedPkg.gbAmount,
      packageId: matchedPkg.id,
      packageName: matchedPkg.name,
      price,
    });
  }

  return { validEntries, filteredOutEntries };
}

/**
 * Maps DB statuses to Clickyfied public API statuses
 */
export function mapApiOrderStatus(status: string, isSandbox = false): string {
  const upper = (status || "").toUpperCase();
  if (isSandbox) {
    if (upper === "SUCCESS" || upper === "COMPLETED") return "TEST_COMPLETED";
    return upper;
  }
  if (upper === "SUCCESS" || upper === "COMPLETED" || upper === "PROCESSED") return "processed";
  if (upper === "PROCESSING") return "processing";
  if (upper === "PENDING") return "pending";
  if (upper === "FAILED") return "failed";
  if (upper === "REFUNDED" || upper === "CANCELLED") return upper.toLowerCase();
  return upper.toLowerCase();
}

/**
 * Calculates aggregate status for an entire batch of orders
 */
export function calculateBatchStatus(orders: Array<{ status: string }>): string {
  if (orders.length === 0) return "pending";
  const statuses = orders.map((o) => o.status.toUpperCase());
  const allCompleted = statuses.every((s) => s === "SUCCESS" || s === "COMPLETED" || s === "PROCESSED");
  if (allCompleted) return "processed";

  const allFailed = statuses.every((s) => s === "FAILED" || s === "CANCELLED" || s === "REFUNDED");
  if (allFailed) return "failed";

  const anyProcessing = statuses.some((s) => s === "PROCESSING");
  if (anyProcessing) return "processing";

  return "pending";
}

/**
 * Formats a batch order response matching Clickyfied and TSK developer specs
 */
export function formatBatchOrderPayload({
  batchCode,
  externalReference,
  orders,
  filteredOutEntries,
  cost,
  reused = false,
  message = "Order submitted successfully",
  isSandbox = false,
  createdAt,
  updatedAt,
}: {
  batchCode: string;
  externalReference: string;
  orders: Array<{
    id: number;
    phoneNumber: string;
    gbAmount: number;
    amount?: number;
    status: string;
    failureReason?: string | null;
    createdAt?: Date;
    completedAt?: Date | null;
    updatedAt?: Date;
  }>;
  filteredOutEntries?: FilteredOutEntry[];
  cost: number;
  reused?: boolean;
  message?: string;
  isSandbox?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  const publicOrderId = `API-${batchCode}`;
  const batchStatus = calculateBatchStatus(orders);
  const totalCount = orders.length;
  const processedCount = orders.filter((o) => o.status === "SUCCESS" || o.status === "COMPLETED").length;

  const entriesFormatted = orders.map((o) => ({
    id: o.id,
    number: o.phoneNumber,
    allocationGB: o.gbAmount,
    status: mapApiOrderStatus(o.status, isSandbox),
    failureReason: sanitizeCustomerRefundNote(o.failureReason, o.amount ?? 0) || null,
    createdAt: o.createdAt ? o.createdAt.toISOString() : undefined,
    completedAt: o.completedAt ? o.completedAt.toISOString() : null,
  }));

  const orderObject = {
    orderId: publicOrderId,
    externalReference,
    status: batchStatus,
    totalCount,
    processedCount,
    createdAt: createdAt ? createdAt.toISOString() : new Date().toISOString(),
    updatedAt: updatedAt ? updatedAt.toISOString() : new Date().toISOString(),
    entries: entriesFormatted,
  };

  return {
    orderId: publicOrderId,
    batchCode,
    externalReference,
    status: batchStatus,
    cost: Math.round(cost * 100) / 100,
    estimatedCost: Math.round(cost * 100) / 100,
    totalCount,
    processedCount,
    reused,
    message,
    entries: entriesFormatted,
    filteredOutEntries: filteredOutEntries || [],
    order: orderObject,
  };
}

/**
 * Handles batch order submission for developer API endpoints
 */
export async function handleBatchOrderSubmission({
  authContext,
  body,
  requestId,
  idemKey,
  start,
  endpoint = "/v1/orders",
}: {
  authContext: any;
  body: any;
  requestId: string;
  idemKey: string | null;
  start: number;
  endpoint?: string;
}): Promise<NextResponse> {
  const entries: BatchEntryInput[] = body.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new ApiError("INVALID_REQUEST", "entries array cannot be empty", 400);
  }

  const rawReference = body.externalReference || body.reference;
  const reference = rawReference ? String(rawReference).trim() : null;

  // 1. Idempotency Key check
  if (idemKey) {
    const existingKey = await prisma.idempotencyKey.findUnique({
      where: { key: idemKey },
    });

    if (existingKey) {
      if (existingKey.orderId) {
        const existingOrder = await prisma.order.findUnique({
          where: { id: existingKey.orderId },
        });

        if (existingOrder?.batchId) {
          const batch = await prisma.orderBatch.findUnique({
            where: { id: existingOrder.batchId },
            include: { orders: { orderBy: { id: "asc" } } },
          });

          if (batch) {
            const payload = formatBatchOrderPayload({
              batchCode: batch.batchCode,
              externalReference: existingOrder.externalReference || batch.batchCode,
              orders: batch.orders,
              cost: batch.totalAmount,
              reused: true,
              message: "Order already submitted. Returning existing order.",
              isSandbox: existingOrder.isSandbox,
              createdAt: batch.createdAt,
              updatedAt: batch.updatedAt,
            });

            return formatApiSuccess(payload, requestId, 200, authContext.rateLimit);
          }
        }
      }

      if (existingKey.status === "PROCESSING") {
        throw new ApiError(
          "DUPLICATE_REQUEST",
          "A request with this Idempotency-Key is currently being processed. Please retry in a moment.",
          409
        );
      }
    } else {
      try {
        await prisma.idempotencyKey.create({
          data: {
            key: idemKey,
            userId: authContext.userId,
            status: "PROCESSING",
          },
        });
      } catch {
        const raceKey = await prisma.idempotencyKey.findUnique({
          where: { key: idemKey },
        });
        if (raceKey?.orderId) {
          const raceOrder = await prisma.order.findUnique({
            where: { id: raceKey.orderId },
          });
          if (raceOrder?.batchId) {
            const batch = await prisma.orderBatch.findUnique({
              where: { id: raceOrder.batchId },
              include: { orders: { orderBy: { id: "asc" } } },
            });
            if (batch) {
              const payload = formatBatchOrderPayload({
                batchCode: batch.batchCode,
                externalReference: raceOrder.externalReference || batch.batchCode,
                orders: batch.orders,
                cost: batch.totalAmount,
                reused: true,
                message: "Order already submitted. Returning existing order.",
                isSandbox: raceOrder.isSandbox,
                createdAt: batch.createdAt,
                updatedAt: batch.updatedAt,
              });
              return formatApiSuccess(payload, requestId, 200, authContext.rateLimit);
            }
          }
        }
        throw new ApiError(
          "DUPLICATE_REQUEST",
          "Concurrent duplicate request detected with this Idempotency-Key",
          409
        );
      }
    }
  }

  // 2. Duplicate external reference check
  if (reference) {
    const existingRef = await prisma.order.findFirst({
      where: {
        userId: authContext.userId,
        externalReference: reference,
        isSandbox: authContext.isSandbox,
      },
    });

    if (existingRef?.batchId) {
      const batch = await prisma.orderBatch.findUnique({
        where: { id: existingRef.batchId },
        include: { orders: { orderBy: { id: "asc" } } },
      });

      if (batch) {
        const payload = formatBatchOrderPayload({
          batchCode: batch.batchCode,
          externalReference: reference,
          orders: batch.orders,
          cost: batch.totalAmount,
          reused: true,
          message: "Order already submitted. Returning existing order.",
          isSandbox: existingRef.isSandbox,
          createdAt: batch.createdAt,
          updatedAt: batch.updatedAt,
        });

        return formatApiSuccess(payload, requestId, 200, authContext.rateLimit);
      }
    }
  }

  // 3. User resolution
  const user = await prisma.user.findUnique({
    where: { id: authContext.userId },
    select: { id: true, role: true, pricingProfileId: true, balance: true },
  });

  if (!user) {
    throw new ApiError("FORBIDDEN", "User account not found", 403);
  }

  // 4. Validate and filter entries
  const { validEntries, filteredOutEntries } = await validateAndFilterBatchEntries(
    entries,
    body.network,
    user
  );

  // If ALL entries are filtered out, return 400 Bad Request
  if (validEntries.length === 0) {
    if (idemKey) {
      await prisma.idempotencyKey.deleteMany({
        where: { key: idemKey, status: "PROCESSING" },
      }).catch(() => undefined);
    }

    return NextResponse.json(
      {
        success: false,
        error: "All entries in the batch were filtered out (blocked numbers, active in-progress orders, or invalid formats).",
        code: "ALL_ENTRIES_FILTERED",
        filteredOutEntries,
        requestId,
      },
      { status: 400 }
    );
  }

  // 5. Total cost & balance check
  const totalCost = validEntries.reduce((sum, e) => sum + e.price, 0);

  if (!authContext.isSandbox) {
    if ((user.balance ?? 0) < totalCost) {
      if (idemKey) {
        await prisma.idempotencyKey.deleteMany({
          where: { key: idemKey, status: "PROCESSING" },
        }).catch(() => undefined);
      }
      throw new ApiError(
        "INSUFFICIENT_BALANCE",
        `Insufficient wallet balance. Batch requires GHS ${totalCost.toFixed(2)}, available: GHS ${(user.balance ?? 0).toFixed(2)}`,
        402
      );
    }
  }

  // 6. Transactionally create OrderBatch and individual Order records
  const batchCode = await nextBatchCode();
  const batchNetwork = validEntries[0]?.network || "MTN";
  const totalGb = validEntries.reduce((sum, e) => sum + e.gbAmount, 0);
  const finalRef = reference || batchCode;

  let result: { orderBatch: any; createdOrders: any[] };
  try {
    result = await prisma.$transaction(async (tx) => {
      if (!authContext.isSandbox) {
        const debited = await tx.user.updateMany({
          where: {
            id: authContext.userId,
            balance: { gte: totalCost },
            status: "ACTIVE",
          },
          data: {
            balance: { decrement: totalCost },
          },
        });

        if (debited.count === 0) {
          throw new ApiError(
            "INSUFFICIENT_BALANCE",
            `Insufficient wallet balance. Batch requires GHS ${totalCost.toFixed(2)}, available: GHS ${(user.balance ?? 0).toFixed(2)}`,
            402
          );
        }
      }

      const orderBatch = await tx.orderBatch.create({
        data: {
          batchCode,
          userId: authContext.userId,
          network: batchNetwork,
          totalRecipients: validEntries.length,
          totalGb,
          totalAmount: totalCost,
          status: "PENDING",
        },
      });

      const createdOrders: any[] = [];
      for (const entry of validEntries) {
        const order = await tx.order.create({
          data: {
            userId: authContext.userId,
            batchId: orderBatch.id,
            phoneNumber: entry.phoneNumber,
            network: entry.network,
            packageId: entry.packageId,
            gbAmount: entry.gbAmount,
            amount: entry.price,
            status: "PENDING",
            source: "API",
            externalReference: finalRef,
            apiCredentialId: authContext.credentialId,
            isSandbox: authContext.isSandbox,
            completedAt: null,
          },
        });

        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            status: "PENDING",
            note: authContext.isSandbox ? "Sandbox batch test order accepted via API" : "Batch order accepted via API",
            changedBy: authContext.credentialId ? `api_key:${authContext.credentialId}` : "api",
          },
        });

        createdOrders.push(order);
      }

      if (!authContext.isSandbox) {
        await tx.walletTransaction.create({
          data: {
            userId: authContext.userId,
            type: "DEBIT",
            amount: totalCost,
            status: "APPROVED",
            reference: `api_batch:${orderBatch.batchCode}`,
            note: `API Batch Order ${orderBatch.batchCode} (${validEntries.length} recipients, ${totalGb}GB)`,
          },
        });
      }

      if (idemKey && createdOrders.length > 0) {
        await tx.idempotencyKey.upsert({
          where: { key: idemKey },
          create: {
            key: idemKey,
            userId: authContext.userId,
            orderId: createdOrders[0].id,
            status: "COMPLETED",
          },
          update: {
            orderId: createdOrders[0].id,
            status: "COMPLETED",
          },
        });
      }

      return { orderBatch, createdOrders };
    }, { maxWait: 15000, timeout: 30000 });
  } catch (createErr: any) {
    if (idemKey) {
      await prisma.idempotencyKey.deleteMany({
        where: { key: idemKey, status: "PROCESSING" },
      }).catch(() => undefined);
    }
    if (createErr instanceof ApiError) throw createErr;
    console.error("Batch order creation error:", createErr);
    throw new ApiError("SERVER_ERROR", "Failed to record batch order in database.", 500);
  }

  // 7. Dispatch Webhook Event (asynchronously)
  dispatchWebhookEvent(
    authContext.userId,
    "order.created",
    {
      orderId: `API-${result.orderBatch.batchCode}`,
      batchCode: result.orderBatch.batchCode,
      reference: finalRef,
      network: batchNetwork,
      totalCount: result.createdOrders.length,
      totalGb,
      amount: totalCost,
      status: "PENDING",
      isSandbox: authContext.isSandbox,
      createdAt: result.orderBatch.createdAt,
    },
    result.createdOrders[0]?.id
  ).catch(() => undefined);

  // 8. Auto-dispatch triggering if provider routing is enabled
  try {
    const { getProviderRoutingConfig, dispatchOrder, shouldAutoDispatch } = await import("@/lib/provider-apis/router");
    const config = await getProviderRoutingConfig();
    if (shouldAutoDispatch(config)) {
      if (batchNetwork.toUpperCase().startsWith("MTN")) {
        const { checkAndTriggerMtnBatch } = await import("@/lib/provider-apis/clickyfied-batch");
        checkAndTriggerMtnBatch("THRESHOLD").catch((err) => {
          console.error("Batch auto-dispatch MTN trigger error:", err);
        });
      } else {
        for (const ord of result.createdOrders) {
          dispatchOrder(ord.id).catch((err) => {
            console.error(`Batch auto-dispatch failed for order #${ord.id}:`, err);
          });
        }
      }
    }
  } catch (err) {
    console.error("Batch auto-dispatch routing error:", err);
  }

  // 9. Log API request and return 201 Created
  await logApiRequestEntry({
    userId: authContext.userId,
    credentialId: authContext.credentialId,
    endpoint,
    method: "POST",
    status: 201,
    success: true,
    ip: authContext.clientIp,
    userAgent: authContext.userAgent,
    environment: authContext.environment,
    responseTimeMs: Date.now() - start,
    requestId,
  });

  const payload = formatBatchOrderPayload({
    batchCode: result.orderBatch.batchCode,
    externalReference: finalRef,
    orders: result.createdOrders,
    filteredOutEntries,
    cost: totalCost,
    isSandbox: authContext.isSandbox,
    createdAt: result.orderBatch.createdAt,
    updatedAt: result.orderBatch.updatedAt,
  });

  return formatApiSuccess(payload, requestId, 201, authContext.rateLimit);
}

