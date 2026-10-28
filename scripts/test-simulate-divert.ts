import { prisma } from "../src/lib/prisma";
import { findLofaqStorefront, isLofaqCustomer, isEstablishedDataDealsCustomer } from "../src/lib/order-allocation";
import { toPesewas } from "../src/lib/storefront";

async function testSimulate() {
  const ref = "GH-28-2026-FGE9SY";
  const row = await prisma.storefrontOrder.findUnique({
    where: { paymentReference: ref },
    include: { product: { include: { dataPackage: true } } },
  });

  if (!row) {
    console.log("Order not found");
    return;
  }

  const storefront = await prisma.storefront.findUnique({
    where: { id: row.storefrontId },
  });

  console.log("Testing allocation simulation for:", ref);
  console.log("Customer phone:", row.customerPhone);
  console.log("Storefront slug:", storefront?.slug);

  const isDataDeals =
    storefront?.slug === "data-deals" ||
    storefront?.slug === "data-dealsgh" ||
    storefront?.slug === "data-deqls" ||
    Boolean(storefront?.customDomain?.includes("data-deals"));

  console.log("isDataDeals:", isDataDeals);

  try {
    const lofaqStorefront = await findLofaqStorefront();
    console.log("lofaqStorefront:", lofaqStorefront?.name);

    if (lofaqStorefront) {
      const isLofaqRepeat = await isLofaqCustomer(row.customerPhone, row.customerEmail);
      console.log("isLofaqRepeat:", isLofaqRepeat);

      const isDDRepeat = !isLofaqRepeat && (await isEstablishedDataDealsCustomer(row.customerPhone, row.customerEmail));
      console.log("isDDRepeat:", isDDRepeat);

      const shouldAllocate = isLofaqRepeat;
      console.log("shouldAllocate:", shouldAllocate);

      if (shouldAllocate) {
        console.log("Checking Lofaq product creation...");
        let lofaqProduct = await prisma.storefrontProduct.findFirst({
          where: {
            storefrontId: lofaqStorefront.id,
            packageId: row.product.packageId,
          },
        });
        console.log("Existing lofaqProduct:", lofaqProduct?.id);

        const { resolveUserWholesalePrice } = await import("../src/lib/orders");
        console.log("Resolving wholesale price...");
        const lofaqCostGhs = await resolveUserWholesalePrice(
          lofaqStorefront.user || lofaqStorefront.userId,
          row.product.dataPackage
        );
        console.log("lofaqCostGhs:", lofaqCostGhs);
        const lofaqCostPesewas = toPesewas(lofaqCostGhs);
        const lofaqCommission = Math.max(0, row.sellingPrice - lofaqCostPesewas);
        console.log("lofaqCommission:", lofaqCommission);
        console.log("-> SIMULATION SUCCESS: Order WOULD divert to Lofaq!");
      }
    }
  } catch (err) {
    console.error("SIMULATION CRASHED WITH ERROR:", err);
  }

  await prisma.$disconnect();
}

testSimulate();
