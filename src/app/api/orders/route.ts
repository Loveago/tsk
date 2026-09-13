import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { sendOrdersSchema } from "@/lib/validation";
import { createOrder, isOrderProcessingHalted } from "@/lib/orders";
import { validateMtnOrderRecipient } from "@/lib/mtn-verification";
import { nextBatchCode } from "@/lib/batches";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();

    if (await isOrderProcessingHalted()) {
      return apiError(503, "Order processing is temporarily halted. Please try again later.");
    }

    const killSwitch = await prisma.systemSetting.findUnique({
      where: { key: "number_submission_page_enabled" },
    });
    if (killSwitch?.value === "false") {
      return apiError(503, "Number submission is currently disabled by administrator.");
    }

    const body = await request.json();
    const input = sendOrdersSchema.parse(body);

    // Deduplicate within the submission batch so only one order per phone number is processed
    const seenPhones = new Set<string>();
    const deduplicatedOrders: typeof input.orders = [];
    for (const o of input.orders) {
      if (!seenPhones.has(o.phoneNumber)) {
        seenPhones.add(o.phoneNumber);
        deduplicatedOrders.push(o);
      }
    }

    if (deduplicatedOrders.length === 0) {
      return apiError(400, "No valid orders provided.");
    }

    const maxOrdersSetting = await prisma.systemSetting.findUnique({
      where: { key: "max_orders_per_submission" },
    });
    const maxAllowed = maxOrdersSetting?.value ? parseInt(maxOrdersSetting.value, 10) : 500;
    if (deduplicatedOrders.length > maxAllowed) {
      return apiError(400, `Maximum ${maxAllowed} orders allowed per submission.`);
    }

    // Enforce package availability: admin-disabled packages must not be
    // orderable, even from a stale page or a crafted request.
    const activePackages = await prisma.dataPackage.findMany({
      where: { active: true },
      select: { id: true, network: true, gbAmount: true },
    });
    const activeKeys = new Set(activePackages.map((p) => `${p.network}:${p.gbAmount}`));
    const activeIds = new Set(activePackages.map((p) => p.id));
    for (const o of deduplicatedOrders) {
      if (o.packageId) {
        if (!activeIds.has(o.packageId)) {
          return apiError(400, "One or more selected packages are currently unavailable.");
        }
      } else if (!activeKeys.has(`${o.network}:${o.gbAmount}`)) {
        return apiError(
          400,
          `${o.network} ${o.gbAmount}GB is currently unavailable. Please refresh the page and try again.`
        );
      }
    }

    // MTN single order per number a day toggle check
    const singleOrderPerDay = await prisma.systemSetting.findUnique({
      where: { key: "mtn_single_order_per_day_enabled" },
    });
    if (singleOrderPerDay?.value === "true") {
      const now = new Date();
      const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
      for (const o of deduplicatedOrders) {
        if (o.network === "MTN") {
          const existingToday = await prisma.order.findFirst({
            where: {
              phoneNumber: o.phoneNumber,
              network: "MTN",
              createdAt: { gte: startOfDay },
              status: { notIn: ["CANCELLED", "REFUNDED"] },
            },
          });
          if (existingToday) {
            return apiError(
              400,
              `MTN number ${o.phoneNumber} already has an order placed today. Only 1 order per MTN number per day is permitted.`
            );
          }
        }
      }
    }

    // Resolve prices & total
    const profileId = user.pricingProfileId ?? null;
    const profile = profileId
      ? await prisma.pricingProfile.findUnique({ where: { id: profileId } })
      : null;
    const isCustomProfile = profile && !profile.isDefault;

    const tiers = (isCustomProfile && profileId)
      ? await prisma.priceTier.findMany({ where: { profileId } })
      : [];
    const priceMap = new Map(tiers.map((t) => [t.gbAmount, t.priceGHS]));

    const packages = await prisma.dataPackage.findMany({ where: { active: true } });
    const pkgMap = new Map(packages.map((p) => [`${p.network.toUpperCase()}:${p.gbAmount}`, p]));

    let total = 0;
    const priced = deduplicatedOrders.map((o) => {
      const pkg = pkgMap.get(`${o.network.toUpperCase()}:${o.gbAmount}`);
      const price = pkg?.retailPriceGHS ?? priceMap.get(o.gbAmount) ?? null;

      if (price == null) {
        throw new Error(`No price configured for ${o.network} ${o.gbAmount}GB`);
      }
      total += price;
      return { ...o, price, packageId: pkg?.id ?? null };
    });

    // Validate MTN numbers before balance deduction (§2, §16)
    for (const o of deduplicatedOrders) {
      const check = await validateMtnOrderRecipient(o.phoneNumber, o.network, user.id, {
        recordUnverified: false,
      });
      if (!check.allowed) {
        return apiError(400, check.reason ?? "MTN number verification failed.");
      }
    }

    if (user.balance < total) {
      return apiError(402, `Insufficient balance. You need GHS ${total.toFixed(2)} but have GHS ${user.balance.toFixed(2)}.`);
    }

    // Atomic balance deduction
    const result = await prisma.user.updateMany({
      where: { id: user.id, balance: { gte: total } },
      data: { balance: { decrement: total } },
    });
    if (result.count === 0) {
      return apiError(402, "Insufficient balance. Please top up and try again.");
    }

    // Group recipients by network — one OrderBatch per network (§2: never mixed)
    const groups = new Map<string, Array<(typeof priced)[number]>>();
    for (const o of priced) {
      const list = groups.get(o.network) ?? [];
      list.push(o);
      groups.set(o.network, list);
    }

    const created = [];
    const createdBatches = [];
    try {
      for (const [network, lines] of groups) {
        const batch = await prisma.orderBatch.create({
          data: {
            batchCode: await nextBatchCode(),
            userId: user.id,
            network,
            totalRecipients: lines.length,
            totalGb: lines.reduce((s, l) => s + l.gbAmount, 0),
            totalAmount: lines.reduce((s, l) => s + l.price, 0),
          },
        });
        createdBatches.push(batch);
        for (const o of lines) {
          const order = await createOrder({
            userId: user.id,
            phoneNumber: o.phoneNumber,
            network: o.network,
            gbAmount: o.gbAmount,
            packageId: o.packageId ?? null,
            amount: o.price,
            source: "WEB",
            batchId: batch.id,
          });
          created.push(order);
        }
      }
    } catch (err) {
      // Roll back partially created batches/orders, then refund the balance
      for (const batch of createdBatches) {
        await prisma.order.deleteMany({ where: { batchId: batch.id } });
        await prisma.orderBatch.delete({ where: { id: batch.id } }).catch(() => {});
      }
      await prisma.user.update({
        where: { id: user.id },
        data: { balance: { increment: total } },
      });
      throw err;
    }

    await recordAudit({
      userId: user.id,
      actorLabel: user.email,
      action: "order.create",
      target: `batch:${createdBatches.map((b) => b.batchCode).join(",")}`,
      newValue: JSON.stringify({
        count: created.length,
        total,
        batches: createdBatches.map((b) => ({ code: b.batchCode, network: b.network, recipients: b.totalRecipients })),
      }),
    });

    return NextResponse.json({
      orders: created,
      batches: createdBatches,
      total,
      count: created.length,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));
    const status = searchParams.get("status");
    const network = searchParams.get("network");
    const q = searchParams.get("q");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where: Record<string, unknown> = { userId: user.id };
    if (status) where.status = status;
    if (network) where.network = network;
    if (q) where.phoneNumber = { contains: q };
    if (from || to) {
      where.createdAt = {};
      if (from) (where.createdAt as Record<string, Date>).gte = new Date(from);
      if (to) (where.createdAt as Record<string, Date>).lte = new Date(to);
    }

    const [data, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.order.count({ where }),
    ]);

    // Queue positions across the user's pending/processing orders
    const queueRows = await prisma.order.findMany({
      where: { userId: user.id, status: { in: ["PENDING", "PROCESSING"] } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    const queueTotal = queueRows.length;
    const positionOf = new Map<number, number>();
    queueRows.forEach((row, index) => positionOf.set(row.id, index + 1));

    const dataWithQueue = data.map((order) => ({
      ...order,
      queuePosition: positionOf.get(order.id) ?? null,
      queueTotal,
    }));

    return NextResponse.json({
      data: dataWithQueue,
      total,
      page,
      pageSize,
      pages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
