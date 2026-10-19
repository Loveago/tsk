/**
 * scripts/link-orphaned-txt-exports.ts
 *
 * Scans the database for orders that were exported via TXT before ExportBatch tracking
 * was linked, groups them by network, creates the ExportBatch record, and links order.exportBatchId
 * so they appear on /admin/exports and their statuses can be managed.
 *
 * Usage:
 *   npx tsx scripts/link-orphaned-txt-exports.ts            # Dry run
 *   npx tsx scripts/link-orphaned-txt-exports.ts --execute  # Commit changes
 */

import { prisma } from "../src/lib/prisma";
import { nextExportCode } from "../src/lib/batches";

async function main() {
  const isExecute = process.argv.includes("--execute");

  console.log("======================================================================");
  console.log(` LINK ORPHANED TXT EXPORTS — ${isExecute ? "COMMIT MODE (--execute)" : "DRY-RUN (pass --execute to commit)"}`);
  console.log("======================================================================\n");

  // Find candidate orders
  const orphanedOrders = await prisma.order.findMany({
    where: {
      exportBatchId: null,
      status: { in: ["PROCESSING", "SUCCESS", "FAILED"] },
      OR: [
        {
          history: {
            some: {
              OR: [
                { note: { contains: "Exported to TXT" } },
                { note: { contains: "TXT" } },
              ],
            },
          },
        },
        {
          lastExportedBy: { not: null },
          lastExportedAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
        },
      ],
    },
    include: {
      history: {
        where: {
          OR: [
            { note: { contains: "Exported to TXT" } },
            { note: { contains: "TXT" } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      user: {
        select: { id: true, email: true, name: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (orphanedOrders.length === 0) {
    console.log("✓ No orphaned exported orders found. All exported orders are already linked to ExportBatches.\n");
    return;
  }

  console.log(`Found ${orphanedOrders.length} candidate order(s) without an ExportBatch.\n`);

  // Group by network
  const groups = new Map<string, typeof orphanedOrders>();
  for (const o of orphanedOrders) {
    const net = o.network || "MTN";
    if (!groups.has(net)) groups.set(net, []);
    groups.get(net)!.push(o);
  }

  for (const [net, orders] of groups.entries()) {
    const totalGb = orders.reduce((s, o) => s + o.gbAmount, 0);
    const totalAmount = orders.reduce((s, o) => s + o.amount, 0);
    const firstHistory = orders[0].history[0];
    const adminEmail = firstHistory?.changedBy || orders[0].lastExportedBy || "admin@tskconnect.com";
    const exportTime = firstHistory?.createdAt || orders[0].lastExportedAt || orders[0].updatedAt;

    console.log(`▶ Network [${net}]: ${orders.length} order(s), ${totalGb} GB, GHS ${totalAmount.toFixed(2)}`);
    console.log(`  Exported by: ${adminEmail}`);
    console.log(`  Export time: ${exportTime.toISOString()}`);
    console.log(`  Order IDs  : ${orders.slice(0, 10).map((o) => `#${o.id}`).join(", ")}${orders.length > 10 ? ` ... (+${orders.length - 10} more)` : ""}`);

    if (isExecute) {
      const exportCode = await nextExportCode();
      const fileName = `${net}_${exportCode}.txt`;
      const batchIds = [...new Set(orders.map((o) => o.batchId).filter(Boolean))] as string[];

      const adminUser = await prisma.user.findFirst({
        where: { email: adminEmail },
        select: { id: true },
      });

      const exportBatch = await prisma.exportBatch.create({
        data: {
          exportCode,
          network: net,
          adminId: adminUser?.id || orders[0].userId,
          adminLabel: adminEmail,
          totalRecipients: orders.length,
          totalGb,
          totalAmount,
          status: "PROCESSING",
          fileName,
          createdAt: exportTime,
          note: "Recovered TXT export batch",
        },
      });

      await prisma.order.updateMany({
        where: { id: { in: orders.map((o) => o.id) } },
        data: {
          exportBatchId: exportBatch.id,
          providerReference: `MANUAL_EXPORT:${exportCode}`,
        },
      });

      if (batchIds.length > 0) {
        await prisma.exportBatch.update({
          where: { id: exportBatch.id },
          data: { batches: { set: batchIds.map((id) => ({ id })) } },
        });
      }

      console.log(`  ✓ Created ExportBatch #${exportBatch.id} (${exportCode})`);
      console.log(`  ✓ Linked ${orders.length} orders to batch ${exportCode}\n`);
    } else {
      console.log(`  → Would create ExportBatch for ${net} and link ${orders.length} orders.\n`);
    }
  }

  if (!isExecute) {
    console.log("Dry run complete. Run with --execute to commit changes to the database:");
    console.log("  npx tsx scripts/link-orphaned-txt-exports.ts --execute\n");
  } else {
    console.log("✓ Successfully linked all orphaned TXT exports. They will now appear on /admin/exports.\n");
  }
}

main()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
