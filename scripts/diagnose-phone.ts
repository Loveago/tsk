import { prisma } from "../src/lib/prisma";

async function run() {
  const phone = process.argv.find((a) => a.startsWith("--phone="))?.split("=")[1]?.trim() || "0549080689";
  const last9 = phone.replace(/\D/g, "").slice(-9);

  console.log(`Diagnosing why ${phone} was diverted...`);

  // 1. Is it in datadeals_diverted_phones?
  const rawPhones = await prisma.systemSetting.findUnique({
    where: { key: "datadeals_diverted_phones" },
  });
  const list: string[] = rawPhones?.value ? JSON.parse(rawPhones.value) : [];
  const inDivertedList = list.some((p) => p.includes(last9));
  console.log(`1. In datadeals_diverted_phones setting: ${inDivertedList}`);

  // 2. Does it have prior orders on Data Deals?
  const datadeals = await prisma.storefront.findFirst({
    where: { OR: [{ slug: "data-deals" }, { slug: "data-deqls" }] },
  });
  if (datadeals) {
    const ddOrders = await prisma.storefrontOrder.findMany({
      where: {
        storefrontId: datadeals.id,
        OR: [{ customerPhone: phone }, { customerPhone: { contains: last9 } }],
      },
      select: { paymentReference: true, createdAt: true },
    });
    console.log(`2. Prior orders on Data Deals: ${ddOrders.length}`);
    ddOrders.forEach((o) => console.log(`   - ${o.paymentReference} at ${o.createdAt.toISOString()}`));
  }

  // 3. Does it have prior orders on Lofaq?
  const lofaq = await prisma.storefront.findFirst({
    where: { OR: [{ slug: "lofaq-data-hub" }, { slug: "lofaq" }] },
  });
  if (lofaq) {
    const lofaqOrders = await prisma.storefrontOrder.findMany({
      where: {
        storefrontId: lofaq.id,
        OR: [{ customerPhone: phone }, { customerPhone: { contains: last9 } }],
      },
      select: { paymentReference: true, createdAt: true },
    });
    console.log(`3. Orders on Lofaq: ${lofaqOrders.length}`);
    lofaqOrders.forEach((o) => console.log(`   - ${o.paymentReference} at ${o.createdAt.toISOString()}`));
  }

  await prisma.$disconnect();
}

run();
