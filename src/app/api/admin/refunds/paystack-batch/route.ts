import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { changeOrderStatus } from "@/lib/orders";
import { executeStorefrontPaystackRefund, storefrontOrderCode } from "@/lib/storefront";
import { isPaystackConfigured } from "@/lib/paystack";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";

function parseReferenceList(raw: string): string[] {
  const tokens = raw
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
  return Array.from(new Set(tokens));
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireStaff();
    const body = await request.json().catch(() => ({}));
    const action = body.action === "execute" ? "execute" : "preview";

    if (action === "preview") {
      const text = typeof body.text === "string" ? body.text : "";
      const refs = parseReferenceList(text);
      if (refs.length === 0) {
        return apiError(400, "Please paste at least one Paystack reference (e.g. GH-... or STF-...).");
      }

      const lookupRefs = Array.from(
        new Set([...refs, ...refs.map((r) => r.toUpperCase()), ...refs.map((r) => r.toLowerCase())])
      );

      const found = await prisma.storefrontOrder.findMany({
        where: { paymentReference: { in: lookupRefs } },
        include: {
          underlyingOrder: {
            select: { id: true, status: true, phoneNumber: true, network: true, gbAmount: true },
          },
          storefront: { select: { name: true, slug: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      const foundByRefLower = new Map<string, (typeof found)[0]>();
      for (const row of found) {
        foundByRefLower.set(row.paymentReference.toLowerCase(), row);
      }

      const unmatched: string[] = [];
      for (const r of refs) {
        if (!foundByRefLower.has(r.toLowerCase())) {
          unmatched.push(r);
        }
      }

      const matched = found.map((so) => {
        const psStatus = (so.paystackRefundStatus || "").toUpperCase();
        const alreadyPaystackRefunded =
          Boolean(so.paystackRefundId) ||
          psStatus === "PENDING" ||
          psStatus === "PROCESSING" ||
          psStatus === "PROCESSED";

        return {
          storefrontOrderId: so.id,
          orderId: so.underlyingOrderId,
          orderCode: storefrontOrderCode(so.seq, null),
          paymentReference: so.paymentReference,
          customerPhone: so.underlyingOrder?.phoneNumber || so.customerPhone,
          network: so.underlyingOrder?.network || "—",
          gbAmount: so.underlyingOrder?.gbAmount ?? null,
          sellingPriceGhs: so.sellingPrice / 100,
          orderStatus: so.underlyingOrder?.status || so.status,
          storefrontName: so.storefront?.name || null,
          paystackRefundId: so.paystackRefundId || null,
          paystackRefundStatus: so.paystackRefundStatus || null,
          paystackRefundAmountGhs: so.paystackRefundAmount ? so.paystackRefundAmount / 100 : null,
          paystackRefundError: so.paystackRefundError || null,
          alreadyPaystackRefunded,
          eligible: !alreadyPaystackRefunded,
          createdAt: so.createdAt.toISOString(),
        };
      });

      return NextResponse.json({
        success: true,
        totalParsed: refs.length,
        matched,
        unmatched,
      });
    }

    // action === "execute"
    if (!(await isPaystackConfigured())) {
      return apiError(400, "Paystack is not configured (missing secret key in Settings).");
    }

    const storefrontOrderIds: string[] = Array.isArray(body.storefrontOrderIds)
      ? body.storefrontOrderIds.map((id: any) => String(id).trim()).filter(Boolean)
      : [];
    const reason =
      typeof body.reason === "string" && body.reason.trim()
        ? body.reason.trim()
        : "Paystack batch reference refund";

    if (storefrontOrderIds.length === 0) {
      return apiError(400, "Please select at least one storefront order to refund.");
    }

    const storeOrders = await prisma.storefrontOrder.findMany({
      where: { id: { in: storefrontOrderIds } },
      include: {
        underlyingOrder: { select: { id: true, status: true } },
      },
    });

    let sentCount = 0;
    let alreadyRefundedCount = 0;
    let failedCount = 0;
    const refundedOrderIds: string[] = [];
    const errors: Array<{ reference: string; error: string }> = [];

    for (const so of storeOrders) {
      const psRes = await executeStorefrontPaystackRefund(so, reason);

      if (psRes.alreadyRefunded) {
        alreadyRefundedCount++;
      } else if (psRes.refunded) {
        sentCount++;
        refundedOrderIds.push(so.id);
      } else {
        failedCount++;
        errors.push({
          reference: so.paymentReference,
          error: psRes.error || "Paystack refund failed",
        });
      }

      // Ensure underlying order is also marked REFUNDED if Paystack refund succeeded
      if (
        (psRes.refunded || psRes.alreadyRefunded) &&
        so.underlyingOrderId &&
        so.underlyingOrder?.status !== "REFUNDED"
      ) {
        await changeOrderStatus(
          so.underlyingOrderId,
          "REFUNDED",
          reason,
          { id: actor.id, label: actor.email },
          { force: true }
        ).catch(() => {});
      }
    }

    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: "storefront.paystack_batch_refund",
      target: `storefront_orders:${refundedOrderIds.join(",")}`,
      newValue: JSON.stringify({
        requested: storefrontOrderIds.length,
        sentCount,
        alreadyRefundedCount,
        failedCount,
        reason,
      }),
    });

    return NextResponse.json({
      success: true,
      sentCount,
      alreadyRefundedCount,
      failedCount,
      refundedOrderIds,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
