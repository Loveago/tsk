/**
 * debug-lofaq-growth.ts
 * Shows the newest unique phones added to Lofaq and HOW they got there.
 * Run this on the VPS to diagnose what's bypassing the cap.
 */
import { prisma } from "../src/lib/prisma";

async function run() {
  const lofaq = await prisma.storefront.findFirst({
    where: { OR: [{ slug: "lofaq-data-hub" }, { slug: "lofaq" }, { name: { contains: "lofaq", mode: "insensitive" } }] },
  });
  if (!lofaq) { console.error("Lofaq not found"); process.exit(1); }

  // Get ALL distinct phones on Lofaq with their first order date, sorted newest-first
  const allPhones = await prisma.storefrontOrder.groupBy({
    by: ["customerPhone"],
    where: { storefrontId: lofaq.id, customerPhone: { gt: "" } },
    _min: { createdAt: true },
    orderBy: { _min: { createdAt: "desc" } }, // newest first
    take: 30, // show last 30 unique phones added
  });

  console.log("=================================================================");
  console.log("   LOFAQ GROWTH DIAGNOSTIC — last 30 unique phones added");
  console.log("=================================================================");
  console.log(`Total unique phones on Lofaq: ${allPhones.length}+ (showing newest 30)\n`);

  for (const row of allPhones) {
    const phone = row.customerPhone!;
    const firstDate = row._min.createdAt?.toISOString() ?? "unknown";

    // Get all orders for this phone on Lofaq to see how they arrived
    const orders = await prisma.storefrontOrder.findMany({
      where: { storefrontId: lofaq.id, customerPhone: phone },
      select: {
        paymentReference: true,
        createdAt: true,
        status: true,
        underlyingOrderId: true,
      },
      orderBy: { createdAt: "asc" },
      take: 3,
    });

    // Check if this phone also has Data Deals orders (would indicate diversion)
    const ddOrders = await prisma.storefrontOrder.count({
      where: {
        storefront: {
          OR: [
            { slug: "data-dealsgh" },
            { slug: "data-deals" },
            { name: { contains: "data deals", mode: "insensitive" } },
          ],
        },
        customerPhone: phone,
      },
    });

    console.log(`Phone: ${phone}`);
    console.log(`  First on Lofaq: ${firstDate}`);
    console.log(`  Orders on Data Deals: ${ddOrders} (0 = direct Lofaq order, >0 = was DD customer)`);
    for (const o of orders) {
      console.log(`  - Ref: ${o.paymentReference} | Status: ${o.status} | Settled: ${!!o.underlyingOrderId}`);
    }
    console.log();
  }

  await prisma.$disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });
