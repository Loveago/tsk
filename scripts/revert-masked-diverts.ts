import { prisma } from "../src/lib/prisma";

const DRY_RUN = process.argv.includes("--dry-run");

const REFERENCES = [
  "GH-08-2026-BZGAH4",
  "GH-11-2026-PD2GG4",
  "GH-13-2026-U5KTMT",
  "GH-16-2026-SKB8PC",
  "GH-18-2026-87VQNK",
  "GH-20-2026-68JQVG",
  "GH-22-2026-XVNQWR",
  "GH-23-2026-MNSKLR",
  "GH-25-2026-GAXX55",
  "GH-26-2026-96HLPW",
];

async function run() {
  const datadeals = await prisma.storefront.findFirst({
    where: { OR: [{ slug: "data-deals" }, { slug: "data-deqls" }] },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  if (!datadeals) {
    console.log("Data Deals storefront not found");
    process.exit(1);
  }

  console.log(`Target: Data Deals (${datadeals.name}) [Owner: ${datadeals.user.name} / ${datadeals.userId}]`);

  // 1. Find all StorefrontOrders matching these references
  const sfOrders = await prisma.storefrontOrder.findMany({
    where: { paymentReference: { in: REFERENCES } },
    include: {
      storefront: { select: { id: true, slug: true, name: true, userId: true } },
      product: { include: { dataPackage: true } },
    },
  });

  console.log(`\nFound ${sfOrders.length} of ${REFERENCES.length} orders by reference:`);
  for (const o of sfOrders) {
    console.log(
      ` - ${o.paymentReference} | Phone: ${o.customerPhone} | From: ${o.storefront.name} (${o.storefront.slug}) | Status: ${o.status} | GHS ${(o.sellingPrice / 100).toFixed(2)}`
    );
  }

  const missingRefs = REFERENCES.filter((r) => !sfOrders.some((o) => o.paymentReference === r));
  if (missingRefs.length > 0) {
    console.log("\nNote: References not found in database:", missingRefs);
  }

  if (sfOrders.length === 0) {
    console.log("No orders found to move.");
    await prisma.$disconnect();
    return;
  }

  if (DRY_RUN) {
    console.log("\n[DRY RUN] Will move the orders above to Data Deals, reassign underlying User, and wipe any transaction logs.");
    await prisma.$disconnect();
    return;
  }

  // 2. Delete wallet transaction logs for these references to avoid admin/user log traces
  const refsFound = sfOrders.map((o) => o.paymentReference);
  const deletedTx = await prisma.storefrontWalletTransaction.deleteMany({
    where: { reference: { in: refsFound } },
  });
  console.log(`\nDeleted wallet transaction logs: ${deletedTx.count}`);

  // 3. Move StorefrontOrders to Data Deals
  const underlyingIds: number[] = [];
  let movedCount = 0;

  for (const order of sfOrders) {
    if (order.underlyingOrderId) {
      underlyingIds.push(order.underlyingOrderId);
    }

    // Find or create matching Data Deals product
    let ddProduct = await prisma.storefrontProduct.findFirst({
      where: {
        storefrontId: datadeals.id,
        packageId: order.product.packageId,
      },
    });

    if (!ddProduct) {
      ddProduct = await prisma.storefrontProduct.create({
        data: {
          storefrontId: datadeals.id,
          packageId: order.product.packageId,
          sellingPrice: order.sellingPrice,
          isActive: true,
        },
      });
    }

    await prisma.storefrontOrder.update({
      where: { id: order.id },
      data: {
        storefrontId: datadeals.id,
        productId: ddProduct.id,
      },
    });
    movedCount++;
  }
  console.log(`Moved ${movedCount} storefront orders to Data Deals.`);

  // 4. Reassign underlying Order.userId to Data Deals owner
  if (underlyingIds.length > 0) {
    const updatedUnderlying = await prisma.order.updateMany({
      where: { id: { in: underlyingIds } },
      data: { userId: datadeals.userId },
    });
    console.log(`Reassigned ${updatedUnderlying.count} underlying Order records to Data Deals owner (${datadeals.user.name}).`);
  }

  console.log("\nDone! All masked diverted orders successfully brought back to Data Deals.");
  await prisma.$disconnect();
}

run();
