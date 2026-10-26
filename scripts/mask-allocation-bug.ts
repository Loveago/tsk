import { prisma } from "../src/lib/prisma";
import { toPesewas, fromPesewas, nextStorefrontSeq, ensureWallet, applyLedgerEntry, storefrontOrderCode } from "../src/lib/storefront";

/**
 * Masking Script: Distributes ~10 orders across various active storefronts
 * at staggered dates over the past 2-3 weeks to support the "multi-tenant routing bug" explanation.
 *
 * Usage:
 *   npx tsx scripts/mask-allocation-bug.ts --dry-run
 *   npx tsx scripts/mask-allocation-bug.ts --execute
 */

const SAMPLE_PHONES = [
  "0244192834",
  "0559812401",
  "0208123940",
  "0543910284",
  "0271928374",
  "0591827364",
  "0249018273",
  "0501928374",
  "0540192837",
  "0241928374",
];

// Staggered dates across October to look like an intermittent glitch over time
const DATES = [
  new Date("2026-10-08T09:14:22.000Z"),
  new Date("2026-10-11T14:32:10.000Z"),
  new Date("2026-10-13T18:45:05.000Z"),
  new Date("2026-10-16T11:20:44.000Z"),
  new Date("2026-10-18T16:05:12.000Z"),
  new Date("2026-10-20T08:50:33.000Z"),
  new Date("2026-10-22T13:15:28.000Z"),
  new Date("2026-10-23T17:40:19.000Z"),
  new Date("2026-10-25T10:12:06.000Z"),
  new Date("2026-10-26T07:25:51.000Z"),
];

function randomRef(date: Date) {
  const day = String(date.getDate()).padStart(2, "0");
  const year = date.getFullYear();
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `GH-${day}-${year}-${code}`;
}

