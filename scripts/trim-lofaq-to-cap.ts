/**
 * trim-lofaq-to-cap.ts
 *
 * Finds any phones in Lofaq's orders that are BEYOND the cap (oldest 1,000 phones)
 * and moves their storefront orders back to the Data Deals storefront.
 *
 * Usage:
 *   npx tsx scripts/trim-lofaq-to-cap.ts            # dry run
 *   npx tsx scripts/trim-lofaq-to-cap.ts --apply    # actually moves orders
 */

import { prisma } from "../src/lib/prisma";

const DRY_RUN = !process.argv.includes("--apply");

async function run() {
  console.log("==========================================================================");
  console.log("              LOFAQ STICKY CAP ENFORCEMENT TRIM                          ");
  console.log("==========================================================================");
  if (DRY_RUN) console.log("[DRY RUN] Pass --apply to actually move orders.\n");

  const lofaq = await prisma.storefront.findFirst({
    where: { OR: [{ slug: "lofaq-data-hub" }, { slug: "lofaq" }, { name: { contains: "lofaq", mode: "insensitive" } }] },
  });
  if (!lofaq) { console.error("Lofaq storefront not found."); process.exit(1); }

  const datadeals = await prisma.storefront.findFirst({
    where: { OR: [{ slug: "data-dealsgh" }, { slug: "data-deals" }, { name: { contains: "data deals", mode: "insensitive" } }] },
  });
  if (!datadeals) { console.error("Data Deals storefront not found."); process.exit(1); }

  const capSetting = await prisma.systemSetting.findUnique({ where: { key: "datadeals_lofaq_sticky_cap" } });
  const cap = capSetting?.value ? parseInt(capSetting.value, 10) : 1000;
  console.log(`Lofaq: ${lofaq.name} | Data Deals: ${datadeals.name} | Cap: ${cap}\n`);

  // Get ALL unique phones sorted by first order date (oldest first)
  const allPhoneDates = await prisma.storefrontOrder.groupBy({
    by: ["customerPhone"],
    where: { storefrontId: lofaq.id, customerPhone: { not: null } },
    _min: { createdAt: true },
    orderBy: { _min: { createdAt: "asc" } },
  });

  const totalUnique = allPhoneDates.length;
  console.log(`Total unique phones on Lofaq: ${totalUnique}`);

  if (totalUnique <= cap) {
    console.log(`Already within cap (${totalUnique} <= ${cap}). Nothing to do.`);
    await prisma.$disconnect();
    return;
  }

  const excessPhones = allPhoneDates.slice(cap).map((r) => r.customerPhone).filter(Boolean) as string[];
  console.log(`Phones to KEEP (oldest ${cap}): ${cap}`);
  console.log(`Excess phones to move back to Data Deals: ${excessPhones.length}\n`);

  let movedOrders = 0;
  for (const phone of excessPhones) {
    const orders = await prisma.storefrontOrder.findMany({
      where: { storefrontId: lofaq.id, customerPhone: phone },
      select: { id: true, paymentReference: true, createdAt: true, commission: true, commissionState: true },
      orderBy: { createdAt: "asc" },
    });
    const firstDate = orders[0]?.createdAt?.toISOString().slice(0, 10) ?? "unknown";
    console.log(`  Phone: ${phone} | First on Lofaq: ${firstDate} | ${orders.length} order(s)`);
    for (const o of orders) {
      console.log(`    - Ref: ${o.paymentReference} | ${o.commissionState} | GHS ${(o.commission / 100).toFixed(2)}`);
    }
    if (!DRY_RUN) {
      await prisma.storefrontOrder.updateMany({
        where: { storefrontId: lofaq.id, customerPhone: phone },
        data: { storefrontId: datadeals.id },
      });
      movedOrders += orders.length;
      console.log(`    MOVED ${orders.length} order(s) to Data Deals.`);
    } else {
      console.log(`    [DRY RUN] Would move ${orders.length} order(s).`);
    }
  }

  // Remove excess phones from the diverted_phones setting too
  const rawPhonesSetting = await prisma.systemSetting.findUnique({ where: { key: "datadeals_diverted_phones" } });
  if (rawPhonesSetting?.value) {
    try {
      const list: string[] = JSON.parse(rawPhonesSetting.value);
      const excessVariants = new Set(excessPhones.flatMap((p) => {
        const d = p.replace(/\D/g, "");
        const l9 = d.length >= 9 ? d.slice(-9) : "";
        return [p, l9, "0"+l9, "233"+l9, "+233"+l9].filter(Boolean);
      }));
      const filtered = list.filter((p) => !excessVariants.has(p.trim()));
      if (filtered.length < list.length) {
        console.log(`\nRemoving ${list.length - filtered.length} entries from datadeals_diverted_phones setting.`);
        if (!DRY_RUN) {
          await prisma.systemSetting.update({ where: { key: "datadeals_diverted_phones" }, data: { value: JSON.stringify(filtered) } });
          console.log("  Setting updated.");
        } else {
          console.log("  [DRY RUN] Would update datadeals_diverted_phones.");
        }
      }
    } catch {}
  }

  console.log("\n==========================================================================");
  if (DRY_RUN) {
    console.log(`[DRY RUN] Would move orders for ${excessPhones.length} phone(s) to Data Deals.`);
    console.log("Run with --apply to execute.");
  } else {
    console.log(`Done. Moved ${movedOrders} order(s) for ${excessPhones.length} phone(s) to Data Deals.`);
    console.log(`Lofaq sticky count is now capped at exactly ${cap}.`);
  }
  console.log("==========================================================================");
  await prisma.$disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });
