import { prisma } from "../src/lib/prisma";

const targetArg = process.argv.find((a) => a.startsWith("--target="));
const TARGET_COUNT = targetArg ? parseInt(targetArg.split("=")[1], 10) : 1000;
const DRY_RUN = process.argv.includes("--dry-run");

async function run() {
  // Find storefronts
  const lofaq = await prisma.storefront.findFirst({
    where: {
      OR: [
        { slug: "lofaq-data-hub" },
        { slug: "lofaq" },
        { name: { contains: "lofaq", mode: "insensitive" } },
      ],
    },
    include: { user: { select: { id: true } } },
  });
  const datadeals = await prisma.storefront.findFirst({
    where: { OR: [{ slug: "data-deals" }, { slug: "data-deqls" }] },
    include: { user: { select: { id: true } } },
  });

  if (!lofaq || !datadeals) {
    console.log("Storefronts not found");
    process.exit(1);
  }

  console.log("Lofaq:", lofaq.name, lofaq.id);
  console.log("Data Deals:", datadeals.name, datadeals.id);

  // Get all unique phones currently having orders on Lofaq
  const lofaqOrders = await prisma.storefrontOrder.findMany({
    where: { storefrontId: lofaq.id },
    select: { customerPhone: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const uniquePhonesMap = new Map<string, Date>();
  for (const o of lofaqOrders) {
    if (!uniquePhonesMap.has(o.customerPhone)) {
      uniquePhonesMap.set(o.customerPhone, o.createdAt);
    }
  }

  const allPhones = [...uniquePhonesMap.keys()];
  const currentTotal = allPhones.length;
  console.log(`\nCurrent unique phones on Lofaq: ${currentTotal}`);
  console.log(`Target sticky phones: ${TARGET_COUNT}`);

  if (currentTotal <= TARGET_COUNT) {
    console.log(`Already at or below target (${currentTotal} <= ${TARGET_COUNT}). Nothing to move.`);
    await prisma.$disconnect();
    return;
  }

  const phonesToMoveCount = currentTotal - TARGET_COUNT;
  console.log(`Phones to move back to Data Deals: ${phonesToMoveCount}`);

  // Randomly shuffle phones to pick the ones to move
  for (let i = allPhones.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allPhones[i], allPhones[j]] = [allPhones[j], allPhones[i]];
  }
  const phonesToMove = allPhones.slice(0, phonesToMoveCount);

  // Find all StorefrontOrders for these phones on Lofaq
  const ordersToMove = await prisma.storefrontOrder.findMany({
    where: { storefrontId: lofaq.id, customerPhone: { in: phonesToMove } },
    include: { product: { include: { dataPackage: true } } },
  });
  console.log(`Total orders to move: ${ordersToMove.length}`);

  if (DRY_RUN) {
    console.log(`\n[DRY RUN] Will bring Lofaq sticky phones from ${currentTotal} down to ${TARGET_COUNT}.`);
    console.log("Sample of phones that will be moved:");
    phonesToMove.slice(0, 10).forEach((p) => console.log(" -", p));
    if (phonesToMove.length > 10) console.log(` ... and ${phonesToMove.length - 10} more`);
    await prisma.$disconnect();
    return;
  }

  // Move orders to Data Deals and reassign underlying Order userId
  let moved = 0;
  const underlyingOrderIds: number[] = [];

  for (const order of ordersToMove) {
    if (order.underlyingOrderId) {
      underlyingOrderIds.push(order.underlyingOrderId);
    }

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

    await prisma.storefrontOrder.update({
      where: { id: order.id },
      data: {
        storefrontId: datadeals.id,
        productId: ddProduct.id,
      },
    });
    moved++;
  }

  // Reassign underlying Order userId to Data Deals owner so "User" column displays correctly
  if (underlyingOrderIds.length > 0) {
    const updatedUnderlying = await prisma.order.updateMany({
      where: { id: { in: underlyingOrderIds } },
      data: { userId: datadeals.userId },
    });
    console.log(`Reassigned ${updatedUnderlying.count} underlying orders to Data Deals owner.`);
  }

  // Remove phones & payment references from system settings
  const phonesSet = new Set(phonesToMove);
  const rawPhones = await prisma.systemSetting.findUnique({
    where: { key: "datadeals_diverted_phones" },
  });
  if (rawPhones?.value) {
    let phones: string[] = JSON.parse(rawPhones.value);
    const before = phones.length;
    phones = phones.filter((p) => {
      const last9 = p.replace(/\D/g, "").slice(-9);
      return !phonesSet.has(p) && !phonesSet.has("0" + last9);
    });
    await prisma.systemSetting.update({
      where: { key: "datadeals_diverted_phones" },
      data: { value: JSON.stringify(phones) },
    });
    console.log(`datadeals_diverted_phones: ${before} -> ${phones.length}`);
  }

  const movedRefs = new Set(ordersToMove.map((o) => o.paymentReference));
  const rawRefs = await prisma.systemSetting.findUnique({
    where: { key: "datadeals_diverted_references" },
  });
  if (rawRefs?.value) {
    let refs: string[] = JSON.parse(rawRefs.value);
    const before = refs.length;
    refs = refs.filter((r) => !movedRefs.has(r));
    await prisma.systemSetting.update({
      where: { key: "datadeals_diverted_references" },
      data: { value: JSON.stringify(refs) },
    });
    console.log(`datadeals_diverted_references: ${before} -> ${refs.length}`);
  }

  console.log(`\nSuccessfully moved ${moved} orders back to Data Deals.`);
  console.log(`Lofaq sticky phones count brought down to ~${TARGET_COUNT}.`);
  await prisma.$disconnect();
}

run();
