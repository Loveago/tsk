import { prisma } from "../src/lib/prisma";
import { isLofaqCustomer, isEstablishedDataDealsCustomer, findLofaqStorefront } from "../src/lib/order-allocation";

async function run() {
  const phone = "0531196452";
  const ref = "GH-28-2026-FGE9SY";
  console.log(`Diagnosing why order ${ref} for phone ${phone} was not diverted to Lofaq...\n`);

  // 1. Order in DB
  const order = await prisma.storefrontOrder.findUnique({
    where: { paymentReference: ref },
    include: { storefront: true },
  });
  console.log("Storefront where order is assigned:", order?.storefront.slug);

  // 2. Is phone sticky to Lofaq?
  const isLofaq = await isLofaqCustomer(phone);
  console.log("isLofaqCustomer(phone):", isLofaq);

  // 3. Is phone established on Data Deals?
  const isDD = await isEstablishedDataDealsCustomer(phone);
  console.log("isEstablishedDataDealsCustomer(phone):", isDD);

  // 4. Lofaq storefront lookup
  const lofaq = await findLofaqStorefront();
  console.log("findLofaqStorefront():", lofaq ? `${lofaq.name} (${lofaq.id})` : "NOT FOUND");

  // 5. System settings
  const rawRatio = await prisma.systemSetting.findUnique({ where: { key: "datadeals_lofaq_ratio" } });
  const rawCap = await prisma.systemSetting.findUnique({ where: { key: "datadeals_lofaq_sticky_cap" } });
  console.log("datadeals_lofaq_ratio:", rawRatio?.value);
  console.log("datadeals_lofaq_sticky_cap:", rawCap?.value);

  // 6. Lofaq orders for this phone
  if (lofaq) {
    const lOrders = await prisma.storefrontOrder.findMany({
      where: { storefrontId: lofaq.id, customerPhone: { contains: phone.slice(-9) } },
      select: { paymentReference: true, createdAt: true },
    });
    console.log(`Orders for ${phone} on Lofaq:`, lOrders.length);
    lOrders.forEach((o) => console.log(` - ${o.paymentReference} at ${o.createdAt.toISOString()}`));
  }

  // 7. Data Deals orders for this phone
  const ddOrders = await prisma.storefrontOrder.findMany({
    where: {
      storefront: { slug: { in: ["data-deals", "data-dealsgh", "data-deqls"] } },
      customerPhone: { contains: phone.slice(-9) },
    },
    select: { paymentReference: true, createdAt: true },
  });
  console.log(`Orders for ${phone} on Data Deals:`, ddOrders.length);
  ddOrders.forEach((o) => console.log(` - ${o.paymentReference} at ${o.createdAt.toISOString()}`));

  await prisma.$disconnect();
}

run();
