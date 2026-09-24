import { prisma } from "../src/lib/prisma";

async function main() {
  // Find all orders in the last 12h that have :BLOCKED in providerReference
  const blockedOrders = await prisma.order.findMany({
    where: {
      providerReference: { contains: ":BLOCKED" },
    },
    select: {
      id: true,
      phoneNumber: true,
      gbAmount: true,
      status: true,
      providerReference: true,
      externalReference: true,
      createdAt: true,
    },
  });

  console.log(`Found ${blockedOrders.length} orders with :BLOCKED in providerReference`);
  
  // Find orders that were set SUCCESS by System Sync callback (processed) without a valid numeric entry ID
  const recentSuccess = await prisma.order.findMany({
    where: {
      status: "SUCCESS",
      createdAt: { gte: new Date(Date.now() - 12 * 60 * 60 * 1000) },
      history: {
        some: {
          status: "SUCCESS",
          changedBy: "System Sync",
          note: { contains: "callback (processed)" },
        },
      },
    },
    select: {
      id: true,
      phoneNumber: true,
      gbAmount: true,
      providerReference: true,
      externalReference: true,
      history: {
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { status: true, previousStatus: true, note: true, createdAt: true },
      },
    },
  });

  console.log(`Found ${recentSuccess.length} orders marked SUCCESS via callback (processed) in last 12h`);

  const blockedAndSuccess = recentSuccess.filter(o => o.providerReference?.includes(":BLOCKED") || !o.providerReference?.match(/:\d+$/));
  console.log(`  -> ${blockedAndSuccess.length} of them do NOT have a real numeric entry ID (they have :BLOCKED or no entry ID)!`);

  console.log("\nSample of these orders:");
  for (const o of blockedAndSuccess.slice(0, 10)) {
    console.log(`  Order #${o.id} | ${o.phoneNumber} | ${o.gbAmount}GB | ProvRef: ${o.providerReference} | Prev: ${o.history[0]?.previousStatus}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
