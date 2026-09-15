import { prisma } from "../src/lib/prisma";
import {
  parseMtnNumbersFile,
  bulkImportAcceptedMtnNumbers,
  createImportStagingSession,
  getImportStagingSession,
  isMtnNumberAccepted,
} from "../src/lib/mtn-verification";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ✗ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ PASS: ${message}`);
}

async function runLargeScaleImportBenchmark() {
  console.log("========================================================");
  console.log("  BENCHMARK: LARGE-SCALE MTN NUMBER IMPORT (100,000+)");
  console.log("========================================================");

  const COUNT = 100000;
  console.log(`\nGenerating synthetic TXT content with ${COUNT.toLocaleString()} lines...`);

  const lines: string[] = [];
  // Prefix 024, followed by 7 digits starting from 1000000
  for (let i = 0; i < COUNT - 200; i++) {
    lines.push(`024${String(1000000 + i).padStart(7, "0")}`);
  }

  // Add 100 duplicates
  for (let i = 0; i < 100; i++) {
    lines.push(`024${String(1000000 + i).padStart(7, "0")}`);
  }

  // Add 50 invalid numbers
  for (let i = 0; i < 50; i++) {
    lines.push(`123456789`); // invalid prefix
  }

  // Add 50 formatted numbers (spaced, with comments, +233)
  for (let i = 0; i < 50; i++) {
    lines.push(`+233 55 800 ${String(1000 + i).padStart(4, "0")} # comment test`);
  }

  const fileContent = lines.join("\n");
  const fileSizeMB = (Buffer.byteLength(fileContent, "utf-8") / (1024 * 1024)).toFixed(2);
  console.log(`Generated file content size: ${fileSizeMB} MB with ${lines.length.toLocaleString()} lines.`);

  // 1. Benchmark parseMtnNumbersFile
  console.log("\n--- Step 1: Benchmarking parseMtnNumbersFile ---");
  const parseStart = Date.now();
  const preview = await parseMtnNumbersFile(fileContent, "large_batch_test.txt");
  const parseDuration = Date.now() - parseStart;

  console.log(`Parsing & DB validation completed in ${parseDuration} ms (${(parseDuration / 1000).toFixed(2)}s).`);
  console.log(`  Total Rows: ${preview.totalRows.toLocaleString()}`);
  console.log(`  Valid Numbers: ${preview.validNumbers.length.toLocaleString()}`);
  console.log(`  Duplicates in file: ${preview.duplicateCount.toLocaleString()}`);
  console.log(`  Invalid rows: ${preview.invalidCount.toLocaleString()}`);
  console.log(`  Already Accepted in DB: ${preview.alreadyAcceptedCount.toLocaleString()}`);

  assert(preview.totalRows === lines.length, "Parsed all lines without skipping");
  assert(preview.duplicateCount === 100, "Accurately detected all 100 duplicates");
  assert(preview.invalidCount === 50, "Accurately detected all 50 invalid phone numbers");
  assert(preview.validNumbers.length === COUNT - 200 + 50, "Correct valid count calculated");
  assert(parseDuration < 10000, "Validation completed under 10 seconds for 100k records");

  // 2. Benchmark Staging Session
  console.log("\n--- Step 2: Benchmarking Staging Session Creation ---");
  const stageStart = Date.now();
  const sessionId = await createImportStagingSession({
    filename: "large_batch_test.txt",
    totalRows: preview.totalRows,
    validNumbers: preview.validNumbers,
    duplicateCount: preview.duplicateCount,
    duplicates: preview.duplicates,
    alreadyAcceptedCount: preview.alreadyAcceptedCount,
    alreadyAccepted: preview.alreadyAccepted,
    invalidCount: preview.invalidCount,
    invalid: preview.invalid,
  });
  const stageDuration = Date.now() - stageStart;
  console.log(`Staging session created in ${stageDuration} ms. Session ID: ${sessionId}`);

  const staged = await getImportStagingSession(sessionId);
  assert(Boolean(staged), "Staging session retrieved successfully");
  assert(staged?.validNumbers.length === preview.validNumbers.length, "Staging session preserved all valid numbers");

  // 3. Benchmark bulkImportAcceptedMtnNumbers via Staging Session
  console.log("\n--- Step 3: Benchmarking bulkImportAcceptedMtnNumbers (PostgreSQL UNNEST Ingestion) ---");
  const importStart = Date.now();
  const importRes = await bulkImportAcceptedMtnNumbers({
    sessionId,
    source: "BENCHMARK_TEST",
    actorLabel: "benchmark_admin@tskconnect.com",
  });
  const importDuration = Date.now() - importStart;

  console.log(`Imported ${importRes.imported.toLocaleString()} numbers in ${importDuration} ms (${(importDuration / 1000).toFixed(2)}s)!`);
  console.log(`Throughput: ${(importRes.imported / (importDuration / 1000)).toFixed(0)} numbers / second.`);
  console.log(`Batch reference: ${importRes.batchReference}`);

  assert(importRes.imported === preview.validNumbers.length, "All staged numbers inserted into AcceptedMtnNumber");
  assert(importDuration < 30000, "Bulk import of ~100k numbers completed under 30 seconds");


  // Verify spot-checks
  const sampleNum = "0241000000";
  assert(await isMtnNumberAccepted(sampleNum), `Spot check: ${sampleNum} is accepted`);

  // Verify duplicate import safely skips
  console.log("\n--- Step 4: Verify duplicate re-import safely skips existing records ---");
  const dupImportRes = await bulkImportAcceptedMtnNumbers({
    numbers: [sampleNum, "0241000001", "0241000002"],
    source: "BENCHMARK_TEST",
    actorLabel: "benchmark_admin@tskconnect.com",
  });
  assert(dupImportRes.imported === 0, "Duplicate re-import inserted 0 duplicate records");

  // 4. Cleanup benchmark data
  console.log("\n--- Step 5: Cleaning up benchmark records from database ---");
  const cleanupStart = Date.now();
  const deleteRes = await prisma.acceptedMtnNumber.deleteMany({
    where: { source: "BENCHMARK_TEST" },
  });
  if (importRes.batchId) {
    await prisma.mtnVerificationBatch.delete({ where: { id: importRes.batchId } }).catch(() => {});
  }
  if (dupImportRes.batchId) {
    await prisma.mtnVerificationBatch.delete({ where: { id: dupImportRes.batchId } }).catch(() => {});
  }
  console.log(`Cleaned up ${deleteRes.count.toLocaleString()} benchmark test records in ${Date.now() - cleanupStart} ms.`);

  console.log("\n========================================================");
  console.log("  BENCHMARK COMPLETED SUCCESSFULLY: 100K IMPORT PASS");
  console.log("========================================================\n");
}

runLargeScaleImportBenchmark()
  .catch((err) => {
    console.error("Benchmark failed with error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
