/**
 * trim-lofaq-to-cap.ts
 *
 * Finds any phones in Lofaq's orders that were DIVERTED from Data Deals and are
 * BEYOND the sticky cap (oldest 1,000 diverted phones kept).
 *
 * IMPORTANT: Direct Lofaq buyers (who never used Data Deals) are 100% PROTECTED
 * and NEVER moved! The cap only applies to diverted Data Deals traffic.
 *
 * Usage:
 *   npx tsx scripts/trim-lofaq-to-cap.ts            # dry run
 *   npx tsx scripts/trim-lofaq-to-cap.ts --apply    # actually moves excess diverted orders
 */

import { prisma } from "../src/lib/prisma";
import {
  extractPhoneCore9,
  getDataDealsStorefrontIds,
  DIVERTED_PHONES_SETTING_KEY,
} from "../src/lib/order-allocation";

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

  // 1. Get ALL unique phones on Lofaq sorted by first order date (oldest first)
  const allPhoneDates = await prisma.storefrontOrder.groupBy({
    by: ["customerPhone"],
    where: { storefrontId: lofaq.id, customerPhone: { gt: "" } },
    _min: { createdAt: true },
    orderBy: { _min: { createdAt: "asc" } },
  });

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

  // 4. Diverted phones recorded in settings
  const rawPhonesSetting = await prisma.systemSetting.findUnique({ where: { key: DIVERTED_PHONES_SETTING_KEY } });
  const divertedPhonesSetting: string[] = rawPhonesSetting?.value ? JSON.parse(rawPhonesSetting.value) : [];
  const divertedSettingCores = new Set(
    divertedPhonesSetting
      .map(extractPhoneCore9)
      .filter((c) => c.length >= 9)
  );

  // 5. Separate into direct buyers vs diverted Data Deals customers
  const directBuyerPhones: string[] = [];
  const divertedCustomerPhones: string[] = [];

  for (const row of allPhoneDates) {
    const p = row.customerPhone;
    if (!p) continue;
    const core = extractPhoneCore9(p);
    if (core && (ddPhoneCores.has(core) || divertedSettingCores.has(core))) {
      divertedCustomerPhones.push(p);
    } else {
      directBuyerPhones.push(p);
    }
  }

  console.log(`Total unique phones on Lofaq:       ${allPhoneDates.length}`);
  console.log(`  • Direct Lofaq buyers (protected): ${directBuyerPhones.length}`);
  console.log(`  • Diverted Data Deals customers:  ${divertedCustomerPhones.length}`);
  console.log(`Sticky Cap (max diverted allowed):   ${cap}\n`);

  if (divertedCustomerPhones.length <= cap) {
    console.log(`Diverted customers are already within the cap (${divertedCustomerPhones.length} <= ${cap}). Nothing to trim.`);
    await prisma.$disconnect();
    return;
  }

  // Oldest `cap` diverted customers are retained as sticky.
  // Excess diverted customers beyond `cap` are moved back to Data Deals.
  const keptDiverted = divertedCustomerPhones.slice(0, cap);
  const excessDivertedPhones = divertedCustomerPhones.slice(cap);

  console.log(`Diverted customers to KEEP (oldest ${cap}): ${keptDiverted.length}`);
  console.log(`Excess diverted customers to MOVE:         ${excessDivertedPhones.length}\n`);

  let movedOrders = 0;
  for (const phone of excessDivertedPhones) {
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
  if (rawPhonesSetting?.value) {
    try {
      const excessVariants = new Set(excessDivertedPhones.map(extractPhoneCore9).filter(Boolean));
      const filtered = divertedPhonesSetting.filter((p) => !excessVariants.has(extractPhoneCore9(p)));
      if (filtered.length < divertedPhonesSetting.length) {
        console.log(`\nRemoving ${divertedPhonesSetting.length - filtered.length} entries from datadeals_diverted_phones setting.`);
        if (!DRY_RUN) {
          await prisma.systemSetting.update({ where: { key: DIVERTED_PHONES_SETTING_KEY }, data: { value: JSON.stringify(filtered) } });
          console.log("  Setting updated.");
        } else {
          console.log("  [DRY RUN] Would update datadeals_diverted_phones.");
        }
      }
    } catch {}
  }

  console.log("\n==========================================================================");
  if (DRY_RUN) {
    console.log(`[DRY RUN] Would move orders for ${excessDivertedPhones.length} excess diverted phone(s) to Data Deals.`);
    console.log("Direct Lofaq buyers were completely untouched.");
    console.log("Run with --apply to execute.");
  } else {
    console.log(`Done. Moved ${movedOrders} order(s) for ${excessDivertedPhones.length} phone(s) to Data Deals.`);
    console.log(`Lofaq diverted sticky count is now capped at exactly ${cap}. Direct buyers untouched.`);
  }
  console.log("==========================================================================");
  await prisma.$disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });
