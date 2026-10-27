import { prisma } from "../src/lib/prisma";

const countArg = process.argv.find((a) => a.startsWith("--count="));
const MOVE_COUNT = countArg ? parseInt(countArg.split("=")[1], 10) : 400;
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
  });
  const datadeals = await prisma.storefront.findFirst({
    where: { OR: [{ slug: "data-deals" }, { slug: "data-deqls" }] },
  });
  if (!lofaq) {
    console.log("Lofaq not found");
    process.exit(1);
  }
  if (!datadeals) {
    console.log("Data Deals not found");
    process.exit(1);
  }

  console.log("Lofaq:", lofaq.name, lofaq.id);
  console.log("Data Deals:", datadeals.name, datadeals.id);

  // Get all unique phones on Lofaq
  const lofaqOrders = await prisma.storefrontOrder.findMany({
    where: { storefrontId: lofaq.id },
    select: { customerPhone: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const firstSeen = new Map<string, Date>();
  for (const o of lofaqOrders) {
    if (!firstSeen.has(o.customerPhone)) firstSeen.set(o.customerPhone, o.createdAt);
  }

  // Randomly shuffle and pick MOVE_COUNT phones
  const allPhones = [...firstSeen.keys()];
  for (let i = allPhones.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allPhones[i], allPhones[j]] = [allPhones[j], allPhones[i]];
  }
  const phonesToMove = allPhones.slice(0, MOVE_COUNT);
  console.log("\nTotal unique phones on Lofaq:", allPhones.length);
  console.log("Phones to move back to Data Deals:", phonesToMove.length);

  // Get all their orders on Lofaq
  const ordersToMove = await prisma.storefrontOrder.findMany({
    where: { storefrontId: lofaq.id, customerPhone: { in: phonesToMove } },
    include: { product: { include: { dataPackage: true } } },
  });
  console.log("Total orders to move:", ordersToMove.length);

  if (DRY_RUN) {
    console.log("\n[DRY RUN] Sample of phones that would be moved:");
    phonesToMove.slice(0, 10).forEach((p) => console.log(" -", p));
    if (phonesToMove.length > 10) console.log(" ... and", phonesToMove.length - 10, "more");
    await prisma.$disconnect();
    return;
  }

  // For each order, find/create matching Data Deals product and reassign
  let moved = 0;
  for (const order of ordersToMove) {
    const packageId = order.product.packageId;

    // Find or create the Data Deals equivalent product
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

  // Remove those phones and refs from diverted settings
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
    console.log("\ndatadeals_diverted_phones:", before, "->", phones.length);
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
    console.log("datadeals_diverted_references:", before, "->", refs.length);
  }

  console.log("\nMoved", moved, "orders back to Data Deals.");
  console.log("These phones are now fully un-sticky from Lofaq.");
  await prisma.$disconnect();
}
run();
