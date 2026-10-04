import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: ["error"] });

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: "alsweleinstein@gmail.com" },
  });

  if (!user) {
    console.log("Prince Aidoo not found!");
    return;
  }

  console.log("================================================================================");
  console.log(`User: ${user.name} <${user.email}>`);
  console.log(`Current DB Balance: GHS ${user.balance.toFixed(2)}`);
  console.log("================================================================================");

  const latestOrders = await prisma.order.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      batch: true,
    },
  });

  console.log(`\nLatest 20 orders for ${user.email}:`);
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
      console.log(`    -> Debited: Yes | TX #${tx.id} | Ref: "${tx.reference}" | Amount: GHS ${tx.amount} | Date: ${tx.createdAt.toISOString()}`);
    } else {
      console.log(`    -> ⚠️ Debited: NO! NO TRANSACTION FOUND FOR ORDER #${o.id}!`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
