import { prisma } from "../src/lib/prisma";

async function run() {
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

  if (!lofaq) return;

  const wallet = await prisma.storefrontWallet.findUnique({
    where: { userId: lofaq.userId },
  });

  // 1. Calculate sum of commissions for currently pending orders ON LOFAQ
  const lofaqPendingOrders = await prisma.storefrontOrder.findMany({
    where: {
      storefrontId: lofaq.id,
      commissionState: "PENDING",
    },
    select: {
      id: true,
      paymentReference: true,
      commission: true,
      status: true,
      createdAt: true,
      underlyingOrder: { select: { id: true, status: true } },
    },
  });

  const actualActivePendingSum = lofaqPendingOrders.reduce((sum, o) => sum + o.commission, 0);

  console.log("==========================================================================");
  console.log("                     LOFAQ WALLET RECONCILIATION                          ");
  console.log("==========================================================================");
  console.log(`Current Wallet Pending in DB:       GHS ${(Number(wallet?.pendingBalance ?? 0) / 100).toFixed(2)} (${wallet?.pendingBalance} pesewas)`);
  console.log(`Actual Sum of Pending Orders:       GHS ${(actualActivePendingSum / 100).toFixed(2)} (${actualActivePendingSum} pesewas)`);
  console.log(`Discrepancy (Orphaned Pending):     GHS ${((Number(wallet?.pendingBalance ?? 0) - actualActivePendingSum) / 100).toFixed(2)}`);
  console.log("--------------------------------------------------------------------------");
  console.log(`Number of orders legitimately pending: ${lofaqPendingOrders.length}`);

  const statusCounts: Record<string, number> = {};
  lofaqPendingOrders.forEach((o) => {
    const st = o.underlyingOrder?.status ?? o.status;
    statusCounts[st] = (statusCounts[st] || 0) + 1;
  });
  console.log("Underlying statuses of currently pending orders:", statusCounts);
  console.log("==========================================================================");

  await prisma.$disconnect();
}

run();
