/**
 * print-mtn-numbers-october.ts
 *
 * Prints all unique MTN phone numbers that placed at least one order
 * from 1st October 2026 up to now.
 *
 * Usage:
 *   npx tsx scripts/print-mtn-numbers-october.ts
 *
 * Output: one number per line (easy to copy/paste or pipe to a file)
 *   npx tsx scripts/print-mtn-numbers-october.ts > mtn-numbers-oct.txt
 */

import { prisma } from "../src/lib/prisma";

async function run() {
  const from = new Date("2026-10-01T00:00:00.000Z");
  const to   = new Date(); // now

  const rows = await prisma.order.findMany({
    where: {
      network: "MTN",
      isSandbox: false,
      createdAt: { gte: from, lte: to },
    },
    select: { phoneNumber: true },
    distinct: ["phoneNumber"],
    orderBy: { phoneNumber: "asc" },
  });

  const numbers = rows.map((r) => r.phoneNumber);

  // ── Print summary to stderr so stdout stays clean for piping ─────────────
  process.stderr.write("=".repeat(50) + "\n");
  process.stderr.write("  UNIQUE MTN NUMBERS — 1 Oct 2026 → now\n");
  process.stderr.write("=".repeat(50) + "\n");
  process.stderr.write(`  Period : ${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}\n`);
  process.stderr.write(`  Count  : ${numbers.length} unique MTN numbers\n`);
  process.stderr.write("=".repeat(50) + "\n\n");

  // ── One number per line to stdout ─────────────────────────────────────────
  for (const num of numbers) {
    process.stdout.write(num + "\n");
  }

  await prisma.$disconnect();
}

run().catch(async (err) => {
  console.error("Fatal error:", err);
  await prisma.$disconnect();
  process.exit(1);
});
