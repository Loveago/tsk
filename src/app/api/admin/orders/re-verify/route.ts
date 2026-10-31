import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { normalizeGhanaPhoneNumber } from "@/lib/mtn-verification";
import { z } from "zod";

const schema = z.object({
  orderIds: z.array(z.number()).min(1).max(500),
});

export async function POST(request: NextRequest) {
  try {
    const actor = await requireStaff();
    const body = await request.json();
    const { orderIds } = schema.parse(body);

    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, phoneNumber: true, network: true, isUnverified: true, providerReference: true },
    });

    if (orders.length === 0) {
      return apiError(404, "No matching orders found.");
    }

    const mtnCanonicalList = Array.from(
      new Set(orders.map((o) => normalizeGhanaPhoneNumber(o.phoneNumber)))
    );

    // 1. Check local AcceptedMtnNumber
    const acceptedRows = await prisma.acceptedMtnNumber.findMany({
      where: { normalizedNumber: { in: mtnCanonicalList } },
      select: { normalizedNumber: true },
    });
    const acceptedSet = new Set(acceptedRows.map((r) => r.normalizedNumber));

    // 2. Check Clickyfied if enabled
    const pending = mtnCanonicalList.filter((canon) => !acceptedSet.has(canon));
    if (pending.length > 0) {
      const clickyfiedSetting = await prisma.systemSetting.findUnique({
        where: { key: "clickyfied_mtn_verification_enabled" },
      });
      if (clickyfiedSetting?.value === "true") {
        try {
          const { getProviderRoutingConfig } = await import("@/lib/provider-apis/router");
          const { ClickyfiedClient } = await import("@/lib/provider-apis/clickyfied");
          const { addAcceptedMtnNumber } = await import("@/lib/mtn-verification");
          const config = await getProviderRoutingConfig();
          const client = new ClickyfiedClient(config.clickyfied);

          const res = await client.verifyNumbers(pending);
          const validNorms = new Set(res.validNumbers.map((n) => normalizeGhanaPhoneNumber(n)));

          for (const num of pending) {
            if (validNorms.has(num)) {
              await addAcceptedMtnNumber(num, "CLICKYFIED_API", `Manual Re-check by ${actor.email}`).catch(() => {});
              acceptedSet.add(num);
            }
          }
        } catch (err) {
          console.error("Clickyfied re-verification error:", err);
        }
      }
    }

    // 3. Update orders that are now verified
    const newlyVerifiedOrderIds: number[] = [];
    for (const ord of orders) {
      const canon = normalizeGhanaPhoneNumber(ord.phoneNumber);
      if (acceptedSet.has(canon)) {
        newlyVerifiedOrderIds.push(ord.id);
      }
    }

    if (newlyVerifiedOrderIds.length > 0) {
      await prisma.order.updateMany({
        where: { id: { in: newlyVerifiedOrderIds } },
        data: {
          isUnverified: false,
          providerReference: null,
          failureReason: null,
        },
      });

      // Add status history
      for (const id of newlyVerifiedOrderIds) {
        await prisma.orderStatusHistory.create({
          data: {
            orderId: id,
            status: "PENDING",
            previousStatus: null,
            note: "MTN recipient successfully verified upon re-check",
            changedBy: actor.email,
          },
        }).catch(() => {});
      }
    }

    return NextResponse.json({
      success: true,
      totalChecked: orders.length,
      verifiedCount: newlyVerifiedOrderIds.length,
      stillUnverifiedCount: orders.length - newlyVerifiedOrderIds.length,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
