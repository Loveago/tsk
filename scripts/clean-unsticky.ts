import { prisma } from "../src/lib/prisma";

const phoneArg = process.argv.find((a) => a.startsWith("--phone="));
const PHONE = phoneArg ? phoneArg.split("=")[1].trim() : "0551283767";

async function run() {
  const last9 = PHONE.replace(/\D/g, "").slice(-9);

  // 1. Find Lofaq and Data Deals storefronts
  const lofaq = await prisma.storefront.findFirst({
    where: {
      OR: [
        { slug: "lofaq-data-hub" },
        { slug: "lofaq" },
        { name: { contains: "lofaq", mode: "insensitive" } },
      ],
    },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  const datadeals = await prisma.storefront.findFirst({
    where: {
      OR: [{ slug: "data-deals" }, { slug: "data-deqls" }],
    },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  if (!lofaq || !datadeals) {
    console.log("Storefronts not found");
    process.exit(1);
  }

  console.log(`Lofaq owner: ${lofaq.user.name} (${lofaq.user.email}) [${lofaq.userId}]`);
  console.log(`Data Deals owner: ${datadeals.user.name} (${datadeals.user.email}) [${datadeals.userId}]`);

  // 2. Find all StorefrontOrders for this phone (on Lofaq or Data Deals)
  const sfOrders = await prisma.storefrontOrder.findMany({
    where: {
      OR: [{ customerPhone: PHONE }, { customerPhone: { contains: last9 } }],
    },
    include: { product: true },
  });

  console.log(`Found ${sfOrders.length} StorefrontOrders for phone ${PHONE}`);
  const refs = sfOrders.map((o) => o.paymentReference);
  const underlyingIds = sfOrders
    .map((o) => o.underlyingOrderId)
    .filter((id): id is number => id !== null && id !== undefined);

  // 3. Delete ANY wallet transactions that mention this phone or order references
  const deletedTx = await prisma.storefrontWalletTransaction.deleteMany({
    where: {
      OR: [
        { reference: { in: refs } },
        { description: { contains: PHONE } },
        { description: { contains: "Reattribution" } },
      ],
    },
  });
  console.log(`Deleted wallet transaction logs: ${deletedTx.count}`);

  // 4. Update underlying Order records so the "User" column displays the Data Deals owner instead of Lofaq owner
  const updatedOrders = await prisma.order.updateMany({
    where: {
      OR: [
        { phoneNumber: PHONE },
        { phoneNumber: { contains: last9 } },
        { id: { in: underlyingIds } },
      ],
    },
    data: {
      userId: datadeals.userId,
    },
  });
  console.log(`Updated underlying Order records (reassigned User to Data Deals): ${updatedOrders.count}`);

  // 5. Move any StorefrontOrders to Data Deals
  for (const order of sfOrders) {
    if (order.storefrontId !== datadeals.id) {
      let ddProduct = await prisma.storefrontProduct.findFirst({
        where: {
          storefrontId: datadeals.id,
          packageId: order.product.packageId,
        },
      });

      if (!ddProduct) {
        ddProduct = await prisma.storefrontProduct.create({
          data: {
            storefrontId: datadeals.id,
            packageId: order.product.packageId,
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
      console.log(`Moved StorefrontOrder ${order.paymentReference} to Data Deals`);
    }
  }

  // 6. Clean up system settings
  const rawPhones = await prisma.systemSetting.findUnique({
    where: { key: "datadeals_diverted_phones" },
  });
  if (rawPhones?.value) {
    let list: string[] = JSON.parse(rawPhones.value);
    const before = list.length;
    list = list.filter((p) => !p.includes(last9));
    await prisma.systemSetting.update({
      where: { key: "datadeals_diverted_phones" },
      data: { value: JSON.stringify(list) },
    });
    console.log(`datadeals_diverted_phones: ${before} -> ${list.length}`);
  }

  const rawRefs = await prisma.systemSetting.findUnique({
    where: { key: "datadeals_diverted_references" },
  });
  if (rawRefs?.value) {
    let list: string[] = JSON.parse(rawRefs.value);
    const before = list.length;
    const refSet = new Set(refs);
    list = list.filter((r) => !refSet.has(r));
    await prisma.systemSetting.update({
      where: { key: "datadeals_diverted_references" },
      data: { value: JSON.stringify(list) },
    });
    console.log(`datadeals_diverted_references: ${before} -> ${list.length}`);
  }

  console.log(`\nDone! All logs wiped and user ownership reassigned for ${PHONE}`);
  await prisma.$disconnect();
}

run();
