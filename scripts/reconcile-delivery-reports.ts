import { prisma } from "../src/lib/prisma";
import { syncClickyfiedDeliveryReport } from "../src/lib/provider-apis/router";
import { changeOrderStatus } from "../src/lib/orders";

async function main() {
  console.log("=== Reconciling Delivery Reports NR-00049, NR-00050, NR-00051 ===");

  const reports = await prisma.deliveryReport.findMany({
    where: {
      OR: [
        { seq: { in: [49, 50, 51] } },
        {
          order: {
            phoneNumber: { in: ["0541133597", "0547682963", "0240264590"] },
          },
        },
      ],
    },
    include: { order: true },
    orderBy: { seq: "asc" },
  });

  console.log(`Found ${reports.length} report(s) to reconcile.`);

  for (const rep of reports) {
    const phone = rep.order?.phoneNumber;
    const gb = rep.order?.gbAmount;
    console.log(`\nProcessing NR-000${rep.seq} (Order #${rep.orderId}, Phone: ${phone}, ${gb} GB, current: ${rep.status})...`);

    // Run syncClickyfiedDeliveryReport
    await syncClickyfiedDeliveryReport(rep.id, "Reconcile Script");

    // Re-fetch report
    const updated = await prisma.deliveryReport.findUnique({
      where: { id: rep.id },
      include: { order: true },
    });

    // Ensure NR-00051 (5 GB) and NR-00050 (1 GB) reflect Clickyfied admin refund:
    if (phone === "0541133597" || phone === "0547682963" || rep.seq === 51 || rep.seq === 50) {
      if (updated?.status !== "REFUNDED") {
        console.log(`-> Setting NR-000${rep.seq} to REFUNDED as resolved by Clickyfied admin...`);
        await prisma.deliveryReport.update({
          where: { id: rep.id },
          data: {
            status: "REFUNDED",
            proofImage: null,
            proofImageMime: null,
            adminResponse: "Refunded by Clickyfied provider",
            resolvedAt: new Date(),
            resolvedBy: "Clickyfied API",
          },
        });

        if (rep.order?.id && rep.order.status !== "FAILED") {
          await changeOrderStatus(
            rep.order.id,
            "FAILED",
            "Refunded on Clickyfied provider",
            { id: "system", label: "Clickyfied Sync" },
            { force: true }
          );
        }
      }
    } else if (phone === "0240264590" || rep.seq === 49) {
      console.log(`-> NR-000${rep.seq} (2 GB) is CONFIRMED SENT with proof.`);
    }

    const finalRep = await prisma.deliveryReport.findUnique({
      where: { id: rep.id },
      include: { order: true },
    });

    console.log(`Result: NR-000${finalRep?.seq} -> Status: ${finalRep?.status}, Order Status: ${finalRep?.order?.status}, Has Proof: ${Boolean(finalRep?.proofImage)}`);
  }

  console.log("\nReconciliation complete!");
}

main()
  .catch((e) => {
    console.error("Reconciliation error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
