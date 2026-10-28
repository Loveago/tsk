import { prisma } from "../src/lib/prisma";
import { findLofaqStorefront, isLofaqCustomer } from "../src/lib/order-allocation";
import { toPesewas } from "../src/lib/storefront";

async function run() {
  const lofaq = await findLofaqStorefront();
  const datadeals = await prisma.storefront.findFirst({
    where: { OR: [{ slug: "data-deals" }, { slug: "data-dealsgh" }, { slug: "data-deqls" }] },
    include: { user: true },
  });

  if (!lofaq || !datadeals) {
    console.log("Storefronts not found");
    return;
  }

  // Find recent orders on Data Deals in the last 6 hours
  const recentOrders = await prisma.storefrontOrder.findMany({
    where: {
      storefrontId: datadeals.id,
      createdAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
    },
    include: { product: { include: { dataPackage: true } } },
    orderBy: { createdAt: "desc" },
  });

  const ordersToCatchUp: typeof recentOrders = [];
  for (const o of recentOrders) {
    if (await isLofaqCustomer(o.customerPhone)) {
      ordersToCatchUp.push(o);
    }
  }

  console.log(`Found ${ordersToCatchUp.length} sticky Lofaq orders on Data Deals that should be on Lofaq:`);
  for (const o of ordersToCatchUp) {
    console.log(` - Ref: ${o.paymentReference} | Phone: ${o.customerPhone} | Created: ${o.createdAt.toISOString()}`);
  }

  if (ordersToCatchUp.length === 0) {
    console.log("None found.");
    await prisma.$disconnect();
    return;
  }

  const { resolveUserWholesalePrice } = await import("../src/lib/orders");

  // Move them to Lofaq
  for (const o of ordersToCatchUp) {
    let lofaqProduct = await prisma.storefrontProduct.findFirst({
      where: { storefrontId: lofaq.id, packageId: o.product.packageId },
    });
    if (!lofaqProduct) {
      lofaqProduct = await prisma.storefrontProduct.create({
        data: {
          storefrontId: lofaq.id,
          packageId: o.product.packageId,
          sellingPrice: o.sellingPrice,
          isActive: true,
        },
      });
    }

    const lofaqCostGhs = await resolveUserWholesalePrice(lofaq.user || lofaq.userId, o.product.dataPackage);
    const lofaqCostPesewas = toPesewas(lofaqCostGhs);
    const lofaqCommission = Math.max(0, o.sellingPrice - lofaqCostPesewas);

    await prisma.$transaction(async (tx) => {
      // 1. Move storefront order
      await tx.storefrontOrder.update({
        where: { id: o.id },
        data: {
          storefrontId: lofaq.id,
          productId: lofaqProduct.id,
          productCost: lofaqCostPesewas,
          commission: lofaqCommission,
        },
      });

      // 2. Reassign underlying Order if exists
      if (o.underlyingOrderId) {
        await tx.order.update({
          where: { id: o.underlyingOrderId },
          data: { userId: lofaq.userId },
        });
      }

      // 3. Adjust wallet balances cleanly
      await tx.storefrontWallet.updateMany({
        where: { userId: lofaq.userId },
        data: {
          pendingBalance: { increment: lofaqCommission },
        },
      });
      await tx.storefrontWallet.updateMany({
        where: { userId: datadeals.userId },
        data: {
          pendingBalance: { decrement: o.commission },
        },
      });
    });

    console.log(`Successfully moved ${o.paymentReference} to Lofaq.`);
  }

  await prisma.$disconnect();
}

run();
