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
    include: { user: { select: { id: true } } },
  });

  const datadeals = await prisma.storefront.findFirst({
    where: {
      OR: [{ slug: "data-deals" }, { slug: "data-deqls" }],
    },
    include: { user: { select: { id: true } } },
  });

  if (!lofaq || !datadeals) {
    console.log("Storefronts not found");
    process.exit(1);
  }

  // 2. Find all orders for this phone on Lofaq
  const orders = await prisma.storefrontOrder.findMany({
    where: {
      storefrontId: lofaq.id,
      OR: [{ customerPhone: PHONE }, { customerPhone: { contains: last9 } }],
    },
    include: { product: true },
  });

  console.log(`Found ${orders.length} orders for phone ${PHONE}`);
  const refs = orders.map((o) => o.paymentReference);

  // 3. Delete any wallet transaction logs referencing these orders or phone
  if (refs.length > 0) {
    const deletedTx = await prisma.storefrontWalletTransaction.deleteMany({
      where: {
        OR: [
          { reference: { in: refs } },
          { description: { contains: PHONE } },
        ],
      },
    });
    console.log(`Deleted wallet transaction logs: ${deletedTx.count}`);
  }

  // 4. Update orders directly to Data Deals (matching productId)
  for (const order of orders) {
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
  }

  // 5. Adjust wallet balances cleanly without creating ledger records
  const totalCompletedCommission = orders
    .filter((o) => o.status === "COMPLETED")
    .reduce((sum, o) => sum + o.commission, 0);

  const totalPendingCommission = orders
    .filter((o) => o.status === "PENDING")
    .reduce((sum, o) => sum + o.commission, 0);

  if (totalCompletedCommission > 0 || totalPendingCommission > 0) {
    // Deduct from Lofaq wallet
    await prisma.storefrontWallet.updateMany({
      where: { userId: lofaq.userId },
      data: {
        balance: { decrement: totalCompletedCommission },
        pendingBalance: { decrement: totalPendingCommission },
      },
    });

    // Credit to Data Deals wallet
    await prisma.storefrontWallet.updateMany({
      where: { userId: datadeals.userId },
      data: {
        balance: { increment: totalCompletedCommission },
        pendingBalance: { increment: totalPendingCommission },
      },
    });

    console.log("Adjusted balances directly (no transaction records created).");
    console.log(`Completed commission transferred: GHS ${(totalCompletedCommission / 100).toFixed(2)}`);
    console.log(`Pending commission transferred: GHS ${(totalPendingCommission / 100).toFixed(2)}`);
  }

  // 6. Remove phone & order references from system settings
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

  console.log(`\nDone! All traces & logs removed for ${PHONE}`);
  await prisma.$disconnect();
}

run();
