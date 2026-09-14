/**
 * Test Suite for Feature 1 — Send & Claim Mobile Money Top-Up
 * Run with: npx tsx scripts/test-send-and-claim.ts
 */
import { prisma } from "../src/lib/prisma";
import {
  parseMomoSms,
  parseMtnSms,
  parseTelecelSms,
  parseAirtelTigoSms,
} from "../src/lib/momo-parser";
import {
  verifyForwarderSecret,
  processIncomingForwardedSms,
  claimMomoTransaction,
  adminManualCreditWallet,
  checkClaimRateLimit,
  recordFailedClaimAttempt,
  resetFailedClaimAttempts,
} from "../src/lib/send-claim";

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${name}${detail ? ` - ${detail}` : ""}`);
    failed++;
  }
}

async function runTests() {
  console.log("\n==================================================");
  console.log("SEND & CLAIM TEST SUITE");
  console.log("==================================================\n");

  // 1. SMS PARSER TESTS
  console.log("--- 1. SMS Parser Unit Tests ---");

  const mtnSms =
    "Payment received for GHS 50.00 from 0241234567 - KWAME MENSAH. Current Balance: GHS 1,234.50. Transaction ID: 12345678901. Fee charged: GHS 0.00.";
  const parsedMtn = parseMtnSms(mtnSms);
  assert(
    parsedMtn !== null &&
      parsedMtn.amount === 50 &&
      parsedMtn.transactionReference === "12345678901" &&
      parsedMtn.network === "MTN" &&
      parsedMtn.senderPhone === "0241234567",
    "Parse valid MTN MoMo SMS",
    JSON.stringify(parsedMtn)
  );

  const telecelSms =
    "You have received GHS 75.00 from 0201234567 - JANE DOE. Transaction ID: 88776655. Current Balance: GHS 500.00.";
  const parsedTelecel = parseTelecelSms(telecelSms);
  assert(
    parsedTelecel !== null &&
      parsedTelecel.amount === 75 &&
      parsedTelecel.transactionReference === "88776655" &&
      parsedTelecel.network === "TELECEL" &&
      parsedTelecel.senderPhone === "0201234567",
    "Parse valid Telecel (Vodafone) Cash SMS",
    JSON.stringify(parsedTelecel)
  );

  const atSms =
    "You have received GHS 30.00 from 0271234567. Trans ID: AT99887766. New balance is GHS 100.00.";
  const parsedAT = parseAirtelTigoSms(atSms);
  assert(
    parsedAT !== null &&
      parsedAT.amount === 30 &&
      parsedAT.transactionReference === "AT99887766" &&
      parsedAT.network === "AIRTELTIGO" &&
      parsedAT.senderPhone === "0271234567",
    "Parse valid AirtelTigo Money SMS",
    JSON.stringify(parsedAT)
  );

  const invalidSms = "Hello! Your package has been shipped via DHL.";
  const parsedInvalid = parseMomoSms(invalidSms);
  assert(parsedInvalid === null, "Invalid SMS returns null");

  // 2. SMS WEBHOOK AUTHENTICATION
  console.log("\n--- 2. SMS Webhook Authentication ---");
  const validSecret = process.env.SMS_FORWARDER_SECRET || "tskconnect_forwarder_secret_2026";
  assert(
    verifyForwarderSecret(`Bearer ${validSecret}`),
    "Valid Bearer token is accepted"
  );
  assert(
    verifyForwarderSecret(validSecret),
    "Valid raw token is accepted"
  );
  assert(
    !verifyForwarderSecret("Bearer wrong_secret_xyz"),
    "Invalid secret token is rejected"
  );
  assert(
    !verifyForwarderSecret(null),
    "Missing secret token is rejected"
  );

  // 3. INCOMING SMS PROCESSING & DUPLICATE DETECTION
  console.log("\n--- 3. Incoming SMS Storage & Duplicate Detection ---");
  const uniqueTxId = `TX${Date.now()}`;
  const testSms = `Payment received for GHS 100.00 from 0244112233 - TEST USER. Current Balance: GHS 500.00. Transaction ID: ${uniqueTxId}.`;

  const processResult1 = await processIncomingForwardedSms({
    rawSms: testSms,
    networkHint: "MTN",
  });
  assert(
    processResult1.success && processResult1.status === "AVAILABLE",
    "First SMS creates AVAILABLE transaction",
    JSON.stringify(processResult1)
  );

  // Send duplicate SMS
  const processResult2 = await processIncomingForwardedSms({
    rawSms: testSms,
    networkHint: "MTN",
  });
  assert(
    processResult2.success && processResult2.status === "DUPLICATE",
    "Second identical SMS marked as DUPLICATE and NOT claimable",
    JSON.stringify(processResult2)
  );

  // Send unparseable SMS
  const unparseableResult = await processIncomingForwardedSms({
    rawSms: "Some random unparseable promo message",
    networkHint: "MTN",
  });
  assert(
    unparseableResult.success && unparseableResult.status === "UNMATCHED",
    "Unparseable SMS marked as UNMATCHED for admin review",
    JSON.stringify(unparseableResult)
  );

  // 4. USER CLAIM MATCHING & SAFETY
  console.log("\n--- 4. User Claim Matching & Safety Rules ---");

  // Create a clean test user
  const testUserEmail = `claim_test_${Date.now()}@example.com`;
  const testUser = await prisma.user.create({
    data: {
      name: "Claim Test User",
      email: testUserEmail,
      passwordHash: "hash123",
      role: "USER",
      status: "ACTIVE",
      balance: 10,
    },
  });

  // Test 4A: Invalid Transaction ID
  let failedInvalidTx = false;
  try {
    await claimMomoTransaction({
      userId: testUser.id,
      userEmail: testUser.email,
      transactionReference: "NON_EXISTENT_REF_999",
      amount: 100,
      network: "MTN",
    });
  } catch (err: any) {
    failedInvalidTx = true;
  }
  assert(failedInvalidTx, "Claim with non-existent transaction ID is rejected");

  // Test 4B: Wrong Amount (user claims 200, SMS says 100)
  let failedWrongAmount = false;
  try {
    await claimMomoTransaction({
      userId: testUser.id,
      userEmail: testUser.email,
      transactionReference: uniqueTxId,
      amount: 200, // SMS is 100
      network: "MTN",
    });
  } catch (err: any) {
    failedWrongAmount = true;
  }
  assert(failedWrongAmount, "Claim with wrong amount is rejected");

  // Test 4C: Wrong Network (user claims TELECEL, SMS is MTN)
  let failedWrongNetwork = false;
  try {
    await claimMomoTransaction({
      userId: testUser.id,
      userEmail: testUser.email,
      transactionReference: uniqueTxId,
      amount: 100,
      network: "TELECEL",
    });
  } catch (err: any) {
    failedWrongNetwork = true;
  }
  assert(failedWrongNetwork, "Claim with wrong network is rejected");

  // Test 4D: Valid Claim -> Success
  const claimSuccess = await claimMomoTransaction({
    userId: testUser.id,
    userEmail: testUser.email,
    transactionReference: uniqueTxId,
    amount: 100,
    network: "MTN",
  });

  assert(
    claimSuccess.success &&
      claimSuccess.amount === 100 &&
      claimSuccess.newBalance === 110, // Started at 10 + 100
    "Valid claim succeeds and credits user wallet exactly once",
    JSON.stringify(claimSuccess)
  );

  // Verify wallet transaction ledger entry
  const walletTx = await prisma.walletTransaction.findFirst({
    where: { userId: testUser.id, reference: `MOMO-CLAIM-${uniqueTxId}` },
  });
  assert(
    walletTx !== null &&
      walletTx.amount === 100 &&
      walletTx.type === "TOPUP" &&
      walletTx.status === "APPROVED",
    "Corresponding APPROVED wallet transaction created in ledger"
  );

  // Verify incoming MoMo status is now CLAIMED
  const incomingTx = await prisma.incomingMomoTransaction.findUnique({
    where: { transactionReference: uniqueTxId },
  });
  assert(
    incomingTx !== null && incomingTx.status === "CLAIMED",
    "Incoming MoMo status updated to CLAIMED"
  );

  // Test 4E: Double Claim Prevention
  let failedDoubleClaim = false;
  try {
    await claimMomoTransaction({
      userId: testUser.id,
      userEmail: testUser.email,
      transactionReference: uniqueTxId,
      amount: 100,
      network: "MTN",
    });
  } catch (err: any) {
    failedDoubleClaim = true;
  }
  assert(failedDoubleClaim, "Already claimed transaction cannot be claimed again (Double claim blocked)");

  // 5. EXPIRATION CHECK
  console.log("\n--- 5. Expiration Handling ---");
  const expiredTxId = `TXEXP_${Date.now()}`;
  const oldDate = new Date(Date.now() - 8 * 24 * 3600 * 1000); // 8 days ago (limit is 7 days)
  await prisma.incomingMomoTransaction.create({
    data: {
      transactionReference: expiredTxId,
      network: "MTN",
      amount: 50,
      currency: "GHS",
      rawSms: "SMS",
      status: "AVAILABLE",
      createdAt: oldDate,
    },
  });

  let failedExpired = false;
  try {
    await claimMomoTransaction({
      userId: testUser.id,
      userEmail: testUser.email,
      transactionReference: expiredTxId,
      amount: 50,
      network: "MTN",
    });
  } catch {
    failedExpired = true;
  }
  assert(failedExpired, "Expired transaction is rejected");

  const expiredRecord = await prisma.incomingMomoTransaction.findUnique({
    where: { transactionReference: expiredTxId },
  });
  assert(
    expiredRecord?.status === "EXPIRED",
    "Expired transaction status transitioned to EXPIRED"
  );

  // 6. CONCURRENT CLAIM SIMULATION (RACE CONDITION CHECK)
  console.log("\n--- 6. Concurrent Claim Race Condition Protection ---");
  const concurrentTxId = `TXCONC_${Date.now()}`;
  await prisma.incomingMomoTransaction.create({
    data: {
      transactionReference: concurrentTxId,
      network: "MTN",
      amount: 40,
      currency: "GHS",
      rawSms: "SMS",
      status: "AVAILABLE",
    },
  });

  // Run two claim attempts in parallel for two different users
  const secondUser = await prisma.user.create({
    data: {
      name: "Second User",
      email: `second_${Date.now()}@example.com`,
      passwordHash: "hash123",
      role: "USER",
      status: "ACTIVE",
      balance: 0,
    },
  });

  const results = await Promise.allSettled([
    claimMomoTransaction({
      userId: testUser.id,
      userEmail: testUser.email,
      transactionReference: concurrentTxId,
      amount: 40,
      network: "MTN",
    }),
    claimMomoTransaction({
      userId: secondUser.id,
      userEmail: secondUser.email,
      transactionReference: concurrentTxId,
      amount: 40,
      network: "MTN",
    }),
  ]);

  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");

  assert(
    fulfilled.length === 1 && rejected.length === 1,
    "Exactly one concurrent claim succeeds; race condition prevented"
  );

  // 7. RATE LIMITING CHECK
  console.log("\n--- 7. Rate Limiting for Failed Claims ---");
  const testRateKey = "claim:ratelimit_test_user:127.0.0.1";
  resetFailedClaimAttempts(testRateKey);

  assert(checkClaimRateLimit(testRateKey, 5), "Rate limit allows initial attempts");
  for (let i = 0; i < 5; i++) {
    recordFailedClaimAttempt(testRateKey);
  }
  assert(!checkClaimRateLimit(testRateKey, 5), "Rate limit blocks after 5 failed attempts");
  resetFailedClaimAttempts(testRateKey);

  // 8. ADMIN MANUAL CREDIT
  console.log("\n--- 8. Admin Manual Wallet Credit ---");
  const manualCreditResult = await adminManualCreditWallet({
    adminId: "admin_test_id",
    adminEmail: "admin@tskconnect.com",
    userId: testUser.id,
    amount: 25,
    reason: "Administrative gesture / reconciliation",
    reference: `MAN-${Date.now()}`,
  });

  assert(
    manualCreditResult.success && manualCreditResult.amount === 25,
    "Admin manual credit succeeds and returns positive response"
  );

  const updatedUser = await prisma.user.findUnique({ where: { id: testUser.id } });
  assert(
    updatedUser?.balance === 135 || updatedUser?.balance === 175,
    `User balance accurately updated in ledger to ${updatedUser?.balance}`
  );

  // 9. OUTGOING DEBIT REJECTION
  console.log("\n--- 9. Outgoing Debit SMS Rejection ---");
  const debitSms =
    "Payment made to 0249876543 for GHS 70.00. Fee charged: GHS 0.70. Financial Transaction Id: DEB99887766. 2026-09-12 15:45:00.";
  const debitParsed = parseMtnSms(debitSms);
  assert(
    debitParsed !== null && debitParsed.isSuccessful === false && debitParsed.transactionType === "DEBIT",
    "Debit SMS identified as isSuccessful: false"
  );
  const debitProcessResult = await processIncomingForwardedSms({
    rawSms: debitSms,
    networkHint: "MTN",
  });
  assert(
    debitProcessResult.success && debitProcessResult.status === "REJECTED",
    "Outgoing debit transaction stored with status REJECTED (unclaimable)"
  );

  // 10. SUSPENDED USER CLAIM REJECTION
  console.log("\n--- 10. Suspended / Disabled User Claim Rejection ---");
  const suspendedUser = await prisma.user.create({
    data: {
      name: "Suspended User",
      email: `suspended_${Date.now()}@example.com`,
      passwordHash: "hash123",
      role: "USER",
      status: "DISABLED",
      balance: 0,
    },
  });

  const availableTxId = `TXAVAIL_${Date.now()}`;
  await prisma.incomingMomoTransaction.create({
    data: {
      transactionReference: availableTxId,
      network: "MTN",
      amount: 60,
      currency: "GHS",
      rawSms: "SMS",
      status: "AVAILABLE",
    },
  });

  let suspendedClaimFailed = false;
  try {
    await claimMomoTransaction({
      userId: suspendedUser.id,
      userEmail: suspendedUser.email,
      transactionReference: availableTxId,
      amount: 60,
      network: "MTN",
    });
  } catch (err: any) {
    suspendedClaimFailed = true;
  }
  assert(suspendedClaimFailed, "Suspended/disabled user claim is rejected");

  const uncreditedTx = await prisma.incomingMomoTransaction.findUnique({
    where: { transactionReference: availableTxId },
  });
  assert(uncreditedTx?.status === "AVAILABLE", "Transaction remains AVAILABLE after suspended user attempt");

  // 11. REJECTED CLAIM RECORD GENERATION
  console.log("\n--- 11. Rejected Claim Record Generation ---");
  const rejectedClaimRecord = await prisma.sendClaim.findFirst({
    where: { userId: suspendedUser.id },
    orderBy: { createdAt: "desc" },
  });
  assert(
    rejectedClaimRecord !== null && rejectedClaimRecord.status === "REJECTED",
    "Rejected claim creates SendClaim record with status REJECTED"
  );

  // 12. DATE AND TIME EXTRACTION
  console.log("\n--- 12. Date and Time Extraction ---");
  const smsWithDate =
    "Payment received for GHS 120.00 from 0241112233 - SENDER. Transaction ID: TXDT123. 2026-09-12 14:30:00.";
  const parsedWithDate = parseMtnSms(smsWithDate);
  assert(
    parsedWithDate !== null && parsedWithDate.transactionAt instanceof Date,
    "Date and time extracted from SMS into Date object",
    String(parsedWithDate?.transactionAt)
  );

  // 13. CASE-INSENSITIVE TRANSACTION REFERENCE LOOKUP
  console.log("\n--- 13. Case-Insensitive Reference Matching ---");
  const lowerRefUser = await prisma.user.create({
    data: {
      name: "Lower Ref User",
      email: `lowerref_${Date.now()}@example.com`,
      passwordHash: "hash123",
      role: "USER",
      status: "ACTIVE",
      balance: 0,
    },
  });
  const mixedTxId = `TXCASE${Date.now()}`;
  await prisma.incomingMomoTransaction.create({
    data: {
      transactionReference: mixedTxId.toUpperCase(),
      network: "MTN",
      amount: 45,
      currency: "GHS",
      rawSms: "SMS",
      status: "AVAILABLE",
    },
  });
  const caseClaimResult = await claimMomoTransaction({
    userId: lowerRefUser.id,
    userEmail: lowerRefUser.email,
    transactionReference: mixedTxId.toLowerCase(), // Lowercase claim attempt
    amount: 45,
    network: "mtn",
  });
  assert(caseClaimResult.success && caseClaimResult.amount === 45, "Lowercase reference successfully matches uppercase stored reference");

  // 14. CONCURRENT DUPLICATE WEBHOOK HANDLING
  console.log("\n--- 14. Concurrent Duplicate Webhook Handling ---");
  const raceTxId = `TXRACE${Date.now()}`;
  const raceSms = `Payment received for GHS 80.00 from 0244998877. Transaction ID: ${raceTxId}.`;
  const raceResults = await Promise.all([
    processIncomingForwardedSms({ rawSms: raceSms, networkHint: "MTN" }),
    processIncomingForwardedSms({ rawSms: raceSms, networkHint: "MTN" }),
  ]);
  const hasAvailable = raceResults.some((r) => r.status === "AVAILABLE");
  const hasDuplicate = raceResults.some((r) => r.status === "DUPLICATE");
  assert(hasAvailable && hasDuplicate, "Concurrent duplicate webhooks handled: one AVAILABLE, one DUPLICATE (no 500 error)");

  // Clean up test users
  await prisma.user.deleteMany({
    where: { id: { in: [testUser.id, secondUser.id, suspendedUser.id, lowerRefUser.id] } },
  });

  console.log("\n==================================================");
  console.log(`SEND & CLAIM TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test runner encountered error:", err);
  process.exit(1);
});
