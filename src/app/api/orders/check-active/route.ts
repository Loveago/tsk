import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";
import { normalizeGhanaPhoneNumber } from "@/lib/phone-utils";
import { z } from "zod";

const checkSchema = z.object({
  phoneNumbers: z.array(z.string()).min(1).max(2000),
});

export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const body = await request.json();
    const { phoneNumbers } = checkSchema.parse(body);

    // Map each normalized number to its original input string
    const numberMap = new Map<string, string>();
    const allLookupValues = new Set<string>();

    for (const raw of phoneNumbers) {
      const trimmed = String(raw).trim();
      if (!trimmed) continue;
      const canonical = normalizeGhanaPhoneNumber(trimmed) || trimmed;
      if (!numberMap.has(canonical)) {
        numberMap.set(canonical, trimmed);
      }
      allLookupValues.add(canonical);
      allLookupValues.add(trimmed);
    }

    const uniqueNumbers = Array.from(numberMap.keys());
    if (uniqueNumbers.length === 0) {
      return NextResponse.json({
        hasActiveOrders: false,
        activeNumbers: [],
        activeOrders: [],
      });
    }

    // Fast check: look for any pending/processing orders among candidate numbers
    const activeCandidates = await prisma.order.findMany({
      where: {
        phoneNumber: { in: Array.from(allLookupValues) },
        status: { in: ["PENDING", "PROCESSING"] },
      },
      select: { phoneNumber: true, status: true },
    });

    if (activeCandidates.length === 0) {
      return NextResponse.json({
        hasActiveOrders: false,
        activeNumbers: [],
        activeOrders: [],
      });
    }

    // Determine unique candidate phone numbers that matched active statuses
    const candidateSet = new Set(activeCandidates.map((c) => c.phoneNumber));
    const activeOrders: Array<{
      phoneNumber: string;
      status: string;
      network?: string;
      gbAmount?: number;
    }> = [];

    // Verify whether the LATEST order for each candidate number is indeed PENDING or PROCESSING
    for (const canonical of uniqueNumbers) {
      const raw = numberMap.get(canonical);
      const isCandidate = candidateSet.has(canonical) || (raw && candidateSet.has(raw));
      if (!isCandidate) continue;

      const latestOrder = await prisma.order.findFirst({
        where: {
          OR: [
            { phoneNumber: canonical },
            ...(raw && raw !== canonical ? [{ phoneNumber: raw }] : []),
          ],
        },
        orderBy: { createdAt: "desc" },
        select: { phoneNumber: true, status: true, network: true, gbAmount: true },
      });

      if (latestOrder && (latestOrder.status === "PENDING" || latestOrder.status === "PROCESSING")) {
        activeOrders.push({
          phoneNumber: canonical,
          status: latestOrder.status,
          network: latestOrder.network,
          gbAmount: latestOrder.gbAmount,
        });
      }
    }

    return NextResponse.json({
      hasActiveOrders: activeOrders.length > 0,
      activeNumbers: activeOrders.map((a) => a.phoneNumber),
      activeOrders,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
