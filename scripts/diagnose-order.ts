import { prisma } from "../src/lib/prisma";

async function main() {
  const orderIdArg = process.argv[2] ? parseInt(process.argv[2], 10) : 39002;
  console.log(`Diagnosing Order #${orderIdArg}...`);

  const order = await prisma.order.findUnique({
    where: { id: orderIdArg },
    include: {
      batch: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          balance: true,
        },
      },
    },
  });

  if (!order) {
    console.log(`Order #${orderIdArg} not found! Checking highest order IDs...`);
    const latestOrders = await prisma.order.findMany({
      orderBy: { id: "desc" },
      take: 5,
      select: { id: true, createdAt: true, source: true, status: true, amount: true },
    });
    console.log("Latest orders in DB:", latestOrders);
    return;
  }

  console.log("---------------- ORDER DETAILS ----------------");
  console.log("ID:", order.id);
  console.log("User:", order.user?.name, `<${order.user?.email}> (${order.userId})`);
  console.log("Current User Balance:", order.user?.balance);
  console.log("Amount:", order.amount);
  console.log("Network:", order.network);
  console.log("GB:", order.gbAmount);
  console.log("Phone:", order.phoneNumber);
  console.log("Status:", order.status);
  console.log("Source:", order.source);
  console.log("IsSandbox:", order.isSandbox);
  console.log("CreatedAt (UTC):", order.createdAt.toISOString());
  console.log("Batch:", order.batch ? `${order.batch.batchCode} (id: ${order.batch.id})` : "none");

  console.log("\n---------------- MATCHING TRANSACTIONS ----------------");
  const directTxns = await prisma.walletTransaction.findMany({
    where: {
      userId: order.userId,
      OR: [
        { reference: { contains: String(order.id) } },
        ...(order.batch ? [{ reference: { contains: order.batch.batchCode } }] : []),
      ],
    },
  });
  console.log(`Found ${directTxns.length} transactions referencing order ${order.id} or batch:`);
  for (const t of directTxns) {
    console.log(` - ID: ${t.id} | Type: ${t.type} | Amount: ${t.amount} | Status: ${t.status} | Ref: "${t.reference}" | Note: "${t.note}" | CreatedAt: ${t.createdAt.toISOString()}`);
  }

  console.log("\n---------------- TODAY'S TRANSACTIONS FOR THIS USER ----------------");
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const todayTxns = await prisma.walletTransaction.findMany({
    where: {
      userId: order.userId,
      createdAt: { gte: todayStart },
    },
    orderBy: { createdAt: "desc" },
    take: 15,
  });
  console.log(`User has ${todayTxns.length} recent transactions today:`);
  for (const t of todayTxns) {
    console.log(` - Type: ${t.type} | Amount: ${t.amount} | Status: ${t.status} | Ref: "${t.reference}" | Note: "${t.note}" | Date: ${t.createdAt.toISOString()}`);
  }

  console.log("\n---------------- TODAY'S ORDERS FOR THIS USER ----------------");
  const countTodayOrders = await prisma.order.count({
    where: {
      userId: order.userId,
      createdAt: { gte: todayStart },
    },
  });
  console.log(`Total orders placed by this user today: ${countTodayOrders}`);

  const countTodayDebits = await prisma.walletTransaction.count({
    where: {
      userId: order.userId,
      type: "DEBIT",
      createdAt: { gte: todayStart },
    },
  });
  console.log(`Total DEBIT transactions for this user today: ${countTodayDebits}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
