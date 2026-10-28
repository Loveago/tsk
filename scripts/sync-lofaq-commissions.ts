import { prisma } from "../src/lib/prisma";
import { syncCommissionForOrder } from "../src/lib/storefront";

const DRY_RUN = process.argv.includes("--dry-run");

async function run() {
  const lofaq = await prisma.storefront.findFirst({
    where: {
      OR: [
        { slug: "lofaq-data-hub" },
        { slug: "lofaq" },
        { name: { contains: "lofaq", mode: "insensitive" } },
      ],
    },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  if (!lofaq) {
    console.log("Lofaq storefront not found");
    return;
  }

  const wallet = await prisma.storefrontWallet.findUnique({
    where: { userId: lofaq.userId },
  });

  console.log("==========================================================================");
  console.log(`                     LOFAQ PENDING COMMISSION AUDIT                       `);
  console.log("==========================================================================");
  console.log(`Store:            ${lofaq.name} (${lofaq.slug})`);
  console.log(`Owner:            ${lofaq.user.name} (${lofaq.user.email})`);
  console.log(`Current Balance:  GHS ${(Number(wallet?.balance ?? 0) / 100).toFixed(2)}`);
  console.log(`Current Pending:  GHS ${(Number(wallet?.pendingBalance ?? 0) / 100).toFixed(2)}`);
  console.log("--------------------------------------------------------------------------");

  // Find all StorefrontOrders on Lofaq where commissionState is PENDING
  const pendingOrders = await prisma.storefrontOrder.findMany({
    where: {
      storefrontId: lofaq.id,
      commissionState: "PENDING",
    },
    include: {
      underlyingOrder: {
        select: { id: true, status: true, completedAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  console.log(`Found ${pendingOrders.length} orders with commissionState = 'PENDING' on Lofaq.`);

  const deliveredToRelease: typeof pendingOrders = [];
  const failedToReverse: typeof pendingOrders = [];
  const genuinelyPending: typeof pendingOrders = [];

  for (const o of pendingOrders) {
    const underStatus = o.underlyingOrder?.status ?? o.status;
    if (underStatus === "SUCCESS" || underStatus === "COMPLETED") {
      deliveredToRelease.push(o);
    } else if (["FAILED", "REFUNDED", "CANCELLED"].includes(underStatus)) {
      failedToReverse.push(o);
    } else {
      genuinelyPending.push(o);
    }
  }

  const releaseCommissionTotal = deliveredToRelease.reduce((s, o) => s + o.commission, 0);
  const reverseCommissionTotal = failedToReverse.reduce((s, o) => s + o.commission, 0);
  const remainingPendingTotal = genuinelyPending.reduce((s, o) => s + o.commission, 0);

  console.log(`\nBreakdown:`);
  console.log(` - Delivered / SUCCESS (should be released to balance): ${deliveredToRelease.length} orders (GHS ${(releaseCommissionTotal / 100).toFixed(2)})`);
  console.log(` - Failed / Cancelled (should be reversed):           ${failedToReverse.length} orders (GHS ${(reverseCommissionTotal / 100).toFixed(2)})`);
  console.log(` - Still Processing / In-Flight:                      ${genuinelyPending.length} orders (GHS ${(remainingPendingTotal / 100).toFixed(2)})`);

  if (deliveredToRelease.length > 0) {
    console.log(`\nDelivered orders to release (sample up to 10):`);
    for (const o of deliveredToRelease.slice(0, 10)) {
      console.log(` - Ref: ${o.paymentReference} | Underlying: #${o.underlyingOrderId} (${o.underlyingOrder?.status}) | Commission: GHS ${(o.commission / 100).toFixed(2)} | Date: ${o.createdAt.toISOString().slice(0, 10)}`);
    }
    if (deliveredToRelease.length > 10) console.log(` ... and ${deliveredToRelease.length - 10} more`);
  }

  if (DRY_RUN) {
    console.log("\n[DRY RUN] Run without --dry-run to sync and release the delivered commissions to withdrawable balance.");
    await prisma.$disconnect();
    return;
  }

  // Execute releases
  let releasedCount = 0;
  for (const o of deliveredToRelease) {
    if (o.underlyingOrderId) {
      await syncCommissionForOrder(o.underlyingOrderId, "SUCCESS");
      releasedCount++;
    } else {
      // Direct release if no underlying order
      await prisma.$transaction(async (tx) => {
        await tx.storefrontOrder.update({
          where: { id: o.id },
          data: { commissionState: "AVAILABLE", status: "COMPLETED", completedAt: new Date() },
        });
        await tx.storefrontWallet.update({
          where: { id: wallet!.id },
          data: {
            balance: { increment: o.commission },
            pendingBalance: { decrement: o.commission },
          },
        });
      });
      releasedCount++;
    }
  }

  // Execute reversals for failed
  let reversedCount = 0;
  for (const o of failedToReverse) {
    if (o.underlyingOrderId) {
      await syncCommissionForOrder(o.underlyingOrderId, o.underlyingOrder?.status || "FAILED");
      reversedCount++;
    }
  }

  const updatedWallet = await prisma.storefrontWallet.findUnique({
    where: { userId: lofaq.userId },
  });

  console.log("\n==========================================================================");
  console.log(`SYNC COMPLETE!`);
  console.log(`Released: ${releasedCount} delivered commissions (GHS ${(releaseCommissionTotal / 100).toFixed(2)})`);
  console.log(`Reversed: ${reversedCount} failed commissions`);
  console.log(`New Balance: GHS ${(Number(updatedWallet?.balance ?? 0) / 100).toFixed(2)}`);
  console.log(`New Pending: GHS ${(Number(updatedWallet?.pendingBalance ?? 0) / 100).toFixed(2)}`);
  console.log("==========================================================================");

  await prisma.$disconnect();
}

run();
