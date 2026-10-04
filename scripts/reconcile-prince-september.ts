import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: ["error"] });

async function main() {
  const APPLY = process.argv.includes("--apply");

  console.log("================================================================================");
  console.log("       PRINCE AIDOO — SEPTEMBER 25 LEAK RECONCILIATION");
  console.log("================================================================================");
  console.log(`Mode: ${APPLY ? "⚠️ LIVE — WILL APPLY DEDUCTION" : "✅ DRY RUN"}\n`);

  const user = await prisma.user.findFirst({
    where: { email: "alsweleinstein@gmail.com" },
  });

  if (!user) {
    console.log("User not found!");
    return;
  }

  const start = new Date("2026-09-01T00:00:00.000Z");
  const end = new Date("2026-09-30T23:59:59.999Z");

  const sepSandboxOrders = await prisma.order.findMany({
    where: {
      userId: user.id,
      createdAt: { gte: start, lte: end },
      isSandbox: true,
      status: { in: ["SUCCESS", "PROCESSING", "COMPLETED"] },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Found ${sepSandboxOrders.length} sandbox orders in September for ${user.name}`);

  // Check which ones don't have a debit
  const missingDebits: typeof sepSandboxOrders = [];
  for (const o of sepSandboxOrders) {
    const tx = await prisma.walletTransaction.findFirst({
      where: {
        userId: user.id,
        type: "DEBIT",
        OR: [
          { reference: `order:${o.id}` },
          { reference: `api_order:${o.id}` },
        ],
      },
    });
    if (!tx) {
      missingDebits.push(o);
    }
  }

  const totalOwed = missingDebits.reduce((s, o) => s + o.amount, 0);

  console.log(`Current Balance       : GHS ${user.balance.toFixed(2)}`);
  console.log(`Unpaid September orders: ${missingDebits.length}`);
  console.log(`Total Amount Owed     : GHS ${totalOwed.toFixed(2)}`);
  console.log(`Balance After Recovery : GHS ${(user.balance - totalOwed).toFixed(2)}\n`);

  for (const o of missingDebits) {
    console.log(` - #${o.id} | ${o.network} ${o.gbAmount}GB to ${o.phoneNumber} | GHS ${o.amount.toFixed(2)} | ${o.createdAt.toISOString()}`);
  }

  if (!APPLY) {
    console.log("\n✅ DRY RUN complete. To deduct and recover these funds, run:");
    console.log("npx tsx scripts/reconcile-prince-september.ts --apply");
    return;
  }

  console.log("\n⚡ Applying deduction...");
  await prisma.$transaction(async (tx) => {
    // 1. Deduct from balance
    await tx.user.update({
      where: { id: user.id },
      data: { balance: { decrement: totalOwed } },
    });

    // 2. Mark orders as live
    const orderIds = missingDebits.map((o) => o.id);
    await tx.order.updateMany({
      where: { id: { in: orderIds } },
      data: { isSandbox: false },
    });

    // 3. Create wallet debit records
    for (const o of missingDebits) {
      await tx.walletTransaction.create({
        data: {
          userId: user.id,
          type: "DEBIT",
          amount: o.amount,
          status: "APPROVED",
          reference: `order:${o.id}`,
          note: `[RECONCILIATION] Data: ${o.network} ${o.gbAmount}GB to ${o.phoneNumber} (Order #${o.id}) — retroactive deduction for Sept 25`,
        },
      });
    }

    const updated = await tx.user.findUnique({
      where: { id: user.id },
      select: { balance: true },
    });

    console.log(`✅ Recovered GHS ${totalOwed.toFixed(2)}! New balance: GHS ${(updated?.balance ?? 0).toFixed(2)}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
