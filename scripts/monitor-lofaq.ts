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
    include: { user: { select: { name: true, email: true } } },
  });

  if (!lofaq) {
    console.log("Lofaq not found");
    return;
  }

  // 1. Today's start in UTC
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  // 2. Fetch stats for today
  const [todayOrdersCount, todayCompletedCount, todayPendingCount, todayFailedCount] =
    await Promise.all([
      prisma.storefrontOrder.count({
        where: { storefrontId: lofaq.id, createdAt: { gte: todayStart } },
      }),
      prisma.storefrontOrder.count({
        where: {
          storefrontId: lofaq.id,
          createdAt: { gte: todayStart },
          status: "COMPLETED",
        },
      }),
      prisma.storefrontOrder.count({
        where: {
          storefrontId: lofaq.id,
          createdAt: { gte: todayStart },
          status: "PENDING",
        },
      }),
      prisma.storefrontOrder.count({
        where: {
          storefrontId: lofaq.id,
          createdAt: { gte: todayStart },
          status: { in: ["FAILED", "CANCELLED"] },
        },
      }),
    ]);

  // 3. Fetch latest 15 orders on Lofaq
  const latestOrders = await prisma.storefrontOrder.findMany({
    where: { storefrontId: lofaq.id },
    orderBy: { createdAt: "desc" },
    take: 15,
    include: { product: { include: { dataPackage: true } } },
  });

  // 4. Wallet balances
  const wallet = await prisma.storefrontWallet.findUnique({
    where: { userId: lofaq.userId },
  });

  console.log("==========================================================================");
  console.log(`                LOFAQ DATA HUB — REAL-TIME ORDER MONITOR                 `);
  console.log("==========================================================================");
  console.log(`Storefront: ${lofaq.name} (${lofaq.slug})`);
  console.log(`Owner:      ${lofaq.user.name} (${lofaq.user.email})`);
  console.log(
    `Wallet:     Balance GHS ${(Number(wallet?.balance ?? 0) / 100).toFixed(2)} | Pending GHS ${(Number(wallet?.pendingBalance ?? 0) / 100).toFixed(2)}`
  );
  console.log("--------------------------------------------------------------------------");
  console.log(`Today's Total Orders:     ${todayOrdersCount}`);
  console.log(` - Completed:             ${todayCompletedCount}`);
  console.log(` - Pending / In-flight:   ${todayPendingCount}`);
  console.log(` - Failed / Cancelled:    ${todayFailedCount}`);
  console.log("--------------------------------------------------------------------------");
  console.log("LATEST 15 ORDERS FLOWING TO LOFAQ:");
  console.log("Time (UTC) | Phone       | Package         | Amount    | Status     | Ref");
  console.log("--------------------------------------------------------------------------");

  for (const o of latestOrders) {
    const time = o.createdAt.toISOString().slice(11, 19);
    const phone = o.customerPhone.padEnd(11, " ");
    const pkg = `${o.product.dataPackage.network} ${o.product.dataPackage.capacity}GB`.padEnd(15, " ");
    const amt = `GHS ${(o.sellingPrice / 100).toFixed(2)}`.padEnd(9, " ");
    const st = o.status.padEnd(10, " ");
    console.log(`${time}   | ${phone} | ${pkg} | ${amt} | ${st} | ${o.paymentReference}`);
  }

  console.log("==========================================================================");
  await prisma.$disconnect();
}

run();
