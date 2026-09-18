import { prisma } from "../src/lib/prisma";
import { syncClickyfiedDeliveryReport } from "../src/lib/provider-apis/router";
import { changeOrderStatus } from "../src/lib/orders";

/**
 * Reconciles the batch order-1789667313720 reports with Clickyfied's true resolutions:
 * 1. 0531955626 (3.00 GB) -> Refunded (GHS 11.25)
 * 2. 0599305133 (2.00 GB) -> Confirmed Sent
 * 3. 0541133597 (5.00 GB) -> Refunded (GHS 18.75)
 * 4. 0547682963 (1.00 GB) -> Confirmed Sent
 * 5. 0240264590 (2.00 GB) -> Refunded
 */
async function main() {
  console.log("=== Reconciling Delivery Reports for Batch order-1789667313720 ===");

  const targetPhones = [
    "0531955626", // 3 GB -> Refunded
    "0599305133", // 2 GB -> Confirmed Sent
    "0541133597", // 5 GB -> Refunded
    "0547682963", // 1 GB -> Confirmed Sent
    "0240264590", // 2 GB -> Refunded
  ];

  const reports = await prisma.deliveryReport.findMany({
    where: {
      OR: [
        { seq: { in: [49, 50, 51, 52, 53] } },
        {
          order: {
            phoneNumber: { in: targetPhones },
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

    if (phone === "0599305133" || phone === "0547682963" || rep.seq === 52 || rep.seq === 50) {
      // These are CONFIRMED SENT on Clickyfied
      console.log(`-> Setting NR-000${rep.seq} (${phone}, ${gb} GB) to DELIVERED (Confirmed Sent)...`);
      await prisma.deliveryReport.update({
        where: { id: rep.id },
        data: {
          status: "DELIVERED",
          adminResponse: "Confirmed Sent",
          resolvedAt: new Date(),
          resolvedBy: "Clickyfied API",
        },
      });

      if (rep.order?.id && rep.order.status === "FAILED") {
        await changeOrderStatus(
          rep.order.id,
          "SUCCESS",
          "Confirmed sent by Clickyfied provider",
          { id: "system", label: "Reconcile Script" },
          { force: true }
        );
      }
    } else if (phone === "0531955626" || rep.seq === 53) {
      const refundAmtStr = rep.order?.amount ? `Refunded GHS ${rep.order.amount.toFixed(2)}` : "Refunded";
      console.log(`-> Setting NR-000${rep.seq} (3 GB) to REFUNDED (${refundAmtStr})...`);
      await prisma.deliveryReport.update({
        where: { id: rep.id },
        data: {
          status: "REFUNDED",
          proofImage: null,
          proofImageMime: null,
          adminResponse: refundAmtStr,
          resolvedAt: new Date(),
          resolvedBy: "Clickyfied API",
        },
      });

      if (rep.order?.id && rep.order.status !== "FAILED") {
        await changeOrderStatus(
          rep.order.id,
          "FAILED",
          refundAmtStr,
          { id: "system", label: "Reconcile Script" },
          { force: true }
        );
      }
    } else if (phone === "0541133597" || rep.seq === 51) {
      const refundAmtStr = rep.order?.amount ? `Refunded GHS ${rep.order.amount.toFixed(2)}` : "Refunded";
      console.log(`-> Setting NR-000${rep.seq} (5 GB) to REFUNDED (${refundAmtStr})...`);
      await prisma.deliveryReport.update({
        where: { id: rep.id },
        data: {
          status: "REFUNDED",
          proofImage: null,
          proofImageMime: null,
          adminResponse: refundAmtStr,
          resolvedAt: new Date(),
          resolvedBy: "Clickyfied API",
        },
      });

      if (rep.order?.id && rep.order.status !== "FAILED") {
        await changeOrderStatus(
          rep.order.id,
          "FAILED",
          refundAmtStr,
          { id: "system", label: "Reconcile Script" },
          { force: true }
        );
      }
    } else if (phone === "0240264590" || rep.seq === 49) {
      // 2 GB -> Refunded
      console.log(`-> Setting NR-000${rep.seq} (2 GB) to REFUNDED...`);
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
          { id: "system", label: "Reconcile Script" },
          { force: true }
        );
      }
    }

    const finalRep = await prisma.deliveryReport.findUnique({
      where: { id: rep.id },
      include: { order: true },
    });

    console.log(`Result: NR-000${finalRep?.seq} -> Status: ${finalRep?.status}, Order Status: ${finalRep?.order?.status}, Response: ${finalRep?.adminResponse}`);
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
