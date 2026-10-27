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
    console.log("Lofaq storefront not found");
    process.exit(1);
  }

  // 1. Direct storefront orders on Lofaq
  const orders = await prisma.storefrontOrder.findMany({
    where: { storefrontId: lofaq.id },
    select: { customerPhone: true },
    distinct: ["customerPhone"],
  });

  const orderPhoneSet = new Set<string>();
  orders.forEach((o) => {
    if (o.customerPhone) {
      orderPhoneSet.add(o.customerPhone.trim());
      const digits = o.customerPhone.replace(/\D/g, "");
      if (digits.length >= 9) orderPhoneSet.add(digits.slice(-9));
    }
  });

  // 2. Filter diverted phones setting to ONLY phones that have active Lofaq orders
  const rawPhones = await prisma.systemSetting.findUnique({
    where: { key: "datadeals_diverted_phones" },
  });

  if (rawPhones?.value) {
    let phones: string[] = JSON.parse(rawPhones.value);
    const before = phones.length;
    phones = phones.filter((p) => {
      const clean = p.trim();
      const digits = clean.replace(/\D/g, "");
      const last9 = digits.slice(-9);
      return orderPhoneSet.has(clean) || orderPhoneSet.has(last9);
    });

    await prisma.systemSetting.update({
      where: { key: "datadeals_diverted_phones" },
      data: { value: JSON.stringify(phones) },
    });
    console.log(`datadeals_diverted_phones cleaned: ${before} -> ${phones.length}`);
  }

  // 3. Combined total unique sticky phones
  const finalCheck = await prisma.storefrontOrder.findMany({
    where: { storefrontId: lofaq.id },
    select: { customerPhone: true },
    distinct: ["customerPhone"],
  });

  const rawPhonesAfter = await prisma.systemSetting.findUnique({
    where: { key: "datadeals_diverted_phones" },
  });
  const divertedAfter: string[] = rawPhonesAfter?.value ? JSON.parse(rawPhonesAfter.value) : [];

  const allPhones = new Set<string>();
  finalCheck.forEach((o) => {
    if (o.customerPhone) allPhones.add(o.customerPhone.trim());
  });
  divertedAfter.forEach((p) => {
    if (p) allPhones.add(p.trim());
  });

  console.log("==========================================");
  console.log("           LOFAQ STICKY REPORT            ");
  console.log("==========================================");
  console.log(`Unique phones with Lofaq orders:   ${finalCheck.length}`);
  console.log(`Diverted phones in settings:      ${divertedAfter.length}`);
  console.log(`TOTAL ACTIVE STICKY PHONES:       ${allPhones.size}`);
  console.log("==========================================");

  await prisma.$disconnect();
}

run();
