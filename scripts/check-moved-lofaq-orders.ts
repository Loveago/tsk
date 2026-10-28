/**
 * check-moved-lofaq-orders.ts
 *
 * Checks if any orders originally placed on Lofaq were moved to Data Deals,
 * and optionally restores them back to Lofaq with --restore.
 *
 * Usage:
 *   npx tsx scripts/check-moved-lofaq-orders.ts            # check / inspect
 *   npx tsx scripts/check-moved-lofaq-orders.ts --restore  # restore back to Lofaq
 */

import { prisma } from "../src/lib/prisma";
import { getDataDealsStorefrontIds } from "../src/lib/order-allocation";

const RESTORE = process.argv.includes("--restore");

async function run() {
  console.log("==========================================================================");
  console.log("            CHECK & RESTORE MOVED LOFAQ ORDERS                           ");
  console.log("==========================================================================");

  const lofaq = await prisma.storefront.findFirst({
    where: {
      OR: [
        { slug: "lofaq-data-hub" },
        { slug: "lofaq" },
        { name: { contains: "lofaq", mode: "insensitive" } },
      ],
    },
  });

  if (!lofaq) {
    console.error("Lofaq storefront not found.");
    process.exit(1);
  }

  const dataDealsIds = await getDataDealsStorefrontIds();

  // Find any storefront order currently attributed to Data Deals whose product belongs to Lofaq
  const mismatchedOrders = await prisma.storefrontOrder.findMany({
    where: {
      storefrontId: { in: dataDealsIds },
      product: {
        storefrontId: lofaq.id,
      },
    },
    include: {
      product: true,
    },
    orderBy: { createdAt: "desc" },
  });

  console.log(`Lofaq storefront ID:     ${lofaq.id} (${lofaq.name})`);
  console.log(`Data Deals storefronts:   ${dataDealsIds.join(", ")}`);
  console.log("--------------------------------------------------------------------------");

  if (mismatchedOrders.length === 0) {
    console.log("✅ ZERO Lofaq orders were moved to Data Deals.");
    console.log("   All Lofaq direct orders and commissions are 100% intact on Lofaq.");
    console.log("==========================================================================");
    await prisma.$disconnect();
    return;
  }

  console.log(`⚠️ Found ${mismatchedOrders.length} order(s) placed on Lofaq that have Data Deals storefrontId:\n`);

  for (const o of mismatchedOrders) {
    console.log(`- Ref: ${o.paymentReference} | Phone: ${o.customerPhone} | Date: ${o.createdAt.toISOString()}`);
    console.log(`  Selling Price: GHS ${(o.sellingPrice / 100).toFixed(2)} | Commission: GHS ${(o.commission / 100).toFixed(2)}`);
  }

  if (RESTORE) {
    const ids = mismatchedOrders.map((o) => o.id);
    const updated = await prisma.storefrontOrder.updateMany({
      where: { id: { in: ids } },
      data: { storefrontId: lofaq.id },
    });
    console.log(`\n✅ RESTORED ${updated.count} order(s) back to Lofaq storefront successfully.`);
  } else {
    console.log("\n[DRY RUN] Run with --restore to move these orders back to Lofaq.");
  }

  console.log("==========================================================================");
  await prisma.$disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
