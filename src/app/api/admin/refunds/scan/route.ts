import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { parseRefundText, type ParsedRefundEntry } from "@/lib/refund-scanner";
import { storefrontOrderCode } from "@/lib/storefront";

export async function POST(request: NextRequest) {
  try {
    await requireStaff();

    const body = await request.json().catch(() => ({}));
    const rawText = String(body.text || "").trim();
    const dateStr = String(body.date || "").trim();
    const statusFilter = Array.isArray(body.statusFilter) ? body.statusFilter : null;

    if (!rawText) {
      return apiError(400, "Please paste at least one phone number and GB amount to scan.");
    }

    const parsedEntries = parseRefundText(rawText);
    if (parsedEntries.length === 0) {
      return apiError(
        400,
        "Could not detect any phone numbers and GB amounts. Please ensure you provide e.g. '0535308873 2gb' or '0535308873 5'."
      );
    }

    // Determine target date range (GMT/UTC)
    let startOfDay: Date;
    let endOfDay: Date;

    if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [y, m, d] = dateStr.split("-").map(Number);
      startOfDay = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
      endOfDay = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
    } else {
      const now = new Date();
      startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
      endOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    }

    // Build candidate phone lists (handles 10-digit, 9-digit, +233, etc.)
    const phoneSet = new Set<string>();
    for (const e of parsedEntries) {
      phoneSet.add(e.phone);
      phoneSet.add(e.normalizedPhone);
      if (e.normalizedPhone.startsWith("0")) {
        phoneSet.add(e.normalizedPhone.slice(1));
        phoneSet.add(`233${e.normalizedPhone.slice(1)}`);
        phoneSet.add(`+233${e.normalizedPhone.slice(1)}`);
      }
    }
    const candidatePhones = Array.from(phoneSet);

    // Query orders for that specific day matching candidate phones
    const dbOrders = await prisma.order.findMany({
      where: {
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
        phoneNumber: {
          in: candidatePhones,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        storefrontOrder: {
          select: {
            id: true,
            seq: true,
            paymentReference: true,
            customerPhone: true,
            customerEmail: true,
            sellingPrice: true,
            productCost: true,
            commission: true,
            status: true,
            storefront: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Also support fallback search if any number had fewer digits typed (e.g. 9-digit suffix match)
    const foundOrderIds = new Set(dbOrders.map((o) => o.id));
    for (const entry of parsedEntries) {
      const matchInDb = dbOrders.some(
        (o) =>
          (o.phoneNumber === entry.normalizedPhone ||
            o.phoneNumber === entry.phone ||
            o.phoneNumber.endsWith(entry.phone.slice(-8))) &&
          Math.abs(o.gbAmount - entry.gbAmount) < 0.05
      );

      if (!matchInDb && entry.phone.length >= 8) {
        const suffix = entry.phone.slice(-8);
        const extraOrders = await prisma.order.findMany({
          where: {
            createdAt: { gte: startOfDay, lte: endOfDay },
            phoneNumber: { contains: suffix },
            gbAmount: entry.gbAmount,
            id: { notIn: Array.from(foundOrderIds) },
          },
          include: {
            user: { select: { id: true, name: true, email: true, phone: true } },
            storefrontOrder: {
              select: {
                id: true,
                seq: true,
                paymentReference: true,
                customerPhone: true,
                customerEmail: true,
                sellingPrice: true,
                productCost: true,
                commission: true,
                status: true,
                storefront: { select: { id: true, name: true, slug: true } },
              },
            },
          },
          take: 5,
        });

        for (const eo of extraOrders) {
          if (!foundOrderIds.has(eo.id)) {
            foundOrderIds.add(eo.id);
            dbOrders.push(eo);
          }
        }
      }
    }

    // Match each parsed entry to found database orders
    interface MatchedOrderResult {
      orderId: number;
      orderCode: string;
      createdAt: string;
      phoneNumber: string;
      network: string;
      gbAmount: number;
      amount: number;
      status: string;
      source: string;
      isStorefront: boolean;
      storefrontReference: string | null;
      storefrontName: string | null;
      storefrontSlug: string | null;
      customerEmail: string | null;
      customerPhone: string | null;
      userName: string | null;
      userEmail: string | null;
      matchedInputLine: string;
      alreadyRefunded: boolean;
      eligibleForRefund: boolean;
    }

    const matchedOrders: MatchedOrderResult[] = [];
    const usedOrderIds = new Set<number>();
    const unmatchedEntries: Array<{ originalLine: string; phone: string; gbAmount: number; reason: string }> = [];

    for (const entry of parsedEntries) {
      // Find orders matching this entry
      const matching = dbOrders.filter((o) => {
        const phoneMatches =
          o.phoneNumber === entry.normalizedPhone ||
          o.phoneNumber === entry.phone ||
          (entry.phone.length >= 8 && o.phoneNumber.endsWith(entry.phone.slice(-8)));
        const gbMatches = Math.abs(o.gbAmount - entry.gbAmount) < 0.05;
        return phoneMatches && gbMatches;
      });

      if (matching.length === 0) {
        unmatchedEntries.push({
          originalLine: entry.originalLine,
          phone: entry.phone,
          gbAmount: entry.gbAmount,
          reason: `No matching order found on ${dateStr || "selected date"} for ${entry.gbAmount} GB`,
        });
        continue;
      }

      // Prioritize active orders (PROCESSING, SUCCESS, PENDING) that haven't been claimed yet
      const candidate =
        matching.find((o) => !usedOrderIds.has(o.id) && ["PROCESSING", "SUCCESS", "PENDING"].includes(o.status)) ||
        matching.find((o) => !usedOrderIds.has(o.id)) ||
        matching[0];

      usedOrderIds.add(candidate.id);

      const isStorefront = candidate.source === "STOREFRONT" || Boolean(candidate.storefrontOrder);
      let storefrontRef: string | null = null;
      if (candidate.storefrontOrder?.paymentReference) {
        storefrontRef = candidate.storefrontOrder.paymentReference;
      } else if (candidate.storefrontOrder?.seq) {
        storefrontRef = storefrontOrderCode(candidate.storefrontOrder.seq, null);
      }

      const isRefunded = candidate.status === "REFUNDED";
      const isEligible = !isRefunded && (statusFilter ? statusFilter.includes(candidate.status) : true);

      matchedOrders.push({
        orderId: candidate.id,
        orderCode: `ORD-${candidate.id}`,
        createdAt: candidate.createdAt.toISOString(),
        phoneNumber: candidate.phoneNumber,
        network: candidate.network,
        gbAmount: candidate.gbAmount,
        amount: candidate.amount,
        status: candidate.status,
        source: isStorefront ? "STOREFRONT" : candidate.source || "WEB",
        isStorefront,
        storefrontReference: storefrontRef,
        storefrontName: candidate.storefrontOrder?.storefront?.name ?? null,
        storefrontSlug: candidate.storefrontOrder?.storefront?.slug ?? null,
        customerEmail: candidate.storefrontOrder?.customerEmail ?? null,
        customerPhone: candidate.storefrontOrder?.customerPhone ?? null,
        userName: candidate.user?.name ?? null,
        userEmail: candidate.user?.email ?? null,
        matchedInputLine: entry.originalLine,
        alreadyRefunded: isRefunded,
        eligibleForRefund: isEligible,
      });
    }

    // Extract unique storefront references for one-click Paystack copy
    const storefrontIds = Array.from(
      new Set(
        matchedOrders
          .filter((m) => m.isStorefront && m.storefrontReference)
          .map((m) => m.storefrontReference as string)
      )
    );

    // Summary calculations
    const eligibleOrders = matchedOrders.filter((m) => m.eligibleForRefund);
    const storefrontCount = matchedOrders.filter((m) => m.isStorefront).length;
    const directCount = matchedOrders.filter((m) => !m.isStorefront).length;
    const alreadyRefundedCount = matchedOrders.filter((m) => m.alreadyRefunded).length;
    const totalAmountGhs = eligibleOrders.reduce((sum, o) => sum + o.amount, 0);

    return NextResponse.json({
      success: true,
      scannedDate: dateStr || startOfDay.toISOString().slice(0, 10),
      summary: {
        totalPasted: parsedEntries.length,
        totalMatched: matchedOrders.length,
        totalEligible: eligibleOrders.length,
        totalStorefront: storefrontCount,
        totalDirect: directCount,
        totalAlreadyRefunded: alreadyRefundedCount,
        totalUnmatched: unmatchedEntries.length,
        totalAmountGhs: Number(totalAmountGhs.toFixed(2)),
      },
      storefrontIds,
      matchedOrders,
      unmatchedEntries,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
