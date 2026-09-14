/**
 * Comprehensive automated tests for Tskconnect MTN Number Verification System.
 * Run with: npx tsx scripts/test-mtn-verification.ts
 */

import { prisma } from "../src/lib/prisma";
import {
  normalizeGhanaPhoneNumber,
  isValidGhanaPhoneNumber,
  isMtnPhoneNumber,
  getNetworkFromGhanaPhone,
  isMtnVerificationEnabled,
  setMtnVerificationEnabled,
  isMtnNumberAccepted,
  addAcceptedMtnNumber,
  removeAcceptedMtnNumber,
  bulkRemoveAcceptedMtnNumbers,
  parseMtnNumbersFile,
  bulkImportAcceptedMtnNumbers,
  submitVerificationRequest,
  createVerificationBatch,
  exportVerificationBatch,
  completeBatchVerification,
  promoteBlockedToAccepted,
  validateMtnOrderRecipient,
  getMtnVerificationStats,
  MtnNumberNotVerifiedError,
  createBatchFromBlockedNumbers,
  getMtnNumberDetails,
} from "../src/lib/mtn-verification";
import { rateLimit } from "../src/lib/rate-limit";
import { createOrder } from "../src/lib/orders";

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: any) {
  if (condition) {
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${name}`, detail ?? "");
    failed++;
  }
}

async function runTests() {
  console.log("\n========================================================");
  console.log("  TEST SUITE: MTN NUMBER VERIFICATION SYSTEM");
  console.log("========================================================\n");

  // -------------------------------------------------------------------------
  // 1. NUMBER NORMALIZATION & PREFIX VALIDATION
  // -------------------------------------------------------------------------
  console.log("--- 1. Number Normalization & Prefix Rules ---");

  const normCases = [
    { input: "0241234567", expected: "0241234567", desc: "Local 10-digit 024" },
    { input: "+233241234567", expected: "0241234567", desc: "International +233 prefix" },
    { input: "233241234567", expected: "0241234567", desc: "International 233 without +" },
    { input: "241234567", expected: "0241234567", desc: "Excel-dropped leading zero (9 digits)" },
    { input: "+233 24 123 4567", expected: "0241234567", desc: "Spaced international number" },
    { input: "024-123-4567", expected: "0241234567", desc: "Dashed local number" },
    { input: "055 987 6543", expected: "0559876543", desc: "Spaced 055 number" },
    { input: "0591234567", expected: "0591234567", desc: "059 prefix" },
    { input: "0531234567", expected: "0531234567", desc: "053 prefix" },
    { input: "0201234567", expected: "0201234567", desc: "Telecel 020 number" },
    { input: "0271234567", expected: "0271234567", desc: "AirtelTigo 027 number" },
    { input: "00233241234567", expected: "0241234567", desc: "International 00233 prefix" },
  ];

  for (const c of normCases) {
    const res = normalizeGhanaPhoneNumber(c.input);
    assert(res === c.expected, `Normalize: ${c.desc} (${c.input} -> ${res})`);
  }

  // Prefix checks
  assert(isMtnPhoneNumber("0241234567"), "024 is MTN");
  assert(isMtnPhoneNumber("0251234567"), "025 is MTN");
  assert(isMtnPhoneNumber("0531234567"), "053 is MTN");
  assert(isMtnPhoneNumber("0541234567"), "054 is MTN");
  assert(isMtnPhoneNumber("0551234567"), "055 is MTN");
  assert(isMtnPhoneNumber("0591234567"), "059 is MTN");

  assert(!isMtnPhoneNumber("0201234567"), "020 is NOT MTN (Telecel)");
  assert(!isMtnPhoneNumber("0501234567"), "050 is NOT MTN (Telecel)");
  assert(!isMtnPhoneNumber("0261234567"), "026 is NOT MTN (AirtelTigo)");
  assert(!isMtnPhoneNumber("0271234567"), "027 is NOT MTN (AirtelTigo)");
  assert(!isMtnPhoneNumber("0211234567"), "021 is invalid prefix");
  assert(!isMtnPhoneNumber("024123456"), "9 digits is invalid without normalization");

  assert(getNetworkFromGhanaPhone("0241234567") === "MTN", "Detected MTN network");
  assert(getNetworkFromGhanaPhone("0201234567") === "TELECEL", "Detected Telecel network");
  assert(getNetworkFromGhanaPhone("0271234567") === "AIRTELTIGO", "Detected AirtelTigo network");

  // -------------------------------------------------------------------------
  // 2. ACCEPTED NUMBERS & FILE IMPORT (TXT & CSV)
  // -------------------------------------------------------------------------
  console.log("\n--- 2. Accepted Numbers Whitelist & File Imports ---");

  // Test setup: clean test numbers
  const testNumberA = "0249990001";
  const testNumberB = "0559990002";
  const testNumberC = "0599990003";
  const testNumberD = "0549990004";
  const testNumberE = "0539990005";

  await prisma.acceptedMtnNumber.deleteMany({
    where: { normalizedNumber: { in: [testNumberA, testNumberB, testNumberC, testNumberD, testNumberE, "0241112222"] } },
  });

  // Manual add
  const added = await addAcceptedMtnNumber(testNumberA, "MANUAL", "test_admin@tskconnect.com");
  assert(added.normalizedNumber === testNumberA, "addAcceptedMtnNumber correctly normalizes & inserts");
  assert(await isMtnNumberAccepted(testNumberA), "isMtnNumberAccepted returns true for whitelisted number");
  assert(!(await isMtnNumberAccepted("0240000000")), "isMtnNumberAccepted returns false for non-whitelisted number");

  // Duplicate add is idempotent
  const dupAdd = await addAcceptedMtnNumber(testNumberA, "MANUAL");
  assert(dupAdd.id === added.id, "Adding duplicate accepted number returns existing record without throwing");

  // Remove accepted number
  await removeAcceptedMtnNumber(added.id, "test_admin@tskconnect.com");
  assert(!(await isMtnNumberAccepted(testNumberA)), "removeAcceptedMtnNumber removes number from whitelist");

  // Import TXT parsing
  const txtContent = `
0249990001
+233559990002
0599990003
0249990001
0201234567
invalid_phone
  `;
  const txtPreview = await parseMtnNumbersFile(txtContent, "test.txt");
  assert(txtPreview.validNumbers.includes(testNumberA), "TXT preview finds valid 024 number");
  assert(txtPreview.validNumbers.includes(testNumberB), "TXT preview normalizes +233 number");
  assert(txtPreview.validNumbers.includes(testNumberC), "TXT preview finds 059 number");
  assert(txtPreview.duplicateCount === 1, "TXT preview identifies duplicate line");
  assert(txtPreview.invalidCount === 2, "TXT preview catches non-MTN number and text line");

  // TXT with comments and commas inside comments
  const txtWithComments = `
# Batch import on Monday, September 2026
// Verified by agent, approved
0249990001
+233 55 999 0002
# Another comment with, multiple, commas
0599990003
`;
  const txtCommentPreview = await parseMtnNumbersFile(txtWithComments, "whitelist.txt");
  assert(txtCommentPreview.validNumbers.length === 3, "TXT preview ignores # and // comments with commas");

  // Import CSV parsing with alternative header
  const csvContent = `
phone_number,notes
0249990001,Test 1
0549990004,Test 4
0539990005,Test 5
0549990004,Duplicate line
`;
  const csvPreview = await parseMtnNumbersFile(csvContent, "contacts.csv");
  assert(csvPreview.validNumbers.includes(testNumberD), "CSV preview parses custom header column");
  assert(csvPreview.validNumbers.includes(testNumberE), "CSV preview extracts valid 053 number");
  assert(csvPreview.duplicateCount === 1, "CSV preview tracks duplicates");

  // CSV with spaced header e.g. "Phone Number" and "Name"
  const spacedCsvContent = `Name, Phone Number, Date
Kwame Mensah, 0549990004, 2026-09-13
Ama Serwaa, 0539990005, 2026-09-13`;
  const spacedCsvPreview = await parseMtnNumbersFile(spacedCsvContent, "export.csv");
  assert(spacedCsvPreview.validNumbers.includes(testNumberD), "CSV with spaced header 'Phone Number' correctly parses column");
  assert(spacedCsvPreview.validNumbers.includes(testNumberE), "CSV with spaced header extracts second row");

  // CSV with semicolon delimiter
  const semicolonCsvContent = `Name;Mobile No;Role
Kwame;0549990004;Agent
Ama;0539990005;Reseller`;
  const semicolonPreview = await parseMtnNumbersFile(semicolonCsvContent, "users.csv");
  assert(semicolonPreview.validNumbers.includes(testNumberD), "Semicolon delimited CSV parses correctly");

  // Headerless CSV with phone in column 1
  const headerlessCsv = `Kwame,0549990004
Ama,0539990005`;
  const headerlessPreview = await parseMtnNumbersFile(headerlessCsv, "raw.csv");
  assert(headerlessPreview.validNumbers.includes(testNumberD), "Headerless CSV detects phone column");

  // Bulk import
  const importRes = await bulkImportAcceptedMtnNumbers({
    numbers: [testNumberA, testNumberB, testNumberC],
    source: "IMPORT_TXT",
    actorLabel: "test_admin@tskconnect.com",
  });
  assert(importRes.imported === 3, "bulkImportAcceptedMtnNumbers imports all 3 records");
  assert(Boolean(importRes.batchId), "bulkImportAcceptedMtnNumbers automatically created import batch record");
  assert(Boolean(importRes.batchReference?.startsWith("MTN-VERIFIED-")), "bulkImportAcceptedMtnNumbers generated valid batchReference");
  const acceptedA = await prisma.acceptedMtnNumber.findUnique({ where: { normalizedNumber: testNumberA } });
  assert(acceptedA?.batchId === importRes.batchId, "Accepted number record links to the import batch ID");
  assert(await isMtnNumberAccepted(testNumberA), "Imported number A is accepted");
  assert(await isMtnNumberAccepted(testNumberB), "Imported number B is accepted");
  assert(await isMtnNumberAccepted(testNumberC), "Imported number C is accepted");

  // Duplicate import test
  const dupImportRes = await bulkImportAcceptedMtnNumbers({
    numbers: [testNumberA, testNumberB],
    source: "IMPORT_TXT",
    actorLabel: "test_admin@tskconnect.com",
  });
  assert(dupImportRes.imported === 0, "Duplicate import safely skipped existing accepted numbers");

  // -------------------------------------------------------------------------
  // 3. VERIFICATION REQUESTS & AUTOMATIC STATUS SYNC
  // -------------------------------------------------------------------------
  console.log("\n--- 3. User Verification Requests & Status Flow ---");

  const testUser = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!testUser) throw new Error("No user found for test");

  const userReqNumber = "0248881111";
  const userReqNumber2 = "0248882222";

  await prisma.acceptedMtnNumber.deleteMany({
    where: { normalizedNumber: { in: [userReqNumber, userReqNumber2] } },
  });
  await prisma.mtnVerificationRequest.deleteMany({
    where: { normalizedNumber: { in: [userReqNumber, userReqNumber2] } },
  });

  // Submit request
  const submitRes = await submitVerificationRequest(testUser.id, userReqNumber, testUser.email);
  assert(submitRes.status === "SUBMITTED", "User submitted number creates SUBMITTED request");

  // Duplicate active request check (§27)
  const dupSubmitRes = await submitVerificationRequest(testUser.id, userReqNumber, testUser.email);
  assert(dupSubmitRes.status === "ALREADY_PENDING", "Submitting already pending request returns ALREADY_PENDING");

  // Already accepted check (§27)
  await addAcceptedMtnNumber(userReqNumber2, "MANUAL", "admin");
  const acceptedSubmitRes = await submitVerificationRequest(testUser.id, userReqNumber2, testUser.email);
  assert(acceptedSubmitRes.status === "VERIFIED", "Submitting already accepted number returns VERIFIED immediately");

  // -------------------------------------------------------------------------
  // 4. VERIFICATION BATCHES & PARTIAL VERIFICATION
  // -------------------------------------------------------------------------
  console.log("\n--- 4. Verification Batches & Partial Results ---");

  // Create another request
  const batchNum1 = "0247770001";
  const batchNum2 = "0247770002";
  await prisma.mtnVerificationRequest.deleteMany({
    where: { normalizedNumber: { in: [batchNum1, batchNum2] } },
  });
  await prisma.acceptedMtnNumber.deleteMany({
    where: { normalizedNumber: { in: [batchNum1, batchNum2] } },
  });

  const req1 = await submitVerificationRequest(testUser.id, batchNum1);
  const req2 = await submitVerificationRequest(testUser.id, batchNum2);

  // Create batch
  const batch = await createVerificationBatch({
    requestIds: [req1.request!.id, req2.request!.id],
    actorLabel: "test_admin",
  });
  assert(batch.status === "READY", "Created batch starts in READY state");
  assert(batch.totalNumbers === 2, "Batch tracks total numbers correctly");

  // Check that requests transitioned to PROCESSING
  const updatedReq1 = await prisma.mtnVerificationRequest.findUnique({ where: { id: req1.request!.id } });
  assert(updatedReq1?.status === "PROCESSING", "Batched requests transition to PROCESSING status");

  // Export batch
  const txtExport = await exportVerificationBatch(batch.id, "txt", "test_admin");
  assert(txtExport.content.includes(batchNum1) && txtExport.content.includes(batchNum2), "Export TXT contains batch numbers");

  const csvExport = await exportVerificationBatch(batch.id, "csv", "test_admin");
  assert(csvExport.content.startsWith("number\n"), "Export CSV contains header and numbers");

  // Partial Verification: verify batchNum1, reject batchNum2 (§12)
  const batchNumbers = await prisma.mtnVerificationBatchNumber.findMany({ where: { batchId: batch.id } });
  const num1Record = batchNumbers.find((n) => n.number === batchNum1);

  const partialRes = await completeBatchVerification({
    batchId: batch.id,
    mode: "SELECTED",
    verifiedNumberIds: [num1Record!.id],
    rejectionReason: "Number failed portal verification",
    actorLabel: "test_admin",
  });

  assert(partialRes.verifiedCount === 1, "Partial batch recorded 1 verified number");
  assert(partialRes.rejectedCount === 1, "Partial batch recorded 1 rejected number");

  assert(await isMtnNumberAccepted(batchNum1), "Verified number from batch added to AcceptedMtnNumber whitelist");
  assert(!(await isMtnNumberAccepted(batchNum2)), "Rejected number from batch was NOT added to AcceptedMtnNumber");

  const finalReq1 = await prisma.mtnVerificationRequest.findUnique({ where: { id: req1.request!.id } });
  const finalReq2 = await prisma.mtnVerificationRequest.findUnique({ where: { id: req2.request!.id } });
  assert(finalReq1?.status === "VERIFIED", "Corresponding request 1 updated to VERIFIED");
  assert(finalReq2?.status === "REJECTED", "Corresponding request 2 updated to REJECTED");

  // -------------------------------------------------------------------------
  // 5. ORDER VALIDATION & ENFORCEMENT SCENARIOS (A, B, C, D, E, F)
  // -------------------------------------------------------------------------
  console.log("\n--- 5. Order Enforcement Scenarios (A, B, C, D, E, F) ---");

  const whitelistedMtn = "0245550001";
  const unwhitelistedMtn = "0245550002";
  const telecelNum = "0201234567";
  const airteltigoNum = "0271234567";

  await prisma.acceptedMtnNumber.deleteMany({
    where: { normalizedNumber: { in: [whitelistedMtn, unwhitelistedMtn] } },
  });
  await prisma.blockedMtnNumber.deleteMany({
    where: { normalizedNumber: { in: [whitelistedMtn, unwhitelistedMtn] } },
  });

  await addAcceptedMtnNumber(whitelistedMtn, "TEST");

  // Scenario A: Verification ON + accepted number -> order allowed
  await setMtnVerificationEnabled(true);
  const checkA = await validateMtnOrderRecipient(whitelistedMtn, "MTN", testUser.id);
  assert(checkA.allowed === true, "Scenario A: Verification ON + accepted MTN number -> ALLOWED");

  // Scenario B: Verification ON + unaccepted number -> order rejected
  const checkB = await validateMtnOrderRecipient(unwhitelistedMtn, "MTN", testUser.id);
  assert(checkB.allowed === false, "Scenario B: Verification ON + unaccepted MTN number -> REJECTED");
  assert(
    Boolean(checkB.reason?.includes("not been verified yet")),
    "Scenario B: Clear instructions given to submit number for verification"
  );

  // Scenario C: Verification OFF + accepted number -> order allowed
  await setMtnVerificationEnabled(false);
  const checkC = await validateMtnOrderRecipient(whitelistedMtn, "MTN", testUser.id);
  assert(checkC.allowed === true, "Scenario C: Verification OFF + accepted MTN number -> ALLOWED");

  // Scenario D: Verification OFF + unaccepted number -> order allowed + recorded in Blocked/Unverified list
  const checkD = await validateMtnOrderRecipient(unwhitelistedMtn, "MTN", testUser.id);
  assert(checkD.allowed === true, "Scenario D: Verification OFF + unaccepted MTN number -> ALLOWED");

  const blockedRow = await prisma.blockedMtnNumber.findUnique({
    where: { normalizedNumber: unwhitelistedMtn },
  });
  assert(blockedRow !== null, "Scenario D: Unaccepted number recorded in BlockedMtnNumber table");
  assert(blockedRow?.orderCount === 1, "Scenario D: First order usage recorded");

  // Repeat order increments orderCount without duplicating row
  await validateMtnOrderRecipient(unwhitelistedMtn, "MTN", testUser.id);
  const blockedRow2 = await prisma.blockedMtnNumber.findUnique({
    where: { normalizedNumber: unwhitelistedMtn },
  });
  assert(blockedRow2?.orderCount === 2, "Scenario D: Subsequent order incremented orderCount on existing row");

  // Pre-validation check with recordUnverified: false does NOT increment orderCount
  const checkDPre = await validateMtnOrderRecipient(unwhitelistedMtn, "MTN", testUser.id, {
    recordUnverified: false,
  });
  assert(checkDPre.allowed === true, "Pre-validation check allowed without recording");
  const blockedRow3 = await prisma.blockedMtnNumber.findUnique({
    where: { normalizedNumber: unwhitelistedMtn },
  });
  assert(blockedRow3?.orderCount === 2, "Pre-validation with recordUnverified: false preserved orderCount at 2");

  // Scenario E: Telecel order unaffected when verification is ON
  await setMtnVerificationEnabled(true);
  const checkE = await validateMtnOrderRecipient(telecelNum, "TELECEL", testUser.id);
  assert(checkE.allowed === true, "Scenario E: Telecel order unaffected when verification is ON");

  // Scenario F: AirtelTigo order unaffected when verification is ON
  const checkF = await validateMtnOrderRecipient(airteltigoNum, "AIRTELTIGO", testUser.id);
  assert(checkF.allowed === true, "Scenario F: AirtelTigo order unaffected when verification is ON");

  // -------------------------------------------------------------------------
  // 6. BLOCKED NUMBER PROMOTION & STATS
  // -------------------------------------------------------------------------
  console.log("\n--- 6. Blocked Number Promotion & System Stats ---");

  // Promote blocked number directly to whitelist
  await promoteBlockedToAccepted(blockedRow!.id, "test_admin");
  assert(await isMtnNumberAccepted(unwhitelistedMtn), "Blocked number successfully promoted to AcceptedMtnNumber");

  const updatedBlockedRow = await prisma.blockedMtnNumber.findUnique({
    where: { id: blockedRow!.id },
  });
  assert(updatedBlockedRow?.status === "ACCEPTED", "Blocked record status updated to ACCEPTED");

  // Verification stats check
  const stats = await getMtnVerificationStats();
  assert(typeof stats.accepted === "number" && stats.accepted > 0, "Stats report total accepted count");
  assert(typeof stats.blocked === "number", "Stats report blocked count");

  // -------------------------------------------------------------------------
  // 7. ADVANCED FEATURES: BLOCKED BATCHING, NUMBER DETAILS & RATE LIMITING
  // -------------------------------------------------------------------------
  console.log("\n--- 7. Advanced: Blocked Batching, Details & Rate Limiting ---");

  // Test createBatchFromBlockedNumbers
  const blockedBatchNum1 = "0551112222";
  const blockedBatchNum2 = "0553334444";
  await prisma.blockedMtnNumber.deleteMany({
    where: { normalizedNumber: { in: [blockedBatchNum1, blockedBatchNum2] } },
  });
  await prisma.mtnVerificationRequest.deleteMany({
    where: { normalizedNumber: { in: [blockedBatchNum1, blockedBatchNum2] } },
  });

  const b1 = await prisma.blockedMtnNumber.create({
    data: {
      number: blockedBatchNum1,
      normalizedNumber: blockedBatchNum1,
      orderCount: 3,
      status: "UNVERIFIED",
    },
  });
  const b2 = await prisma.blockedMtnNumber.create({
    data: {
      number: blockedBatchNum2,
      normalizedNumber: blockedBatchNum2,
      orderCount: 1,
      status: "UNVERIFIED",
    },
  });

  const blockedBatch = await createBatchFromBlockedNumbers({
    blockedIds: [b1.id, b2.id],
    actorLabel: "test_admin",
  });
  assert(blockedBatch.totalNumbers === 2, "createBatchFromBlockedNumbers created batch with 2 numbers");
  assert(blockedBatch.status === "READY", "Blocked batch starts in READY state");

  // Test getMtnNumberDetails
  const details = await getMtnNumberDetails(blockedBatchNum1);
  assert(details.number === blockedBatchNum1, "getMtnNumberDetails returns canonical number");
  assert(details.network === "MTN", "getMtnNumberDetails detects MTN network");
  assert(details.isMtn === true, "getMtnNumberDetails identifies as MTN");
  assert(details.blocked !== null, "getMtnNumberDetails contains blocked usage info");
  assert(details.requests.length > 0, "getMtnNumberDetails contains linked verification requests");

  // Test Rate Limiter (§23)
  const testKey = `test_rate_limit_${Date.now()}`;
  for (let i = 0; i < 20; i++) {
    rateLimit(testKey, 20, 60_000);
  }
  const throttled = rateLimit(testKey, 20, 60_000);
  assert(throttled.allowed === false, "Rate limiter throttles on exceeding maximum submissions limit");

  // Clean up test data
  await prisma.acceptedMtnNumber.deleteMany({
    where: {
      normalizedNumber: {
        in: [
          testNumberA, testNumberB, testNumberC, testNumberD, testNumberE,
          userReqNumber, userReqNumber2, batchNum1, batchNum2,
          whitelistedMtn, unwhitelistedMtn, blockedBatchNum1, blockedBatchNum2,
        ],
      },
    },
  });
  const batchIdsToClean = [batch.id, blockedBatch.id];
  if (importRes.batchId) batchIdsToClean.push(importRes.batchId);
  await prisma.mtnVerificationBatch.deleteMany({
    where: { id: { in: batchIdsToClean } },
  });
  await prisma.mtnVerificationRequest.deleteMany({
    where: {
      normalizedNumber: {
        in: [userReqNumber, userReqNumber2, batchNum1, batchNum2, blockedBatchNum1, blockedBatchNum2],
      },
    },
  });
  await prisma.blockedMtnNumber.deleteMany({
    where: { normalizedNumber: { in: [unwhitelistedMtn, batchNum1, batchNum2, blockedBatchNum1, blockedBatchNum2] } },
  });

  console.log("\n========================================================");
  console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("========================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests()
  .catch((e) => {
    console.error("Test execution failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
