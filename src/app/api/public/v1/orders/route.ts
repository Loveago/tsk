import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiKey, ApiKeyError, logApiRequest } from "@/lib/api-auth";
import { publicOrderSchema } from "@/lib/validation";
import { changeOrderStatus, isOrderProcessingHalted, isNetworkOrdersPaused, getPricingForProfile, resolveUserWholesalePrice } from "@/lib/orders";
import { validateMtnOrderRecipient } from "@/lib/mtn-verification";
import { isPhoneNumberBlocked } from "@/lib/blocked-numbers";
import { detectNetworkNameByPrefix } from "@/lib/phone-utils";
import { handleRouteError } from "@/lib/api-helpers";
import { z } from "zod";

const ipOf = (req: NextRequest) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

const fail = async (
  req: NextRequest,
  keyId: string | null,
  endpoint: string,
  status: number,
  error: string
) => {
  await logApiRequest(keyId, endpoint, "POST", status, false, ipOf(req));
  return NextResponse.json({ success: false, error }, { status });
};

export async function POST(request: NextRequest) {
  const endpoint = "/api/public/v1/orders";
  try {
    const { keyId, userId } = await requireApiKey(request);
    const body = await request.json();
    const input = publicOrderSchema.parse(body);

    const halted = await isOrderProcessingHalted();
    if (halted) return fail(request, keyId, endpoint, 503, "Order processing is temporarily halted. Try again later.");

    // Idempotency: same key returns the original response
    const idemKey = request.headers.get("Idempotency-Key");
    if (idemKey) {
      const existing = await prisma.idempotencyKey.findUnique({ where: { key: idemKey } });
      if (existing) {
        if (existing.userId !== userId) {
          return fail(request, keyId, endpoint, 409, "Idempotency-Key already in use");
        }
        if (existing.orderId) {
          const order = await prisma.order.findUnique({ where: { id: existing.orderId } });
          return NextResponse.json({
            success: true,
            replayed: true,
            order: {
              id: order?.id, status: order?.status, amount: order?.amount,
              network: order?.network, gbAmount: order?.gbAmount,
              phoneNumber: order?.phoneNumber, createdAt: order?.createdAt,
            },
          });
        }
        if (existing.status === "PROCESSING") {
          return NextResponse.json({ success: false, error: "Request still being processed" }, { status: 409 });
        }
        return NextResponse.json(
          { success: false, error: existing.response ?? "Request failed", replayed: true },
          { status: 400 }
        );
      }
      await prisma.idempotencyKey.create({
        data: { key: idemKey, userId, status: "PROCESSING" },
      });
    }

    // Resolve package + price (tier from user's profile falls back to retail)
    const pkg = await prisma.dataPackage.findUnique({
      where: { id: input.packageId },
    });
    if (!pkg || !pkg.active) return fail(request, keyId, endpoint, 400, "Package not found or inactive");
    if (await isNetworkOrdersPaused(pkg.network)) {
      return fail(request, keyId, endpoint, 503, `${pkg.network} orders are temporarily paused by administrator for maintenance.`);
    }


    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return fail(request, keyId, endpoint, 403, "Account not found");

    let network = pkg.network;
    if (input.network && input.network !== pkg.network) {
      const prefixNetwork = detectNetworkNameByPrefix(input.phoneNumber);
      const isPortedPrefixMatch = input.network === prefixNetwork;
      if (!isPortedPrefixMatch) {
        return fail(
          request,
          keyId,
          endpoint,
          400,
          `Selected package belongs to ${pkg.network}, but ${input.network} was requested`
        );
      }
    }
    const amount = await resolveUserWholesalePrice(user, pkg);
    if (amount <= 0) return fail(request, keyId, endpoint, 400, "No price configured for this package");

    // Check if recipient number is blocked from purchasing on the system
    if (await isPhoneNumberBlocked(input.phoneNumber)) {
      const blockedMsg = `This phone number (${input.phoneNumber}) is blocked from purchasing on our system.`;
      if (idemKey) {
        await prisma.idempotencyKey.update({
          where: { key: idemKey },
          data: { status: "FAILED", response: blockedMsg },
        }).catch(() => undefined);
      }
      return fail(request, keyId, endpoint, 400, blockedMsg);
    }

    // Check if recipient number already has an active order
    const latestOrder = await prisma.order.findFirst({
      where: {
        phoneNumber: input.phoneNumber,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true },
    });
    if (latestOrder && (latestOrder.status === "PENDING" || latestOrder.status === "PROCESSING")) {
      return fail(
        request,
        keyId,
        endpoint,
        400,
        `Cannot place order for ${input.phoneNumber}: this number currently has an active order in ${latestOrder.status.toLowerCase()} status.`
      );
    }

    // Central MTN Number Verification Check (§16, §17)
    const mtnCheck = await validateMtnOrderRecipient(input.phoneNumber, network, userId);
    if (!mtnCheck.allowed) {
      if (idemKey) {
        await prisma.idempotencyKey.update({
          where: { key: idemKey },
          data: { status: "FAILED", response: mtnCheck.reason ?? "MTN number verification required" },
        }).catch(() => undefined);
      }
      return fail(request, keyId, endpoint, 422, mtnCheck.reason ?? "MTN number verification required");
    }

    let order: any;
    try {
      order = await prisma.$transaction(async (tx) => {
        // Atomic balance decrement
        const debited = await tx.user.updateMany({
          where: { id: userId, balance: { gte: amount }, status: "ACTIVE" },
          data: { balance: { decrement: amount } },
        });

        if (debited.count === 0) {
          throw new Error("INSUFFICIENT_BALANCE");
        }

        const createdOrder = await tx.order.create({
          data: {
            userId,
            phoneNumber: input.phoneNumber,
            network: input.network ?? pkg.network,
            packageId: pkg.id,
            gbAmount: pkg.gbAmount,
            amount,
            status: "PENDING",
            source: "API",
            isSandbox: false,
          },
        });

        await tx.walletTransaction.create({
          data: {
            userId,
            type: "DEBIT",
            amount,
            status: "APPROVED",
            reference: `order:${createdOrder.id}`,
            note: `API Order #${createdOrder.id} (${pkg.network} ${pkg.gbAmount}GB) · ${input.phoneNumber}`,
          },
        });

        await tx.orderStatusHistory.create({
          data: {
            orderId: createdOrder.id,
            status: "PENDING",
            note: "Order accepted via API",
            changedBy: keyId ? `api_key:${keyId}` : "api",
          },
        });

        if (idemKey) {
          await tx.idempotencyKey.upsert({
            where: { key: idemKey },
            create: { key: idemKey, userId, orderId: createdOrder.id, status: "COMPLETED" },
            update: { orderId: createdOrder.id, status: "COMPLETED" },
          });
        }

        return createdOrder;
      });
    } catch (err: any) {
      if (err?.message === "INSUFFICIENT_BALANCE") {
        if (idemKey) {
          await prisma.idempotencyKey.update({
            where: { key: idemKey },
            data: { status: "FAILED", response: "Insufficient balance" },
          }).catch(() => undefined);
        }
        return fail(request, keyId, endpoint, 402, "Insufficient wallet balance. Top up and retry.");
      }

      if (idemKey) {
        await prisma.idempotencyKey
          .update({
            where: { key: idemKey },
            data: { status: "FAILED", response: "Order creation failed" },
          })
          .catch(() => undefined);
      }
      return fail(request, keyId, endpoint, 500, "Failed to create order");
    }

    // Automatically dispatch to configured provider API (or Clickify sandbox)
    try {
      const { getProviderRoutingConfig, dispatchOrder, shouldAutoDispatch } = await import("@/lib/provider-apis/router");
      const config = await getProviderRoutingConfig();
      if (shouldAutoDispatch(config)) {
        dispatchOrder(order.id).catch((err) => {
          console.error(`Auto-dispatch failed for public v1 order #${order.id}:`, err);
        });
      }
    } catch (err) {
      console.error("Public v1 auto-dispatch check error:", err);
    }

    await logApiRequest(keyId, endpoint, "POST", 201, true, ipOf(request));
    return NextResponse.json(
      {
        success: true,
        order: {
          id: order.id, status: "PROCESSING", amount, network: order.network,
          gbAmount: order.gbAmount, phoneNumber: order.phoneNumber, createdAt: order.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof ApiKeyError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    if (err instanceof z.ZodError) {
      const first = err.issues[0];
      return NextResponse.json(
        {
          success: false,
          error: `Validation failed: ${first.path.join(".") || "body"} — ${first.message}`,
        },
        { status: 422 }
      );
    }
    return handleRouteError(err);
  }
}

