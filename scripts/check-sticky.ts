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

  const ratio = await prisma.systemSetting.findUnique({ where: { key: "datadeals_lofaq_ratio" } });
  const cap = await prisma.systemSetting.findUnique({ where: { key: "datadeals_lofaq_sticky_cap" } });
  const capNum = cap?.value ? parseInt(cap.value, 10) : 1000;

  // Raw count of unique phones that have any Lofaq order
  const rawAllPhones = await prisma.storefrontOrder.groupBy({
    by: ["customerPhone"],
    where: { storefrontId: lofaq.id, customerPhone: { not: null } },
  });
  const rawDbCount = rawAllPhones.length;

  // Cap-aware effective sticky count: ONLY the oldest capNum phones are treated as sticky by live code
  const phoneDates = await prisma.storefrontOrder.groupBy({
    by: ["customerPhone"],
    where: { storefrontId: lofaq.id, customerPhone: { not: null } },
    _min: { createdAt: true },
    orderBy: { _min: { createdAt: "asc" } },
    take: capNum,
  });
  const effectiveStickyCount = phoneDates.length;

  const rawPhones = await prisma.systemSetting.findUnique({ where: { key: "datadeals_diverted_phones" } });
  const divertedPhones: string[] = rawPhones?.value ? JSON.parse(rawPhones.value) : [];

  const overCap = rawDbCount - capNum;

  console.log("==========================================");
  console.log("           LOFAQ STICKY REPORT            ");
  console.log("==========================================");
  console.log(`Unique phones in Lofaq DB (raw):  ${rawDbCount}`);
  console.log(`Effective sticky (cap-aware):     ${effectiveStickyCount}  <- what live code uses`);
  console.log(`Diverted phones in settings:      ${divertedPhones.length}`);
  console.log("------------------------------------------");
  console.log(`Sticky Cap (max allowed):         ${capNum}`);
  if (overCap > 0) {
    console.log(`OVER CAP by:                      ${overCap} phones (excess NOT treated as sticky)`);
    console.log(`  -> Run: npx tsx scripts/trim-lofaq-to-cap.ts --apply`);
  } else {
    console.log(`Cap status:                       OK (within limit)`);
  }
  console.log("------------------------------------------");
  console.log(`Allocation Ratio (per 10 orders): ${ratio?.value ?? "0"}`);
  console.log(`Allocation to Lofaq:              ${ratio?.value === "0" ? "DISABLED (OFF)" : "ACTIVE"}`);
  console.log("==========================================");

  await prisma.$disconnect();
}

run();
