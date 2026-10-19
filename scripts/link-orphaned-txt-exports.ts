/**
 * scripts/link-orphaned-txt-exports.ts
 *
 * Links TXT exports (such as MTN_20261019.txt) into tracked ExportBatch records so they
 * appear on /admin/exports, allowing admins to view, track, and update their order statuses.
 *
 * Modes of Operation:
 * 1. From file:
 *      npx tsx scripts/link-orphaned-txt-exports.ts MTN_20261019.txt            # Dry run
 *      npx tsx scripts/link-orphaned-txt-exports.ts MTN_20261019.txt --execute  # Commit
 *
 * 2. Auto-detect (looks for MTN_20261019.txt on disk, or matches today's 33 orders / recent MTN orders):
 *      npx tsx scripts/link-orphaned-txt-exports.ts            # Dry run
 *      npx tsx scripts/link-orphaned-txt-exports.ts --execute  # Commit
 */

import fs from "fs";
import path from "path";
import { prisma } from "../src/lib/prisma";
import { nextExportCode } from "../src/lib/batches";

// The 33 MTN orders from the emergency refund/reversal session this morning (2026-10-19)
const KNOWN_OCT19_PAIRS: { phone: string; gb: number }[] = [
  { phone: "0596088949", gb: 1 },
  { phone: "0598288636", gb: 1 },
  { phone: "0530970454", gb: 3 },
  { phone: "0593562997", gb: 1 },
  { phone: "0249846523", gb: 7 },
  { phone: "0241170434", gb: 20 },
  { phone: "0555402639", gb: 2 },
  { phone: "0245320065", gb: 10 },
  { phone: "0597103035", gb: 1 },
  { phone: "0557693310", gb: 1 },
  { phone: "0546207585", gb: 1 },
  { phone: "0591814090", gb: 1 },
  { phone: "0248501320", gb: 2 },
  { phone: "0592125511", gb: 2 },
  { phone: "0597083736", gb: 10 },
  { phone: "0248211240", gb: 1 },
  { phone: "0540684945", gb: 2 },
  { phone: "0246003217", gb: 3 },
  { phone: "0249428660", gb: 3 },
  { phone: "0546320326", gb: 3 },
  { phone: "0551821818", gb: 1 },
  { phone: "0544366390", gb: 15 },
  { phone: "0240133302", gb: 1 },
  { phone: "0557188781", gb: 2 },
  { phone: "0545703743", gb: 1 },
  { phone: "0240577040", gb: 1 },
  { phone: "0599062657", gb: 3 },
  { phone: "0546616324", gb: 2 },
  { phone: "0249739978", gb: 1 },
  { phone: "0552174778", gb: 3 },
  { phone: "0538554072", gb: 2 },
  { phone: "0543666678", gb: 7 },
  { phone: "0548788937", gb: 1 },
];

function normalizePhone(p: string): string {
  const digits = p.replace(/\D/g, "");
  if (digits.startsWith("233") && digits.length === 12) {
    return "0" + digits.slice(3);
  }
  return digits;
}

interface ParsedPair {
  phone: string;
  gb: number;
}

function parseTxtContent(content: string): ParsedPair[] {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const pairs: ParsedPair[] = [];
  for (const line of lines) {
    // Expected format: "<phone> <gb>" (e.g. "0596088949 1" or tab-separated)
    const parts = line.split(/[\s\t,]+/);
    if (parts.length >= 2) {
      const phone = normalizePhone(parts[0]);
      const gb = parseFloat(parts[1].replace(/gb/i, ""));
      if (phone && !isNaN(gb)) {
        pairs.push({ phone, gb });
      }
    }
  }
  return pairs;
}

