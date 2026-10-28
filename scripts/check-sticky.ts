import { prisma } from "../src/lib/prisma";
import {
  extractPhoneCore9,
  getDataDealsStorefrontIds,
  DIVERTED_PHONES_SETTING_KEY,
} from "../src/lib/order-allocation";

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

  // 1. All unique phones on Lofaq with their first order date
  const lofaqOrders = await prisma.storefrontOrder.groupBy({
    by: ["customerPhone"],
    where: { storefrontId: lofaq.id, customerPhone: { gt: "" } },
    _min: { createdAt: true },
    orderBy: { _min: { createdAt: "asc" } },
  });
  const totalLofaqPhones = lofaqOrders.length;

  // 2. Data Deals storefront IDs
  const dataDealsIds = await getDataDealsStorefrontIds();

  // 3. Unique phone cores on Data Deals
  const ddPhoneRows = dataDealsIds.length > 0
    ? await prisma.storefrontOrder.findMany({
        where: { storefrontId: { in: dataDealsIds }, customerPhone: { gt: "" } },
        select: { customerPhone: true },
        distinct: ["customerPhone"],
      })
    : [];
  const ddPhoneCores = new Set(
    ddPhoneRows
      .map((r) => extractPhoneCore9(r.customerPhone || ""))
      .filter((c) => c.length >= 9)
  );

  // 4. Diverted phones recorded in system settings
  const rawPhones = await prisma.systemSetting.findUnique({ where: { key: DIVERTED_PHONES_SETTING_KEY } });
  const divertedPhones: string[] = rawPhones?.value ? JSON.parse(rawPhones.value) : [];
  const divertedSettingCores = new Set(
    divertedPhones
      .map(extractPhoneCore9)
      .filter((c) => c.length >= 9)
  );

  // 5. Categorize each Lofaq customer:
  //    - Diverted Data Deals customer (counts toward the 1,000 cap)
  //    - Direct Lofaq buyer (unlimited, never touches Data Deals)
  let directBuyerCount = 0;
  let divertedCount = 0;
  for (const row of lofaqOrders) {
    const p = row.customerPhone;
    if (!p) continue;
    const core = extractPhoneCore9(p);
    if (core && (ddPhoneCores.has(core) || divertedSettingCores.has(core))) {
      divertedCount++;
    } else {
      directBuyerCount++;
    }
  }

  const overCap = Math.max(0, divertedCount - capNum);
  const remainingSlots = Math.max(0, capNum - divertedCount);

  console.log("==========================================");
  console.log("           LOFAQ STICKY REPORT            ");
  console.log("==========================================");
  console.log(`Total unique phones on Lofaq (all):  ${totalLofaqPhones}`);
  console.log(`  • Direct Lofaq buyers (unlimited): ${directBuyerCount}  (never ordered on Data Deals)`);
  console.log(`  • Diverted from Data Deals:        ${divertedCount}  (counts toward the 1,000 cap)`);
  console.log("------------------------------------------");
  console.log(`Sticky Cap (max allowed diverted):   ${capNum}`);
  if (overCap > 0) {
    console.log(`OVER CAP by:                         ${overCap} diverted phones (excess NOT treated as sticky)`);
    console.log(`  -> Run: npx tsx scripts/trim-lofaq-to-cap.ts --apply`);
  } else {
    console.log(`Cap status:                          OK (${remainingSlots} slots remaining for diversion)`);
  }
  console.log("------------------------------------------");
  console.log(`Allocation Ratio (per 10 orders):    ${ratio?.value ?? "0"}`);
  console.log(`Allocation to Lofaq:                 ${ratio?.value === "0" ? "DISABLED (OFF)" : "ACTIVE"}`);
  console.log("==========================================");

  await prisma.$disconnect();
}

run();