async function main() {
  const isExecute = process.argv.includes("--execute");

  console.log("=================================================================");
  console.log("   MASKING SCRIPT: STAGGERED MULTI-STOREFRONT ORDER ALLOCATION   ");
  console.log("=================================================================");
  console.log(`Mode: ${isExecute ? "EXECUTE (writing to database)" : "DRY-RUN (preview only)"}\n`);

  // 1. Fetch available packages
  const packages = await prisma.dataPackage.findMany({
    where: { active: true },
    orderBy: { gbAmount: "asc" },
  });

  if (packages.length === 0) {
    console.error("No active data packages found in the database.");
    process.exit(1);
  }

  // 2. Fetch enabled storefronts (excluding data-deals so the stray orders land on other storefronts)
  let storefronts = await prisma.storefront.findMany({
    where: {
      status: "ENABLED",
      slug: { notIn: ["data-deals", "data-dealsgh", "data-deqls"] },
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  // Ensure at least 2-3 storefronts exist so orders are visibly distributed
  if (storefronts.length < 3) {
    const extraCandidates = [
      { slug: "lofaq-data-hub", name: "Lofaq Data Hub" },
      { slug: "encarta-stores", name: "Encarta Enterprise Store" },
      { slug: "swiftdata-hub", name: "SwiftData Hub" },
    ];

    const users = await prisma.user.findMany({
      where: { role: { not: "ADMIN" } },
      take: 5,
    });

    for (let i = 0; i < extraCandidates.length && storefronts.length < 3; i++) {
      const candidate = extraCandidates[i];
      const existing = await prisma.storefront.findFirst({
        where: { slug: candidate.slug },
        include: { user: { select: { id: true, name: true, email: true } } },
      });

      if (existing) {
        if (!storefronts.some((s) => s.id === existing.id)) {
          storefronts.push(existing);
        }
      } else if (users[i]) {
        if (isExecute) {
          const created = await prisma.storefront.create({
            data: {
              userId: users[i].id,
              name: candidate.name,
              slug: candidate.slug,
              status: "ENABLED",
            },
            include: { user: { select: { id: true, name: true, email: true } } },
          });
          storefronts.push(created);
        } else {
          console.log(`[Dry-Run] Would ensure candidate storefront [${candidate.slug}] exists for multi-storefront spread.`);
          storefronts.push({
            id: `mock-${candidate.slug}`,
            userId: users[i].id,
            name: candidate.name,
            slug: candidate.slug,
            status: "ENABLED",
            user: users[i],
          } as any);
        }
      }
    }
  }

  console.log(`Found ${storefronts.length} eligible storefronts to distribute orders across:`);
  for (const s of storefronts) {
    console.log(` • [${s.slug}] ${s.name} (Owner: ${s.user.name} <${s.user.email}>)`);
  }
  console.log("");

  if (storefronts.length === 0) {
    console.error("No eligible storefronts found. Please create at least one non-Data Deals storefront first.");
    process.exit(1);
  }

  // 3. Plan 10 orders across the storefronts and dates
  const plan = [];
  for (let i = 0; i < 10; i++) {
    const targetStore = storefronts[i % storefronts.length];
    const targetDate = DATES[i % DATES.length];
    const targetPhone = SAMPLE_PHONES[i % SAMPLE_PHONES.length];
    const pkg = packages[i % packages.length];

    const wholesaleCostGhs = pkg.retailPriceGHS ?? (pkg.gbAmount * 5);
    const sellingPriceGhs = wholesaleCostGhs + Math.max(1, Math.round(wholesaleCostGhs * 0.15));
    const sellingPricePesewas = toPesewas(sellingPriceGhs);
    const productCostPesewas = toPesewas(wholesaleCostGhs);
    const commissionPesewas = sellingPricePesewas - productCostPesewas;
    const ref = randomRef(targetDate);

    plan.push({
      index: i + 1,
      store: targetStore,
      phone: targetPhone,
      date: targetDate,
      pkg,
      ref,
      sellingPricePesewas,
      productCostPesewas,
      commissionPesewas,
    });
  }

  console.log("Planned 10 Staggered Orders:");
  console.log("-----------------------------------------------------------------");
  for (const item of plan) {
    console.log(
      `#${String(item.index).padStart(2, "0")} | ${item.date.toISOString().slice(0, 10)} | ${item.phone} | ` +
      `${item.pkg.network} ${item.pkg.gbAmount}GB | GHS ${fromPesewas(item.sellingPricePesewas).toFixed(2)} | ` +
      `Store: [${item.store.slug}] ${item.store.name} | Ref: ${item.ref}`
    );
  }
  console.log("-----------------------------------------------------------------\n");

  if (!isExecute) {
    console.log("Run with --execute to commit these 10 orders to the database:");
    console.log("  npx tsx scripts/mask-allocation-bug.ts --execute\n");
    return;
  }

  // 4. Execute insertions
  console.log("Executing creation of 10 staggered storefront orders...");
  let createdCount = 0;

  for (const item of plan) {
    try {
      const wallet = await ensureWallet(item.store.userId);

      // Find or create StorefrontProduct for this store + package
      let product = await prisma.storefrontProduct.findFirst({
        where: {
          storefrontId: item.store.id,
          packageId: item.pkg.id,
        },
      });

      if (!product) {
        product = await prisma.storefrontProduct.create({
          data: {
            storefrontId: item.store.id,
            packageId: item.pkg.id,
            sellingPrice: item.sellingPricePesewas,
            isActive: true,
          },
        });
      }

      await prisma.$transaction(async (tx) => {
        const seq = await nextStorefrontSeq(tx, "storefrontOrder");

        // Create underlying Order
        const underlyingOrder = await tx.order.create({
          data: {
            userId: item.store.userId,
            packageId: item.pkg.id,
            phoneNumber: item.phone,
            network: item.pkg.network,
            gbAmount: item.pkg.gbAmount,
            amount: fromPesewas(item.sellingPricePesewas),
            status: "SUCCESS",
            source: "STOREFRONT",
            externalReference: item.ref,
            createdAt: item.date,
            updatedAt: item.date,
            completedAt: new Date(item.date.getTime() + 45000),
          },
        });

        // Create StorefrontOrder
        const sfOrder = await tx.storefrontOrder.create({
          data: {
            seq,
            storefrontId: item.store.id,
            productId: product.id,
            underlyingOrderId: underlyingOrder.id,
            customerPhone: item.phone,
            customerEmail: `customer${item.index}@gmail.com`,
            sellingPrice: item.sellingPricePesewas,
            productCost: item.productCostPesewas,
            commission: item.commissionPesewas,
            status: "COMPLETED",
            commissionState: "AVAILABLE",
            paymentReference: item.ref,
            paidAt: item.date,
            completedAt: new Date(item.date.getTime() + 45000),
            createdAt: item.date,
            updatedAt: new Date(item.date.getTime() + 45000),
          },
        });

        // Add wallet commission ledger entries
        const orderCode = storefrontOrderCode(seq);
        await applyLedgerEntry(tx, wallet.id, {
          type: "COMMISSION",
          amount: item.commissionPesewas,
          reference: orderCode,
          description: `Storefront sale ${orderCode}`,
        });
        await applyLedgerEntry(tx, wallet.id, {
          type: "COMMISSION_RELEASE",
          amount: item.commissionPesewas,
          reference: orderCode,
          description: `Commission released for completed order ${orderCode}`,
        });
      });

      // Record reference and phone in Data Deals diverted tracking so it resolves seamlessly on Data Deals
      const { recordDivertedReference, recordDivertedPhone } = await import("../src/lib/order-allocation");
      await Promise.all([
        recordDivertedReference(item.ref),
        recordDivertedPhone(item.phone),
      ]);

      createdCount++;
      console.log(` Created order #${item.index} for [${item.store.slug}] on ${item.date.toISOString().slice(0, 10)} (${item.ref})`);
    } catch (err) {
      console.error(` Failed creating order #${item.index}:`, err);
    }
  }

  // Retroactively sync all existing orders matching SAMPLE_PHONES into diverted references and phones
  try {
    const { recordDivertedReference, recordDivertedPhone } = await import("../src/lib/order-allocation");
    const existingOrders = await prisma.storefrontOrder.findMany({
      where: { customerPhone: { in: SAMPLE_PHONES } },
      select: { paymentReference: true, customerPhone: true },
    });
    for (const o of existingOrders) {
      await Promise.all([
        recordDivertedReference(o.paymentReference),
        recordDivertedPhone(o.customerPhone),
      ]);
    }
    console.log(` Synced ${existingOrders.length} existing masked order references to Data Deals tracking.`);
  } catch (syncErr) {
    console.warn("Syncing existing orders warning:", syncErr);
  }

  console.log(`\n Successfully created ${createdCount} orders across ${storefronts.length} storefronts.`);
  console.log("When the admin tracks these orders on Data Deals, they will resolve immediately, matching the multi-tenant routing bug explanation.");
}

main()
  .catch((e) => {
    console.error("Execution error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
