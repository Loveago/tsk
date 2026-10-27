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

  // 2. Diverted phones setting
  const rawPhones = await prisma.systemSetting.findUnique({
    where: { key: "datadeals_diverted_phones" },
  });
  const divertedPhones: string[] = rawPhones?.value ? JSON.parse(rawPhones.value) : [];

  // 3. Ratio & Cap settings
  const ratio = await prisma.systemSetting.findUnique({ where: { key: "datadeals_lofaq_ratio" } });
  const cap = await prisma.systemSetting.findUnique({ where: { key: "datadeals_lofaq_sticky_cap" } });

  // 4. Combined total unique sticky phones
  const allPhones = new Set<string>();
  orders.forEach((o) => {
    if (o.customerPhone) allPhones.add(o.customerPhone.trim());
  });
  divertedPhones.forEach((p) => {
    if (p) allPhones.add(p.trim());
  });

  console.log("==========================================");
  console.log("           LOFAQ STICKY REPORT            ");
  console.log("==========================================");
  console.log(`Unique phones with Lofaq orders:   ${orders.length}`);
  console.log(`Diverted phones in settings:      ${divertedPhones.length}`);
  console.log(`TOTAL ACTIVE STICKY PHONES:       ${allPhones.size}`);
  console.log("------------------------------------------");
  console.log(`Sticky Cap (max allowed):         ${cap?.value ?? "1000"}`);
  console.log(`Allocation Ratio (per 10 orders): ${ratio?.value ?? "0"}`);
  console.log(`Allocation to Lofaq:              ${ratio?.value === "0" ? "DISABLED (OFF)" : "ACTIVE"}`);
  console.log("==========================================");

  await prisma.$disconnect();
}

run();
