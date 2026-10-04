import { prisma } from "../src/lib/prisma";

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: "adjeifrank002@gmail.com" },
    include: {
      storefronts: true,
      storefrontWallet: true,
    },
  });

  if (!user) {
    console.log("User not found!");
    return;
  }

  console.log("User:", user.name, user.email, "Balance:", user.balance);
  console.log("Storefront Wallet:", user.storefrontWallet);

  const orders = await prisma.order.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  console.log(`\nFound ${orders.length} orders for ${user.email}:`);
  for (const o of orders) {
    const stfOrder = await prisma.storefrontOrder.findFirst({
      where: { underlyingOrderId: o.id },
    });
    console.log(` - Order #${o.id}: ${o.network} ${o.gbAmount}GB | Amount: ${o.amount} | Source: ${o.source} | Status: ${o.status} | CreatedAt: ${o.createdAt.toISOString()}`);
    if (stfOrder) {
      console.log(`    -> StorefrontOrder: ID ${stfOrder.id} | Status: ${stfOrder.status} | SellingPrice: ${stfOrder.sellingPrice} | Commission: ${stfOrder.commission} | Customer: ${stfOrder.customerPhone} | PaymentRef: ${stfOrder.paymentReference} | PaidAt: ${stfOrder.paidAt?.toISOString()}`);
    } else {
      console.log(`    -> No linked StorefrontOrder!`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
