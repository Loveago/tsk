import { prisma } from "../src/lib/prisma";

async function run() {
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
    console.log("Lofaq not found");
    return;
  }

  // Get the latest 10 orders created on Lofaq
  const latestOrders = await prisma.storefrontOrder.findMany({
    where: { storefrontId: lofaq.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      paymentReference: true,
      customerPhone: true,
      sellingPrice: true,
      status: true,
      createdAt: true,
    },
  });

  const rawRefs = await prisma.systemSetting.findUnique({
    where: { key: "datadeals_diverted_references" },
  });
  const divertedRefs = new Set<string>(rawRefs?.value ? JSON.parse(rawRefs.value) : []);

  console.log("=== LATEST 10 ORDERS ON LOFAQ ===");
  for (const o of latestOrders) {
    const isDiverted = divertedRefs.has(o.paymentReference);
    const source = isDiverted ? "DIVERTED FROM DATA DEALS" : "ORGANIC DIRECT TO LOFAQ";
    console.log(
      `${o.createdAt.toISOString().slice(11, 19)} | Phone: ${o.customerPhone} | Ref: ${o.paymentReference} | Source: [${source}]`
    );
  }

  await prisma.$disconnect();
}

run();
