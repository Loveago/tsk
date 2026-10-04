import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: ["error"] });

async function main() {
  console.log("================================================================================");
  console.log("       VERIFYING SEPTEMBER (Sep 1 to Sep 30, 2026)");
  console.log("================================================================================");

  const start = new Date("2026-09-01T00:00:00.000Z");
  const end = new Date("2026-09-30T23:59:59.999Z");

  const totalOrdersSep = await prisma.order.count({
    where: { createdAt: { gte: start, lte: end } },
  });

  const totalSandboxSep = await prisma.order.count({
    where: { createdAt: { gte: start, lte: end }, isSandbox: true },
  });

  const sandboxSuccessSep = await prisma.order.findMany({
    where: {
      createdAt: { gte: start, lte: end },
      isSandbox: true,
      status: { in: ["SUCCESS", "PROCESSING", "COMPLETED"] },
    },
    select: {
      id: true,
      amount: true,
      network: true,
      phoneNumber: true,
      status: true,
      createdAt: true,
      user: { select: { email: true, name: true } },
    },
  });

  console.log(`Total orders placed in September       : ${totalOrdersSep}`);
  console.log(`Total sandbox orders created in September: ${totalSandboxSep}`);
  console.log(`Sandbox orders marked SUCCESS/PROCESSING : ${sandboxSuccessSep.length}`);

  if (sandboxSuccessSep.length === 0) {
    console.log("\n✅ 100% SAFE: ZERO sandbox orders were completed or leaked to live providers in September!");
  } else {
    console.log("\n⚠️ Found leaked sandbox orders in September:");
    for (const o of sandboxSuccessSep) {
      console.log(` - Order #${o.id}: GHS ${o.amount} by ${o.user.email} (${o.status}) on ${o.createdAt.toISOString()}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
