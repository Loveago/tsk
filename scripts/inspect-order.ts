import { prisma } from "../src/lib/prisma";

async function main() {
  const ids = [12875, 12820, 12821, 12848, 12851];
  console.log(`Inspecting sample orders: ${ids.join(", ")}...\n`);

  for (const id of ids) {
    const o = await prisma.order.findUnique({
      where: { id },
      include: {
        history: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!o) {
      console.log(`Order #${id} not found.`);
      continue;
    }

    console.log(`================================================================`);
    console.log(`Order #${o.id} | Phone: ${o.phoneNumber} | ${o.gbAmount}GB | Status: ${o.status}`);
    console.log(`ProviderRef: ${o.providerReference}`);
    console.log(`ExternalRef: ${o.externalReference}`);
    console.log(`BatchId    : ${o.batchId} | ClickyfiedBatchId: ${o.clickyfiedBatchId}`);
    console.log(`CreatedAt  : ${o.createdAt?.toISOString()}`);
    console.log(`UpdatedAt  : ${o.updatedAt?.toISOString()}`);
    console.log(`History (${o.history.length} entries):`);
    for (const h of o.history) {
      console.log(`  - [${h.createdAt?.toISOString()}] ${h.previousStatus ?? "INIT"} -> ${h.status} by "${h.changedBy}": "${h.note ?? ""}"`);
    }
    console.log("");
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