async function main() {
  const isExecute = process.argv.includes("--execute");
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));

  console.log("======================================================================");
  console.log(` RECOVER TXT EXPORT TO EXPORT CENTER — ${isExecute ? "COMMIT MODE (--execute)" : "DRY-RUN (pass --execute to commit)"}`);
  console.log("======================================================================\n");

  let fileName = "MTN_20261019.txt";
  let targetPairs: ParsedPair[] = [];
  let sourceDescription = "";

  // 1. Check if user passed a file path, or if MTN_20261019.txt exists in cwd
  const potentialFiles = [
    args[0],
    "MTN_20261019.txt",
    path.join(process.cwd(), "MTN_20261019.txt"),
    path.join("/var/www/tskconnect", "MTN_20261019.txt"),
  ].filter(Boolean) as string[];

  let foundFilePath: string | null = null;
  for (const p of potentialFiles) {
    if (fs.existsSync(p)) {
      foundFilePath = p;
      fileName = path.basename(p);
      break;
    }
  }

  if (foundFilePath) {
    console.log(`📄 Found export file on disk: ${foundFilePath}`);
    const content = fs.readFileSync(foundFilePath, "utf8");
    targetPairs = parseTxtContent(content);
    sourceDescription = `file ${fileName} (${targetPairs.length} lines)`;
  } else {
    console.log(`ℹ No file found on disk. Checking default MTN export pairs for Oct 19, 2026...`);
    targetPairs = KNOWN_OCT19_PAIRS.map((p) => ({ phone: normalizePhone(p.phone), gb: p.gb }));
    sourceDescription = `known 33 MTN pairs from Oct 19, 2026 reversal session`;
  }

  console.log(`Target: ${sourceDescription}\n`);

  // Query database for matching orders created/updated today
  const lookbackDate = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours lookback

  const matchedOrders: any[] = [];
  const unmatchedPairs: ParsedPair[] = [];

  for (const pair of targetPairs) {
    // Find matching order in database
    const order = await prisma.order.findFirst({
      where: {
        phoneNumber: { in: [pair.phone, `233${pair.phone.replace(/^0/, "")}`] },
        gbAmount: pair.gb,
        createdAt: { gte: lookbackDate },
        isSandbox: false,
      },
      include: {
        user: { select: { id: true, email: true, name: true } },
        exportBatch: { select: { id: true, exportCode: true, fileName: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    if (order) {
      matchedOrders.push(order);
    } else {
      unmatchedPairs.push(pair);
    }
  }

  console.log(`---------------- MATCH SUMMARY ----------------`);
  console.log(`Total pairs to link : ${targetPairs.length}`);
  console.log(`Orders matched in DB: ${matchedOrders.length}`);
  console.log(`Unmatched pairs     : ${unmatchedPairs.length}`);

  if (unmatchedPairs.length > 0) {
    console.log("\nUnmatched pairs:");
    for (const u of unmatchedPairs) {
      console.log(`  - ${u.phone}  ${u.gb} GB`);
    }
  }

  if (matchedOrders.length === 0) {
    console.log("\n❌ No matching orders could be found in the database. Exiting.");
    return;
  }

  const totalGb = matchedOrders.reduce((s, o) => s + o.gbAmount, 0);
  const totalAmount = matchedOrders.reduce((s, o) => s + o.amount, 0);
  const network = matchedOrders[0]?.network || "MTN";

  console.log(`\nExport summary:`);
  console.log(`  File Name   : ${fileName}`);
  console.log(`  Network     : ${network}`);
  console.log(`  Orders      : ${matchedOrders.length}`);
  console.log(`  Total Volume: ${totalGb} GB`);
  console.log(`  Total Amount: GHS ${totalAmount.toFixed(2)}`);

  console.log("\nMatched Order Samples:");
  for (const o of matchedOrders.slice(0, 10)) {
    const prevBatch = o.exportBatch ? ` (prev batch: ${o.exportBatch.exportCode} - ${o.exportBatch.fileName})` : "";
    console.log(`  Order #${o.id} | ${o.phoneNumber} | ${o.gbAmount} GB | Status: ${o.status}${prevBatch}`);
  }
  if (matchedOrders.length > 10) {
    console.log(`  ... and ${matchedOrders.length - 10} more orders`);
  }

  if (!isExecute) {
    console.log("\n======================================================================");
    console.log(" DRY RUN COMPLETE — Nothing was modified in the database.");
    console.log(" To link these orders and create the ExportBatch on /admin/exports, run:");
    console.log(`   npx tsx scripts/link-orphaned-txt-exports.ts ${fileName} --execute`);
    console.log("======================================================================\n");
    return;
  }

  // EXECUTE MODE
  console.log("\nCommitting changes to database...");
  const exportCode = await nextExportCode();

  // Find admin user to assign as creator
  const adminUser = await prisma.user.findFirst({
    where: { role: { in: ["ADMIN", "MANAGER"] } },
    select: { id: true, email: true },
  });

  const actorLabel = adminUser?.email || "admin@tskconnect.com";
  const actorId = adminUser?.id || matchedOrders[0].userId;

  // 1. Create ExportBatch record
  const exportBatch = await prisma.exportBatch.create({
    data: {
      exportCode,
      network,
      adminId: actorId,
      adminLabel: actorLabel,
      totalRecipients: matchedOrders.length,
      totalGb,
      totalAmount,
      status: "PROCESSING",
      fileName,
      createdAt: new Date(),
      note: `Linked TXT export ${fileName}`,
    },
  });

  // 2. Link orders and update status to PROCESSING
  const orderIds = matchedOrders.map((o) => o.id);
  await prisma.order.updateMany({
    where: { id: { in: orderIds } },
    data: {
      exportBatchId: exportBatch.id,
      providerReference: `MANUAL_EXPORT:${exportCode}`,
      status: "PROCESSING",
      lastExportedAt: new Date(),
      lastExportedBy: actorLabel,
      exportCount: { increment: 1 },
    },
  });

  // 3. Connect order batches if any
  const batchIds = [...new Set(matchedOrders.map((o) => o.batchId).filter(Boolean))] as string[];
  if (batchIds.length > 0) {
    await prisma.exportBatch.update({
      where: { id: exportBatch.id },
      data: { batches: { set: batchIds.map((id) => ({ id })) } },
    });
  }

  // 4. Create history notes
  await prisma.orderStatusHistory.createMany({
    data: matchedOrders.map((o) => ({
      orderId: o.id,
      status: "PROCESSING",
      previousStatus: o.status,
      note: `Linked to TXT export batch ${exportCode} (${fileName}) by ${actorLabel}`,
      changedBy: actorLabel,
    })),
  });

  console.log("\n======================================================================");
  console.log(" ✓ SUCCESS!");
  console.log(` Created ExportBatch: ${exportCode} (ID: ${exportBatch.id})`);
  console.log(` Linked ${matchedOrders.length} orders to batch ${exportCode} with file ${fileName}`);
  console.log(" Status set to: PROCESSING");
  console.log(" This export will now appear immediately on /admin/exports!");
  console.log("======================================================================\n");
}

main()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
