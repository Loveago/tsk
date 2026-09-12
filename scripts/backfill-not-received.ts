import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * One-off backfill (§22.8 — preserve existing data):
 *  - assigns `seq` (used for the NR-00xxx report code) to existing DeliveryReports
 *  - sets `completedAt` on SUCCESS orders from their status history when missing
 */
async function main() {
  const reports = await prisma.deliveryReport.findMany({
    where: { seq: null as unknown as undefined },
    orderBy: { createdAt: "asc" },
  });
  const max = await prisma.deliveryReport.aggregate({ _max: { seq: true } });
  let next = (max._max.seq ?? 0) + 1;
  for (const r of reports) {
    await prisma.deliveryReport.update({ where: { id: r.id }, data: { seq: next++ } });
  }
  console.log(`Backfilled seq on ${reports.length} delivery report(s)`);

  const orders = await prisma.order.findMany({
    where: { status: "SUCCESS", completedAt: null },
    include: { history: { orderBy: { createdAt: "asc" } } },
  });
  for (const o of orders) {
    const successEntry = [...o.history].reverse().find((h) => h.status === "SUCCESS");
    const completedAt = successEntry?.createdAt ?? o.updatedAt;
    await prisma.order.update({ where: { id: o.id }, data: { completedAt } });
  }
  console.log(`Backfilled completedAt on ${orders.length} order(s)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
