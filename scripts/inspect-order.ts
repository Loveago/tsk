import { prisma } from "../src/lib/prisma";

async function run() {
  const ref = process.argv.find((a) => a.startsWith("--ref="))?.split("=")[1]?.trim() || "GH-28-2026-FGE9SY";
  console.log(`Inspecting order ${ref}...`);

  const order = await prisma.storefrontOrder.findUnique({
    where: { paymentReference: ref },
    include: {
      storefront: { select: { id: true, name: true, slug: true, customDomain: true } },
      product: { include: { dataPackage: true } },
    },
  });

  if (!order) {
    console.log("Order not found");
    return;
  }

  console.log("Order details:");
  console.log(" - Reference:       ", order.paymentReference);
  console.log(" - Customer Phone:  ", order.customerPhone);
  console.log(" - Created At:      ", order.createdAt.toISOString());
  console.log(" - Actual Storefront:", order.storefront.name, `(${order.storefront.slug})`);
  console.log(" - Custom Domain:   ", order.storefront.customDomain ?? "none");
  console.log(" - Selling Price:   ", order.sellingPrice);
  console.log(" - Commission:      ", order.commission);
  console.log(" - Status:          ", order.status);

  await prisma.$disconnect();
}

run();
