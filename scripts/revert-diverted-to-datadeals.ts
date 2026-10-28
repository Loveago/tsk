/**
 * revert-diverted-to-datadeals.ts
 *
 * Moves StorefrontOrder rows that were diverted from Data Deals to Lofaq
 * back to the canonical Data Deals storefront.
 *
 * COMMISSIONS AND WALLET ENTRIES ARE NOT TOUCHED.
 *
 * Usage:
 *   npx tsx scripts/revert-diverted-to-datadeals.ts           # dry-run (safe)
 *   npx tsx scripts/revert-diverted-to-datadeals.ts --apply   # write changes
 */

import { prisma } from "../src/lib/prisma";

const DRY_RUN = !process.argv.includes("--apply");

async function run() {
  console.log("=".repeat(62));
  console.log("       REVERT DIVERTED ORDERS → DATA DEALS");
  console.log("=".repeat(62));
  console.log(DRY_RUN ? "  MODE: DRY RUN (pass --apply to write changes)" : "  MODE: APPLY — changes will be written to the database");
  console.log("=".repeat(62));

  // ── 1. Resolve storefronts ────────────────────────────────────────────────

  const lofaq = await prisma.storefront.findFirst({
    where: {
      OR: [
        { slug: "lofaq-data-hub" },
        { slug: "lofaq" },
        { name: { contains: "lofaq", mode: "insensitive" } },
      ],
    },
    select: { id: true, slug: true, name: true },
  });

  if (!lofaq) {
    console.error("ERROR: Could not find Lofaq storefront. Aborting.");
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log(`\nLofaq storefront  : ${lofaq.name} (id: ${lofaq.id}, slug: ${lofaq.slug})`);

  // Try canonical DD slugs in priority order
  const datadeals = await prisma.storefront.findFirst({
    where: {
      OR: [
        { slug: "data-dealsgh" },
        { slug: "data-deals" },
        { slug: "data-deqls" },
        { name: { contains: "data deals", mode: "insensitive" } },
      ],
    },
    select: { id: true, slug: true, name: true },
  });

  if (!datadeals) {
    console.error("ERROR: Could not find Data Deals storefront. Aborting.");
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log(`Data Deals storefront: ${datadeals.name} (id: ${datadeals.id}, slug: ${datadeals.slug})`);

  // ── 2. Load diverted reference & phone sets from SystemSetting ────────────

  const [refSetting, phoneSetting] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { key: "datadeals_diverted_references" } }),
    prisma.systemSetting.findUnique({ where: { key: "datadeals_diverted_phones" } }),
  ]);

  const divertedRefs: Set<string> = new Set(
    refSetting ? (JSON.parse(refSetting.value) as string[]) : []
  );
  const divertedPhones: Set<string> = new Set(
    phoneSetting ? (JSON.parse(phoneSetting.value) as string[]) : []
  );

  console.log(`\nDiverted references in DB : ${divertedRefs.size}`);
  console.log(`Diverted phones in DB     : ${divertedPhones.size}`);

  // ── 3. Find Lofaq orders that match diverted refs or phones ───────────────

  // Primary: match by paymentReference (most precise)
  const byRef = divertedRefs.size > 0
    ? await prisma.storefrontOrder.findMany({
        where: {
          storefrontId: lofaq.id,
          paymentReference: { in: [...divertedRefs] },
        },
        select: {
          id: true,
          paymentReference: true,
          customerPhone: true,
          commission: true,
          commissionState: true,
          status: true,
          createdAt: true,
        },
      })
    : [];

  // Secondary (belt-and-suspenders): match by customerPhone
  const byPhone = divertedPhones.size > 0
    ? await prisma.storefrontOrder.findMany({
        where: {
          storefrontId: lofaq.id,
          customerPhone: { in: [...divertedPhones] },
          // exclude those already found by ref (dedup happens below anyway)
        },
        select: {
          id: true,
          paymentReference: true,
          customerPhone: true,
          commission: true,
          commissionState: true,
          status: true,
          createdAt: true,
        },
      })
    : [];

  // Deduplicate by id
  const orderMap = new Map(
    [...byRef, ...byPhone].map((o) => [o.id, o])
  );
  const orders = [...orderMap.values()];

  console.log(`\nOrders found via payment reference : ${byRef.length}`);
  console.log(`Orders found via customer phone    : ${byPhone.length}`);
  console.log(`Total unique orders to revert      : ${orders.length}`);

  if (orders.length === 0) {
    console.log("\nNothing to revert. All diverted orders may have already been moved.");
    await prisma.$disconnect();
    return;
  }

  // ── 4. Print order details ────────────────────────────────────────────────

  console.log("\n" + "-".repeat(62));
  console.log(
    "  #  | Payment Reference               | Phone        | Status     | CommState | Commission"
  );
  console.log("-".repeat(62));

  orders.forEach((o, i) => {
    const commGHS = (o.commission / 100).toFixed(2);
    console.log(
      `  ${String(i + 1).padStart(3, " ")}| ${o.paymentReference.padEnd(32)} | ${o.customerPhone.padEnd(12)} | ${o.status.padEnd(10)} | ${o.commissionState.padEnd(9)} | GHS ${commGHS}`
    );
  });

  const totalCommission = orders.reduce((sum, o) => sum + o.commission, 0);
  console.log("-".repeat(62));
  console.log(`  Total commission across these orders: GHS ${(totalCommission / 100).toFixed(2)}`);
  console.log("  (Commission will NOT be changed — Lofaq's wallet keeps it.)");
  console.log("-".repeat(62));

  // ── 5. Apply or dry-run ───────────────────────────────────────────────────

  if (DRY_RUN) {
    console.log(`\n[DRY RUN] Would move ${orders.length} orders from Lofaq → Data Deals.`);
    console.log(`          Run with --apply to execute.\n`);
  } else {
    const orderIds = orders.map((o) => o.id);

    const result = await prisma.storefrontOrder.updateMany({
      where: { id: { in: orderIds } },
      data: { storefrontId: datadeals.id },
    });

    console.log(`\n✅ Moved ${result.count} orders from Lofaq → Data Deals.`);
    console.log(`   storefrontId changed to: ${datadeals.id} (${datadeals.name})`);
    console.log(`   Commission, commissionState, productId, productCost: UNTOUCHED`);
    console.log(`   StorefrontWallet / StorefrontWalletTransaction:       UNTOUCHED\n`);
  }

  console.log("=".repeat(62));
  await prisma.$disconnect();
}

run().catch(async (err) => {
  console.error("Fatal error:", err);
  await prisma.$disconnect();
  process.exit(1);
});
