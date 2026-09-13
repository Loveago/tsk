import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiKey, ApiKeyError, logApiRequest } from "@/lib/api-auth";
import { publicOrderSchema } from "@/lib/validation";
import { changeOrderStatus, isOrderProcessingHalted } from "@/lib/orders";
import { validateMtnOrderRecipient } from "@/lib/mtn-verification";
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

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return fail(request, keyId, endpoint, 403, "Account not found");

    const tier = user.pricingProfileId
      ? await prisma.priceTier.findUnique({
          where: {
            profileId_gbAmount: { profileId: user.pricingProfileId, gbAmount: pkg.gbAmount },
          },
        })
      : null;

    const amount = tier?.priceGHS ?? pkg.retailPriceGHS ?? 0;
    if (amount <= 0) return fail(request, keyId, endpoint, 400, "No price configured for this package");

    // Central MTN Number Verification Check (§16, §17)
    const network = input.network ?? pkg.network;
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

    // Atomic balance decrement
    const debited = await prisma.user.updateMany({
      where: { id: userId, balance: { gte: amount }, status: "ACTIVE" },
      data: { balance: { decrement: amount } },
    });
    if (debited.count === 0) {
      if (idemKey) {
        await prisma.idempotencyKey.update({
          where: { key: idemKey },
          data: { status: "FAILED", response: "Insufficient balance" },
        });
      }
      return fail(request, keyId, endpoint, 402, "Insufficient wallet balance. Top up and retry.");
    }

    try {
      const order = await prisma.order.create({
        data: {
          userId,
          phoneNumber: input.phoneNumber,
          network: input.network ?? pkg.network,
          packageId: pkg.id,
          gbAmount: pkg.gbAmount,
          amount,
          status: "PENDING",
          source: "API",
        },
      });

      await prisma.walletTransaction.create({
        data: { userId, type: "DEBIT", amount, status: "APPROVED", reference: `order:${order.id}` },
      });

      await changeOrderStatus(order.id, "PROCESSING", "Accepted via API", {
        id: keyId ?? "api",
        label: "api",
      });

      if (idemKey) {
        await prisma.idempotencyKey
          .update({
            where: { key: idemKey },
            data: { orderId: order.id, status: "COMPLETED" },
          })
          .catch(() => undefined);
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
      // Refund on failure
      await prisma.user
        .update({ where: { id: userId }, data: { balance: { increment: amount } } })
        .catch(() => undefined);
      if (idemKey) {
        await prisma.idempotencyKey
          .update({
            where: { key: idemKey },
            data: { status: "FAILED", response: "Order creation failed" },
          })
          .catch(() => undefined);
      }
      return fail(request, keyId, endpoint, 500, "Order creation failed. Balance refunded.");
    }
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

