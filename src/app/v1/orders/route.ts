import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  validateApiAuth,
  formatApiSuccess,
  formatApiError,
  logApiRequestEntry,
  ApiError,
} from "@/lib/developer-api";
import { isOrderProcessingHalted, getDefaultProfileId } from "@/lib/orders";
import { dispatchWebhookEvent } from "@/lib/webhooks";
import { phoneSchema } from "@/lib/validation";
import { validateMtnOrderRecipient } from "@/lib/mtn-verification";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, Idempotency-Key, X-Request-ID",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function GET(request: NextRequest) {
  const start = Date.now();
  const endpoint = "/v1/orders";
  let requestId = "req_initial";
  let authContext: any = null;

  try {
    authContext = await validateApiAuth(request, { requiredScope: "orders:read" });
    requestId = authContext.requestId;

    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10) || 20));
    const statusParam = url.searchParams.get("status")?.trim().toUpperCase();
    const networkParam = url.searchParams.get("network")?.trim().toUpperCase();
    const referenceParam = url.searchParams.get("reference")?.trim();
    const recipientParam = url.searchParams.get("recipient")?.trim() || url.searchParams.get("phone")?.trim();
    const fromParam = url.searchParams.get("from")?.trim();
    const toParam = url.searchParams.get("to")?.trim();

    const where: any = {
      userId: authContext.userId,
      isSandbox: authContext.isSandbox,
    };

    if (statusParam) {
      const dbStatus = statusParam === "COMPLETED" ? "SUCCESS" : statusParam;
      where.status = dbStatus;
    }

    if (networkParam) {
      where.network = networkParam;
    }

    if (referenceParam) {
      where.externalReference = { contains: referenceParam };
    }

    if (recipientParam) {
      where.phoneNumber = { contains: recipientParam };
    }

    if (fromParam || toParam) {
      where.createdAt = {};
      if (fromParam) {
        const fromDate = new Date(fromParam);
        if (!isNaN(fromDate.getTime())) where.createdAt.gte = fromDate;
      }
      if (toParam) {
        const toDate = new Date(toParam);
        if (!isNaN(toDate.getTime())) where.createdAt.lte = toDate;
      }
    }

    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          dataPackage: { select: { name: true } },
        },
      }),
    ]);

    const formattedOrders = orders.map((o) => ({
      orderId: `CLK-${o.id}`,
      id: o.id,
      reference: o.externalReference || null,
      network: o.network,
      package: o.dataPackage?.name || `${o.gbAmount}GB`,
      gbAmount: o.gbAmount,
      recipient: o.phoneNumber,
      amount: o.amount,
      status: o.isSandbox ? (o.status === "SUCCESS" ? "TEST_COMPLETED" : o.status) : (o.status === "SUCCESS" ? "COMPLETED" : o.status),
      failureReason: o.failureReason || null,
      isSandbox: o.isSandbox,
      createdAt: o.createdAt.toISOString(),
      completedAt: o.completedAt?.toISOString() || null,
    }));

    const totalPages = Math.ceil(total / limit);

    await logApiRequestEntry({
      userId: authContext.userId,
      credentialId: authContext.credentialId,
      endpoint,
      method: "GET",
      status: 200,
      success: true,
      ip: authContext.clientIp,
      userAgent: authContext.userAgent,
      environment: authContext.environment,
      responseTimeMs: Date.now() - start,
      requestId,
    });

    return formatApiSuccess(
      {
        page,
        limit,
        total,
        totalPages,
        orders: formattedOrders,
      },
      requestId,
      200,
      authContext.rateLimit
    );
  } catch (err: any) {
    const status = err instanceof ApiError ? err.status : 500;
    const code = err instanceof ApiError ? err.code : "SERVER_ERROR";
    const message = err.message || "An unexpected error occurred";

    await logApiRequestEntry({
      userId: authContext?.userId,
      credentialId: authContext?.credentialId,
      endpoint,
      method: "GET",
      status,
      success: false,
      ip: authContext?.clientIp,
      userAgent: authContext?.userAgent,
      environment: authContext?.environment,
      errorCode: code,
      responseTimeMs: Date.now() - start,
      requestId,
    });

    return formatApiError(code, message, status, requestId, err.rateLimitInfo);
  }
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  const endpoint = "/v1/orders";
  let requestId = "req_initial";
  let authContext: any = null;
  let idemKey: string | null = null;

  try {
    authContext = await validateApiAuth(request, { requiredScope: "orders:create" });
    requestId = authContext.requestId;

    // Check system maintenance
    const halted = await isOrderProcessingHalted();
    if (halted) {
      throw new ApiError(
        "ORDER_PROCESSING_UNAVAILABLE",
        "Order processing is temporarily unavailable. Please try again later.",
        503
      );
    }

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      throw new ApiError("INVALID_REQUEST", "Request body must be valid JSON", 400);
    }

    // Scoped idempotency key to prevent cross-account collisions
    const rawIdemKey = request.headers.get("Idempotency-Key")?.trim() || null;
    idemKey = rawIdemKey ? `${authContext.userId}:${rawIdemKey}` : null;

    if (idemKey) {
      const existingKey = await prisma.idempotencyKey.findUnique({
        where: { key: idemKey },
      });

      if (existingKey) {
        if (existingKey.orderId) {
          const existingOrder = await prisma.order.findUnique({
            where: { id: existingKey.orderId },
            include: { dataPackage: true },
          });

          if (existingOrder) {
            const displayStatus = existingOrder.isSandbox
              ? (existingOrder.status === "SUCCESS" ? "TEST_COMPLETED" : existingOrder.status)
              : (existingOrder.status === "SUCCESS" ? "COMPLETED" : existingOrder.status);

            return formatApiSuccess(
              {
                orderId: `CLK-${existingOrder.id}`,
                reference: existingOrder.externalReference || null,
                network: existingOrder.network,
                package: existingOrder.dataPackage?.name || `${existingOrder.gbAmount}GB`,
                recipient: existingOrder.phoneNumber,
                amount: existingOrder.amount,
                status: displayStatus,
                replayed: true,
                createdAt: existingOrder.createdAt.toISOString(),
              },
              requestId,
              200,
              authContext.rateLimit
            );
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
              include: { dataPackage: true },
            });
            if (raceOrder) {
              const displayStatus = raceOrder.isSandbox
                ? (raceOrder.status === "SUCCESS" ? "TEST_COMPLETED" : raceOrder.status)
                : (raceOrder.status === "SUCCESS" ? "COMPLETED" : raceOrder.status);
              return formatApiSuccess(
                {
                  orderId: `CLK-${raceOrder.id}`,
                  reference: raceOrder.externalReference || null,
                  network: raceOrder.network,
                  package: raceOrder.dataPackage?.name || `${raceOrder.gbAmount}GB`,
                  recipient: raceOrder.phoneNumber,
                  amount: raceOrder.amount,
                  status: displayStatus,
                  replayed: true,
                  createdAt: raceOrder.createdAt.toISOString(),
                },
                requestId,
                200,
                authContext.rateLimit
              );
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

    // Check duplicate external reference for the same user if provided
    const reference = body.reference ? String(body.reference).trim() : null;
    if (reference) {
      const existingRef = await prisma.order.findFirst({
        where: {
          userId: authContext.userId,
          externalReference: reference,
          isSandbox: authContext.isSandbox,
        },
        include: { dataPackage: true },
      });
      if (existingRef) {
        const displayStatus = existingRef.isSandbox
          ? (existingRef.status === "SUCCESS" ? "TEST_COMPLETED" : existingRef.status)
          : (existingRef.status === "SUCCESS" ? "COMPLETED" : existingRef.status);
        return formatApiSuccess(
          {
            orderId: `CLK-${existingRef.id}`,
            reference: existingRef.externalReference || null,
            network: existingRef.network,
            package: existingRef.dataPackage?.name || `${existingRef.gbAmount}GB`,
            recipient: existingRef.phoneNumber,
            amount: existingRef.amount,
            status: displayStatus,
            replayed: true,
            createdAt: existingRef.createdAt.toISOString(),
          },
          requestId,
          200,
          authContext.rateLimit
        );
      }
    }

    // Recipient validation
    const rawRecipient = body.recipient || body.phoneNumber;
    if (!rawRecipient) {
      throw new ApiError("INVALID_RECIPIENT", "recipient or phoneNumber is required", 400);
    }

    const phoneValidation = phoneSchema.safeParse(rawRecipient);
    if (!phoneValidation.success) {
      throw new ApiError(
        "INVALID_RECIPIENT",
        "The recipient number is invalid. Enter a valid Ghanaian mobile number e.g. 0241234567",
        400
      );
    }
    const recipient = phoneValidation.data;

    // Validate network parameter if provided
    const requestedNetwork = body.network ? String(body.network).trim().toUpperCase() : null;
    if (requestedNetwork && !["MTN", "TELECEL", "AIRTELTIGO"].includes(requestedNetwork)) {
      throw new ApiError(
        "INVALID_NETWORK",
        `Unsupported network '${body.network}'. Supported networks are MTN, Telecel, AirtelTigo`,
        400
      );
    }

    // Package resolution
    const requestedPackageId = String(body.packageId || "").trim();
    if (!requestedPackageId) {
      throw new ApiError("INVALID_PACKAGE", "packageId is required", 400);
    }

    // Find package by ID, or slug (e.g. 'mtn-1gb'), or network + gbAmount
    let pkg = await prisma.dataPackage.findUnique({
      where: { id: requestedPackageId },
    });

    if (!pkg) {
      const slugMatch = requestedPackageId.match(/^([a-zA-Z]+)-([0-9.]+)gb$/i);
      if (slugMatch) {
        const net = slugMatch[1].toUpperCase();
        const gb = parseFloat(slugMatch[2]);
        pkg = await prisma.dataPackage.findUnique({
          where: { network_gbAmount: { network: net, gbAmount: gb } },
        });
      }
    }

    if (!pkg) {
      const allPkgs = await prisma.dataPackage.findMany({ where: { active: true } });
      pkg = allPkgs.find(
        (p) =>
          `${p.network.toLowerCase()}-${p.gbAmount}gb` === requestedPackageId.toLowerCase() ||
          p.id === requestedPackageId
      ) || null;
    }

    if (!pkg || !pkg.active) {
      throw new ApiError("INVALID_PACKAGE", "Package not found or currently inactive", 400);
    }

    if (requestedNetwork && pkg.network.toUpperCase() !== requestedNetwork) {
      throw new ApiError(
        "INVALID_NETWORK",
        `Selected package belongs to ${pkg.network}, but ${requestedNetwork} was requested`,
        400
      );
    }

    const netSetting = await prisma.systemSetting.findUnique({
      where: { key: `network_${pkg.network.toLowerCase()}_enabled` },
    });
    if (netSetting?.value === "false") {
      throw new ApiError(
        "ORDER_PROCESSING_UNAVAILABLE",
        `Order processing for network '${pkg.network}' is currently disabled. Please try again later.`,
        503
      );
    }

    // Resolve price server-side using pricing profile or default profile
    const user = await prisma.user.findUnique({
      where: { id: authContext.userId },
      select: { pricingProfileId: true, balance: true },
    });

    if (!user) {
      throw new ApiError("FORBIDDEN", "User account not found", 403);
    }

    let price = (pkg.retailPriceGHS != null && pkg.retailPriceGHS > 0) ? pkg.retailPriceGHS : 0;
    if (price <= 0) {
      if (user.pricingProfileId) {
        const tier = await prisma.priceTier.findUnique({
          where: {
            profileId_gbAmount: {
              profileId: user.pricingProfileId,
              gbAmount: pkg.gbAmount,
            },
          },
        });
        if (tier && tier.priceGHS > 0) {
          price = tier.priceGHS;
        }
      }
      if (price <= 0) {
        const defaultId = await getDefaultProfileId();
        if (defaultId) {
          const tier = await prisma.priceTier.findUnique({
            where: {
              profileId_gbAmount: {
                profileId: defaultId,
                gbAmount: pkg.gbAmount,
              },
            },
          });
          if (tier && tier.priceGHS > 0) {
            price = tier.priceGHS;
          }
        }
      }
    }

    if (price <= 0) {
      throw new ApiError("INVALID_PACKAGE", "No price configured for this package", 400);
    }

    // Central MTN Number Verification Check (§16, §17)
    const mtnCheck = await validateMtnOrderRecipient(
      recipient,
      pkg.network,
      authContext.userId
    );
    if (!mtnCheck.allowed) {
      throw new ApiError(
        "MTN_NUMBER_NOT_VERIFIED",
        mtnCheck.reason ?? "This MTN number has not been verified yet. Please submit the number for verification before purchasing an MTN package.",
        422
      );
    }

    // Transactionally create order and deduct balance
    let createdOrder: any = null;
    try {
      createdOrder = await prisma.$transaction(async (tx) => {
        if (!authContext.isSandbox) {
          const debited = await tx.user.updateMany({
            where: {
              id: authContext.userId,
              balance: { gte: price },
              status: "ACTIVE",
            },
            data: {
              balance: { decrement: price },
            },
          });

          if (debited.count === 0) {
            throw new ApiError(
              "INSUFFICIENT_BALANCE",
              `Insufficient wallet balance. Order requires GHS ${price.toFixed(2)}, available: GHS ${(user.balance ?? 0).toFixed(2)}`,
              402
            );
          }
        }

        const order = await tx.order.create({
          data: {
            userId: authContext.userId,
            phoneNumber: recipient,
            network: pkg!.network,
            packageId: pkg!.id,
            gbAmount: pkg!.gbAmount,
            amount: price,
            status: authContext.isSandbox ? "SUCCESS" : "PENDING",
            source: "API",
            externalReference: reference,
            apiCredentialId: authContext.credentialId,
            isSandbox: authContext.isSandbox,
            completedAt: authContext.isSandbox ? new Date() : null,
          },
        });

        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            status: authContext.isSandbox ? "SUCCESS" : "PENDING",
            note: authContext.isSandbox ? "Sandbox test order" : "Order accepted via API",
            changedBy: authContext.credentialId ? `api_key:${authContext.credentialId}` : "api",
          },
        });

        if (!authContext.isSandbox) {
          await tx.walletTransaction.create({
            data: {
              userId: authContext.userId,
              type: "DEBIT",
              amount: price,
              status: "APPROVED",
              reference: `api_order:${order.id}`,
              note: `API Order CLK-${order.id} (${pkg!.name})`,
            },
          });
        }

        if (idemKey) {
          await tx.idempotencyKey.upsert({
            where: { key: idemKey },
            create: {
              key: idemKey,
              userId: authContext.userId,
              orderId: order.id,
              status: "COMPLETED",
            },
            update: {
              orderId: order.id,
              status: "COMPLETED",
            },
          });
        }

        return order;
      });
    } catch (createErr: any) {
      if (idemKey) {
        await prisma.idempotencyKey
          .update({
            where: { key: idemKey },
            data: { status: "FAILED", response: createErr.message || "Order creation failed" },
          })
          .catch(() => undefined);
      }
      if (createErr instanceof ApiError) {
        throw createErr;
      }
      throw new ApiError("SERVER_ERROR", "Failed to record order in database.", 500);
    }

    const responseStatus = authContext.isSandbox ? "TEST_COMPLETED" : "PENDING";

    // Dispatch order.created webhook event
    dispatchWebhookEvent(
      authContext.userId,
      "order.created",
      {
        orderId: `CLK-${createdOrder.id}`,
        reference: createdOrder.externalReference || null,
        network: createdOrder.network,
        package: pkg.name,
        gbAmount: createdOrder.gbAmount,
        amount: createdOrder.amount,
        phoneNumber: createdOrder.phoneNumber,
        status: responseStatus === "TEST_COMPLETED" ? "TEST_COMPLETED" : "PENDING",
        isSandbox: createdOrder.isSandbox,
        createdAt: createdOrder.createdAt,
        completedAt: createdOrder.completedAt,
      },
      createdOrder.id
    ).catch(() => undefined);

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

    return formatApiSuccess(
      {
        orderId: `CLK-${createdOrder.id}`,
        reference: createdOrder.externalReference || null,
        network: createdOrder.network,
        package: pkg.name,
        recipient: createdOrder.phoneNumber,
        amount: createdOrder.amount,
        status: responseStatus,
        createdAt: createdOrder.createdAt.toISOString(),
      },
      requestId,
      201,
      authContext.rateLimit
    );
  } catch (err: any) {
    if (idemKey) {
      await prisma.idempotencyKey
        .deleteMany({
          where: { key: idemKey, status: "PROCESSING" },
        })
        .catch(() => undefined);
    }

    const status = err instanceof ApiError ? err.status : 500;
    const code = err instanceof ApiError ? err.code : "SERVER_ERROR";
    const message = err.message || "An unexpected error occurred";

    await logApiRequestEntry({
      userId: authContext?.userId,
      credentialId: authContext?.credentialId,
      endpoint,
      method: "POST",
      status,
      success: false,
      ip: authContext?.clientIp,
      userAgent: authContext?.userAgent,
      environment: authContext?.environment,
      errorCode: code,
      responseTimeMs: Date.now() - start,
      requestId,
    });

    return formatApiError(code, message, status, requestId, err.rateLimitInfo);
  }
}
