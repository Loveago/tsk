import { prisma } from "../src/lib/prisma";

/**
 * Script: delete-processing-not-received.ts
 *
 * Finds all "Not Received" delivery reports linked to orders currently in "PROCESSING"
 * status and deletes them (along with associated report timeline events).
 *
 * Usage:
 *   npx tsx scripts/delete-processing-not-received.ts [--dry-run] [--order-id <id>]
 */
async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");

  // Optional filter for specific order ID(s)
  const orderIdIndex = args.indexOf("--order-id");
  const specificOrderId = orderIdIndex !== -1 && args[orderIdIndex + 1]
    ? parseInt(args[orderIdIndex + 1], 10)
    : undefined;

  console.log("================================================================");
  console.log(" Delete Not Received Reports for Orders in PROCESSING Status");
  console.log("================================================================");
  if (isDryRun) {
    console.log("MODE: [DRY RUN] - No data will be modified.");
  } else {
    console.log("MODE: [LIVE] - Matching reports will be deleted.");
  }
  if (specificOrderId) {
    console.log(`FILTER: Limiting to Order #${specificOrderId}`);
  }
  console.log("");

  // Find all delivery reports whose order is in PROCESSING status
  const reports = await prisma.deliveryReport.findMany({
    where: {
      order: {
        status: {
          equals: "PROCESSING",
          mode: "insensitive",
        },
        ...(specificOrderId ? { id: specificOrderId } : {}),
      },
    },
    include: {
      order: {
        select: {
          id: true,
          status: true,
          phoneNumber: true,
          network: true,
          gbAmount: true,
          amount: true,
          userId: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      events: {
        select: {
          id: true,
          type: true,
          createdAt: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (reports.length === 0) {
    console.log("No Not Received reports found for orders in PROCESSING status.");
    return;
  }

  console.log(`Found ${reports.length} Not Received report(s) attached to PROCESSING orders:\n`);

  for (const report of reports) {
    const reportCode = report.seq ? `NR-${String(report.seq).padStart(5, "0")}` : "N/A";
    console.log(`• Report: ${reportCode} (ID: ${report.id})`);
    console.log(`  - Order ID:      #${report.orderId}`);
    console.log(`  - Order Status:  ${report.order.status}`);
    console.log(`  - Phone:         ${report.order.phoneNumber} (${report.order.network}, ${report.order.gbAmount} GB)`);
    console.log(`  - Report Status: ${report.status}`);
    console.log(`  - Reason:        ${report.reason || "None"}`);
    console.log(`  - Events Count:  ${report.events.length}`);
    console.log(`  - Created At:    ${report.createdAt.toISOString()}`);
    console.log("");
  }

  if (isDryRun) {
    console.log(`[DRY RUN] Would delete ${reports.length} delivery report(s) and their associated events.`);
    console.log("Run without --dry-run to perform the deletion.");
    return;
  }

  const reportIds = reports.map((r) => r.id);

  const result = await prisma.$transaction(async (tx) => {
    // Delete any associated events first (safe even if onDelete: Cascade handles it)
    const deletedEvents = await tx.deliveryReportEvent.deleteMany({
      where: {
        reportId: {
          in: reportIds,
        },
      },
    });

    // Delete the reports themselves
    const deletedReports = await tx.deliveryReport.deleteMany({
      where: {
        id: {
          in: reportIds,
        },
      },
    });

    return {
      deletedReportsCount: deletedReports.count,
      deletedEventsCount: deletedEvents.count,
    };
  });

  console.log("----------------------------------------------------------------");
  console.log(`Successfully deleted ${result.deletedReportsCount} Not Received report(s)`);
  console.log(`and ${result.deletedEventsCount} associated timeline event(s).`);
  console.log("----------------------------------------------------------------");
}

main()
  .catch((error) => {
    console.error("Error executing script:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
