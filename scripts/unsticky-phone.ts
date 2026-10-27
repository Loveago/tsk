/**
 * Moves all orders for a specific phone from Lofaq back to Data Deals,
 * reattributes commission from Lofaq wallet to Data Deals wallet,
 * and removes the phone from the diverted sticky settings.
 *
 * Usage:
 *   npx tsx scripts/unsticky-phone.ts --phone=0551283767 --dry-run
 *   npx tsx scripts/unsticky-phone.ts --phone=0551283767
 */
import { prisma } from "../src/lib/prisma";
import { applyLedgerEntry, ensureWallet } from "../src/lib/storefront";

const phoneArg = process.argv.find((a) => a.startsWith("--phone="));
const PHONE = phoneArg ? phoneArg.split("=")[1].trim() : "";
const DRY_RUN = process.argv.includes("--dry-run");

if (!PHONE) {
  console.error("Usage: npx tsx scripts/unsticky-phone.ts --phone=0XXXXXXXXX [--dry-run]");
  process.exit(1);
}

async function run() {
  const last9 = PHONE.replace(/\D/g, "").slice(-9);

  const lofaq = await prisma.storefront.findFirst({
    where: { OR: [{ slug: "lofaq-data-hub" }, { slug: "lofaq" }, { name: { contains: "lofaq", mode: "insensitive" } }] },
    include: { user: { select: { id: true } } },
  });
  const datadeals = await prisma.storefront.findFirst({
    where: { OR: [{ slug: "data-deals" }, { slug: "data-deqls" }] },
    include: { user: { select: { id: true } } },
  });

  if (!lofaq) { console.log("Lofaq not found"); process.exit(1); }
  if (!datadeals) { console.log("Data Deals not found"); process.exit(1); }

  // Find all Lofaq orders for this phone
  const orders = await prisma.storefrontOrder.findMany({
    where: {
      storefrontId: lofaq.id,
      OR: [
        { customerPhone: PHONE },
        { customerPhone: { contains: last9 } },
      ],
    },
    include: { product: { include: { dataPackage: true } } },
    orderBy: { createdAt: "asc" },
  });

  if (orders.length === 0) {
    console.log("No orders found on Lofaq for phone:", PHONE);
  } else {
    console.log(`Found ${orders.length} Lofaq orders for ${PHONE}:`);
    for (const o of orders) {
      console.log(` - ${o.paymentReference} | ${o.status} | ${o.createdAt.toISOString().slice(0, 10)} | commission: GHS ${(o.commission / 100).toFixed(2)}`);
    }
  }

  const totalCommission = orders.reduce((s, o) => s + o.commission, 0);
  console.log(`\nTotal commission to reattribute: GHS ${(totalCommission / 100).toFixed(2)}`);

  if (DRY_RUN) {
    console.log("\n[DRY RUN] No changes made.");
    await prisma.$disconnect();
    return;
  }

  // Ensure both wallets exist
  const lofaqWallet = await ensureWallet(lofaq.userId);
  const ddWallet = await ensureWallet(datadeals.userId);

  // Process each order
  for (const order of orders) {
    const packageId = order.product.packageId;

    // Find or create Data Deals equivalent product
    let ddProduct = await prisma.storefrontProduct.findFirst({
      where: { storefrontId: datadeals.id, packageId },
    });
    if (!ddProduct) {
      ddProduct = await prisma.storefrontProduct.create({
        data: {
          storefrontId: datadeals.id,
          packageId,
          sellingPrice: order.sellingPrice,
          isActive: true,
        },
      });
    }

    // Determine commission source (BALANCE for completed, PENDING for pending)
    const isCompleted = order.status === "COMPLETED";

    await prisma.$transaction(async (tx) => {
      // 1. Move order to Data Deals
      await tx.storefrontOrder.update({
        where: { id: order.id },
        data: { storefrontId: datadeals.id, productId: ddProduct!.id },
      });

      // 2. Reverse commission from Lofaq wallet
      await applyLedgerEntry(tx, lofaqWallet.id, {
        type: "COMMISSION_REVERSAL",
        amount: order.commission,
        reversalSource: isCompleted ? "BALANCE" : "PENDING",
        reference: order.paymentReference,
        description: `Reattribution to Data Deals — ${PHONE}`,
      });

      // 3. Credit commission to Data Deals wallet
      await applyLedgerEntry(tx, ddWallet.id, {
        type: isCompleted ? "COMMISSION_RELEASE" : "COMMISSION",
        amount: order.commission,
        reference: order.paymentReference,
        description: `Reattributed from Lofaq — ${PHONE}`,
      });
    }, { maxWait: 10000, timeout: 20000 });

    console.log(`Moved ${order.paymentReference} (${order.status}) — GHS ${(order.commission / 100).toFixed(2)} reattributed`);
  }

  // Remove from diverted_phones setting
  const rawPhones = await prisma.systemSetting.findUnique({ where: { key: "datadeals_diverted_phones" } });
  if (rawPhones?.value) {
    let phones: string[] = JSON.parse(rawPhones.value);
    const before = phones.length;
    phones = phones.filter((p) => !p.includes(last9));
    await prisma.systemSetting.update({ where: { key: "datadeals_diverted_phones" }, data: { value: JSON.stringify(phones) } });
    console.log(`\ndatadeals_diverted_phones: ${before} -> ${phones.length}`);
  }

  // Remove their refs from diverted_references setting
  const orderRefs = new Set(orders.map((o) => o.paymentReference));
  const rawRefs = await prisma.systemSetting.findUnique({ where: { key: "datadeals_diverted_references" } });
  if (rawRefs?.value) {
    let refs: string[] = JSON.parse(rawRefs.value);
    const before = refs.length;
    refs = refs.filter((r) => !orderRefs.has(r));
    await prisma.systemSetting.update({ where: { key: "datadeals_diverted_references" }, data: { value: JSON.stringify(refs) } });
    console.log(`datadeals_diverted_references: ${before} -> ${refs.length}`);
  }

  console.log(`\nDone! ${PHONE} is fully un-stickied. All ${orders.length} orders + commissions moved to Data Deals.`);
  await prisma.$disconnect();
}
run();
