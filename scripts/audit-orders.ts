import { prisma } from "../src/lib/prisma";

async function main() {
  const counts = await prisma.order.groupBy({
    by: ["status", "network"],
    where: { network: "MTN", createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } },
    _count: { id: true },
  });
  console.log("MTN order statuses (last 14 days):");
  for (const c of counts) console.log(`  ${c.network} ${c.status}: ${c._count.id}`);

  const falseSuspect = await prisma.order.count({
    where: {
      network: "MTN",
      status: "SUCCESS",
      history: {
        some: {
          previousStatus: "FAILED",
          note: { contains: "reconcil" },
        },
      },
    },
  });
  console.log("\nOrders with reconcile->SUCCESS history (false-success fingerprint):", falseSuspect);

  // Also check for any history entries from the reconcile actor at all
  const reconciledHistoryItems = await prisma.orderStatusHistory.findMany({
    where: {
      OR: [
        { note: { contains: "reconcil" } },
        { changedBy: { contains: "reconcil" } },
        { note: { contains: "Restored from previous halt" } },
      ],
      createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
    },
    select: { orderId: true, status: true, previousStatus: true, note: true, changedBy: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  console.log(`\nAll reconcile-touched history entries (last 14 days): ${reconciledHistoryItems.length}`);
  for (const h of reconciledHistoryItems) {
    console.log(`  Order #${h.orderId}: ${h.previousStatus} -> ${h.status} | ${h.changedBy} | ${h.createdAt.toISOString()}`);
    console.log(`    Note: ${h.note?.slice(0, 100)}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
