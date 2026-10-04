import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: ["error"] });

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: { contains: "aidoobenedict", mode: "insensitive" } },
  });

  if (!user) {
    console.log("Aidoo Benedict not found! Searching by name...");
    const users = await prisma.user.findMany({
      where: { name: { contains: "Aidoo", mode: "insensitive" } },
      select: { id: true, name: true, email: true, balance: true },
    });
    console.log("Users found:", users);
    return;
  }

  console.log("================================================================================");
  console.log(`User: ${user.name} <${user.email}> (${user.id})`);
  console.log(`Current DB Balance: GHS ${user.balance.toFixed(2)}`);
  console.log("================================================================================");

  const totalOrders = await prisma.order.count({ where: { userId: user.id } });
  const totalDebits = await prisma.walletTransaction.count({
    where: { userId: user.id, type: "DEBIT", status: "APPROVED" },
  });

  console.log(`Total Orders in DB        : ${totalOrders}`);
  console.log(`Total DEBIT Transactions  : ${totalDebits}`);

  const latestOrders = await prisma.order.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 15,
    include: { batch: true },
  });

  console.log(`\nLatest 15 orders for ${user.name}:`);
  for (const o of latestOrders) {
    const tx = await prisma.walletTransaction.findFirst({
      where: {
        userId: user.id,
        OR: [
          { reference: `order:${o.id}` },
          { reference: `api_order:${o.id}` },
          ...(o.batch ? [{ reference: `api_batch:${o.batch.batchCode}` }] : []),
        ],
      },
    });

    console.log(
      ` - #${o.id} | ${o.network} ${o.gbAmount}GB to ${o.phoneNumber} | GHS ${o.amount.toFixed(2)} | Source: ${o.source} | Sandbox: ${o.isSandbox} | Status: ${o.status} | Placed: ${o.createdAt.toISOString()}`
    );
    if (tx) {
      console.log(`    -> Debited: Yes | Ref: "${tx.reference}" | Amount: GHS ${tx.amount}`);
    } else {
      console.log(`    -> ⚠️ Debited: NO!`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
