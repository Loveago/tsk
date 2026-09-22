import { prisma } from "../src/lib/prisma";
import { recomputeBatchStatus } from "../src/lib/orders";

async function main() {
  console.log("================================================================================");
  console.log("             TSKCONNECT - RECONCILE EXPORTED ORDERS                            ");
  console.log("================================================================================");

  // 1. Find all orders that belong to an export batch but are currently marked PENDING
  const misclassifiedOrders = await prisma.order.findMany({
    where: {
      exportBatchId: { not: null },
      status: "PENDING",
    },
    select: {
      id: true,
      phoneNumber: true,
      network: true,
      gbAmount: true,
      status: true,
      batchId: true,
      exportBatchId: true,
      exportBatch: {
        select: {
          exportCode: true,
          status: true,
          fileName: true,
          createdAt: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  console.log(`Found ${misclassifiedOrders.length} exported order(s) mistakenly marked as PENDING.\n`);

  if (misclassifiedOrders.length === 0) {
    console.log("All exported orders are correctly marked. No reconciliation needed.");
    return;
  }

  // Group by export batch
  const byExport = new Map<string, typeof misclassifiedOrders>();
  for (const o of misclassifiedOrders) {
    const code = o.exportBatch?.exportCode || o.exportBatchId || "UNKNOWN";
    if (!byExport.has(code)) byExport.set(code, []);
    byExport.get(code)!.push(o);
  }

  console.log("Breakdown by Export Batch:");
  for (const [code, list] of byExport.entries()) {
    const totalGb = list.reduce((s, o) => s + o.gbAmount, 0);
    console.log(`  • Export ${code}: ${list.length} orders (${totalGb} GB)`);
  }
  console.log("--------------------------------------------------------------------------------");

  // Update them back to PROCESSING
  const ids = misclassifiedOrders.map((o) => o.id);
  const updateResult = await prisma.order.updateMany({
    where: { id: { in: ids } },
    data: { status: "PROCESSING" },
  });

  console.log(`\nSuccessfully updated ${updateResult.count} order(s) back to PROCESSING status.`);

  // Recompute parent batch statuses
  const parentBatchIds = Array.from(
    new Set(misclassifiedOrders.map((o) => o.batchId).filter(Boolean))
  ) as string[];

  console.log(`Recomputing statuses for ${parentBatchIds.length} parent batch(es)...`);
  for (const bId of parentBatchIds) {
    await recomputeBatchStatus(bId).catch(() => {});
  }

  console.log("Reconciliation finished successfully! Pending queue is now clean.");
}

main()
  .catch((e) => {
    console.error("Error during reconciliation:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
