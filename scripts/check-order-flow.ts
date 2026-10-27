import { prisma } from "../src/lib/prisma";
import { isLofaqCustomer } from "../src/lib/order-allocation";

async function run() {
  const datadeals = await prisma.storefront.findFirst({
    where: { OR: [{ slug: "data-deals" }, { slug: "data-dealsgh" }, { slug: "data-deqls" }] },
  });
  const lofaq = await prisma.storefront.findFirst({
    where: { OR: [{ slug: "lofaq-data-hub" }, { slug: "lofaq" }] },
  });

  if (!datadeals || !lofaq) {
    console.log("Storefronts not found");
    return;
  }

  // 1. Get recent orders on Data Deals since 11:50 UTC
  const recentDDOrders = await prisma.storefrontOrder.findMany({
    where: {
      storefrontId: datadeals.id,
      createdAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) }, // last 2 hours
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      paymentReference: true,
      customerPhone: true,
      createdAt: true,
    },
  });

  // 2. Get recent orders on Lofaq in the last 2 hours
  const recentLofaqOrders = await prisma.storefrontOrder.findMany({
    where: {
      storefrontId: lofaq.id,
      createdAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      paymentReference: true,
      customerPhone: true,
      createdAt: true,
    },
  });

  console.log("==========================================================================");
  console.log("                     ORDER FLOW & STICKY CHECK DIAGNOSTIC                 ");
  console.log("==========================================================================");
  console.log(`Recent orders on Lofaq (last 2 hours):      ${recentLofaqOrders.length}`);
  console.log(`Recent orders on Data Deals (last 2 hours): ${recentDDOrders.length}`);
  console.log("--------------------------------------------------------------------------");

  console.log("\nLATEST ORDERS ON LOFAQ:");
  if (recentLofaqOrders.length === 0) {
    console.log(" No orders recorded on Lofaq in the last 2 hours.");
  } else {
    for (const o of recentLofaqOrders) {
      console.log(` ${o.createdAt.toISOString().slice(11, 19)} | Phone: ${o.customerPhone} | Ref: ${o.paymentReference}`);
    }
  }

  console.log("\nSAMPLE RECENT ORDERS ON DATA DEALS (checking if any belonged to Lofaq sticky):");
  let stickyMatchFound = 0;
  for (const o of recentDDOrders) {
    const isSticky = await isLofaqCustomer(o.customerPhone);
    if (isSticky) stickyMatchFound++;
    console.log(
      ` ${o.createdAt.toISOString().slice(11, 19)} | Phone: ${o.customerPhone} | Ref: ${o.paymentReference} | Sticky to Lofaq? [${isSticky ? "YES (SHOULD DIVERT)" : "NO (Pure Data Deals)"}]`
    );
  }

  console.log("--------------------------------------------------------------------------");
  console.log(`Total checked on Data Deals: ${recentDDOrders.length} | Lofaq sticky matches: ${stickyMatchFound}`);
  console.log("==========================================================================");

  await prisma.$disconnect();
}

run();
