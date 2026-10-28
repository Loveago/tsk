import { prisma } from "../src/lib/prisma";
import { syncCommissionForOrder } from "../src/lib/storefront";

const EXECUTE = process.argv.includes("--fix");

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

  if (!wallet) {
    console.log("Lofaq wallet not found");
    return;
  }

  // 1. Release the 1 order that is already SUCCESS
  const deliveredOrder = await prisma.storefrontOrder.findFirst({
    where: {
      storefrontId: lofaq.id,
      commissionState: "PENDING",
      underlyingOrder: { status: "SUCCESS" },
    },
    include: { underlyingOrder: true },
  });

  if (deliveredOrder && EXECUTE) {
    console.log(`Releasing commission for delivered order ${deliveredOrder.paymentReference}...`);
    await syncCommissionForOrder(deliveredOrder.underlyingOrderId!, "SUCCESS");
  }

  // 2. Fetch all legitimately pending orders on Lofaq
  const pendingOrders = await prisma.storefrontOrder.findMany({
    where: {
      storefrontId: lofaq.id,
      commissionState: "PENDING",
    },
  });

  const correctPendingSum = pendingOrders.reduce((sum, o) => sum + o.commission, 0);

  console.log("==========================================================================");
  console.log("                     LOFAQ WALLET REPAIR REPORT                           ");
  console.log("==========================================================================");
  console.log(`Wallet Pending in DB:       GHS ${(wallet.pendingBalance / 100).toFixed(2)} (${wallet.pendingBalance} pesewas)`);
  console.log(`Legitimate Pending Sum:     GHS ${(correctPendingSum / 100).toFixed(2)} (${correctPendingSum} pesewas)`);
  console.log(`Orphaned Amount to Clear:   GHS ${((wallet.pendingBalance - correctPendingSum) / 100).toFixed(2)}`);
  console.log("--------------------------------------------------------------------------");

  if (!EXECUTE) {
    console.log("[PREVIEW ONLY] Run with --fix to align the pending balance and release delivered orders.");
    await prisma.$disconnect();
    return;
  }

  // Set the wallet pending balance to exactly match the legitimate pending orders
  await prisma.storefrontWallet.update({
    where: { id: wallet.id },
    data: { pendingBalance: correctPendingSum },
  });

  const finalWallet = await prisma.storefrontWallet.findUnique({
    where: { id: wallet.id },
  });

  console.log(`\nSUCCESSFULLY FIXED!`);
  console.log(`New Balance:         GHS ${(Number(finalWallet?.balance ?? 0) / 100).toFixed(2)}`);
  console.log(`New Pending Balance: GHS ${(Number(finalWallet?.pendingBalance ?? 0) / 100).toFixed(2)} (matches exactly ${pendingOrders.length} pending orders)`);
  console.log("==========================================================================");

  await prisma.$disconnect();
}

run();
