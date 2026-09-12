/**
 * Test Suite for Feature 2 — Sign-up Codes
 * Run with: npx tsx scripts/test-signup-codes.ts
 */
import { prisma } from "../src/lib/prisma";
import {
  getSignupCodeMode,
  setSignupCodeMode,
  normalizeSignupCode,
  validateSignupCode,
  applySignupCodeInTx,
  bulkGenerateSignupCodes,
} from "../src/lib/signup-codes";

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
  console.log("SIGN-UP CODES TEST SUITE");
  console.log("==================================================\n");

  // 1. CONFIGURABLE MODES
  console.log("--- 1. Admin Configurable Modes ---");
  await setSignupCodeMode("DISABLED");
  let mode = await getSignupCodeMode();
  assert(mode === "DISABLED", "Mode set to DISABLED");

  await setSignupCodeMode("REQUIRED");
  mode = await getSignupCodeMode();
  assert(mode === "REQUIRED", "Mode set to REQUIRED");

  await setSignupCodeMode("OPTIONAL");
  mode = await getSignupCodeMode();
  assert(mode === "OPTIONAL", "Mode set to OPTIONAL");

  // 2. CASE INSENSITIVITY & NORMALIZATION
  console.log("\n--- 2. Case Normalization ---");
  assert(
    normalizeSignupCode("welcome2026") === "WELCOME2026",
    "Lowercase normalized to uppercase"
  );
  assert(
    normalizeSignupCode("  Click-99x  ") === "CLICK-99X",
    "Trim and uppercase normalization"
  );

  // 3. CODE CREATION & VALIDATION
  console.log("\n--- 3. Code Creation & Validation ---");
  const testCodeStr = `TEST_${Date.now()}`;
  const codeRecord = await prisma.signupCode.create({
    data: {
      code: testCodeStr,
      status: "ACTIVE",
      maxUses: 2,
      notes: "Test code for suite",
      createdBy: "admin@clickyfied.com",
    },
  });

  // Test valid code check (both uppercase and lowercase)
  const validCheck1 = await validateSignupCode(testCodeStr);
  assert(validCheck1.valid, "Valid code passes validation");

  const validCheckLower = await validateSignupCode(testCodeStr.toLowerCase());
  assert(validCheckLower.valid, "Case-insensitive lookup passes validation");

  // Test invalid code check
  const invalidCheck = await validateSignupCode("NON_EXISTENT_CODE_123");
  assert(!invalidCheck.valid, "Non-existent code fails validation");

  // 4. ATOMIC USAGE & LIMIT ENFORCEMENT
  console.log("\n--- 4. Usage Counting & Limits ---");
  const user1 = await prisma.user.create({
    data: {
      name: "User One",
      email: `u1_${Date.now()}@example.com`,
      passwordHash: "hash",
      role: "USER",
    },
  });

  // Use code for user 1
  await prisma.$transaction(async (tx) => {
    await applySignupCodeInTx(tx, {
      rawCode: testCodeStr,
      userId: user1.id,
      ip: "127.0.0.1",
    });
  });

  const ref1 = await prisma.signupCode.findUnique({ where: { id: codeRecord.id } });
  assert(ref1?.usageCount === 1, "Usage count incremented to 1");

  const usageRecord1 = await prisma.signupCodeUsage.findUnique({
    where: { userId: user1.id },
  });
  assert(
    usageRecord1 !== null && usageRecord1.signupCodeId === codeRecord.id,
    "SignupCodeUsage record created linking user and code"
  );

  // Use code for user 2 (hits max limit 2)
  const user2 = await prisma.user.create({
    data: {
      name: "User Two",
      email: `u2_${Date.now()}@example.com`,
      passwordHash: "hash",
      role: "USER",
    },
  });

  await prisma.$transaction(async (tx) => {
    await applySignupCodeInTx(tx, {
      rawCode: testCodeStr.toLowerCase(),
      userId: user2.id,
      ip: "127.0.0.1",
    });
  });

  const ref2 = await prisma.signupCode.findUnique({ where: { id: codeRecord.id } });
  assert(
    ref2?.usageCount === 2 && ref2?.status === "EXHAUSTED",
    "Usage reaches max limit (2) and transitions status to EXHAUSTED"
  );

  // Attempt user 3 with exhausted code
  const user3 = await prisma.user.create({
    data: {
      name: "User Three",
      email: `u3_${Date.now()}@example.com`,
      passwordHash: "hash",
      role: "USER",
    },
  });

  let failedExhausted = false;
  try {
    await prisma.$transaction(async (tx) => {
      await applySignupCodeInTx(tx, {
        rawCode: testCodeStr,
        userId: user3.id,
      });
    });
  } catch {
    failedExhausted = true;
  }
  assert(failedExhausted, "Exhausted code cannot be used by new registration");

  // 5. EXPIRATION
  console.log("\n--- 5. Code Expiration ---");
  const expCodeStr = `EXP_${Date.now()}`;
  await prisma.signupCode.create({
    data: {
      code: expCodeStr,
      status: "ACTIVE",
      expiresAt: new Date(Date.now() - 10000), // Already expired 10s ago
    },
  });

  const expCheck = await validateSignupCode(expCodeStr);
  assert(!expCheck.valid, "Expired code fails validation");

  let failedExpUse = false;
  try {
    await prisma.$transaction(async (tx) => {
      await applySignupCodeInTx(tx, {
        rawCode: expCodeStr,
        userId: user3.id,
      });
    });
  } catch {
    failedExpUse = true;
  }
  assert(failedExpUse, "Expired code is rejected during registration");

  // 6. CONCURRENT SIGNUP WITH SINGLE-USE CODE
  console.log("\n--- 6. Concurrent Registration Race Condition ---");
  const singleUseCodeStr = `SINGLE_${Date.now()}`;
  await prisma.signupCode.create({
    data: {
      code: singleUseCodeStr,
      status: "ACTIVE",
      maxUses: 1, // Only 1 use allowed!
    },
  });

  const userA = await prisma.user.create({
    data: { name: "User A", email: `ua_${Date.now()}@example.com`, passwordHash: "h", role: "USER" },
  });
  const userB = await prisma.user.create({
    data: { name: "User B", email: `ub_${Date.now()}@example.com`, passwordHash: "h", role: "USER" },
  });

  // Run simultaneous registrations using the single-use code
  const concurrentResults = await Promise.allSettled([
    prisma.$transaction(async (tx) => {
      return applySignupCodeInTx(tx, { rawCode: singleUseCodeStr, userId: userA.id });
    }),
    prisma.$transaction(async (tx) => {
      return applySignupCodeInTx(tx, { rawCode: singleUseCodeStr, userId: userB.id });
    }),
  ]);

  const concFulfilled = concurrentResults.filter((r) => r.status === "fulfilled");
  const concRejected = concurrentResults.filter((r) => r.status === "rejected");

  assert(
    concFulfilled.length === 1 && concRejected.length === 1,
    "Exactly 1 user successfully claims the single-use code under concurrent requests"
  );

  // 7. BULK GENERATION
  console.log("\n--- 7. Bulk Code Generation ---");
  const bulkCodes = await bulkGenerateSignupCodes({
    quantity: 25,
    prefix: "TESTBULK",
    length: 8,
    maxUses: 1,
    notes: "Batch generation test",
  });

  assert(bulkCodes.length === 25, "Generated requested quantity of 25 codes");
  const uniqueCount = new Set(bulkCodes).size;
  assert(uniqueCount === 25, "All 25 generated codes are completely unique");
  assert(bulkCodes.every((c) => c.startsWith("TESTBULK-")), "All codes follow prefix convention");

  // 8. CODE REVOCATION & DISABLING
  console.log("\n--- 8. Admin Revocation & Disabling ---");
  const codeToDisable = bulkCodes[0];
  await prisma.signupCode.update({
    where: { code: codeToDisable },
    data: { status: "DISABLED" },
  });

  const disabledCheck = await validateSignupCode(codeToDisable);
  assert(!disabledCheck.valid, "Disabled code fails validation");

  await prisma.signupCode.delete({
    where: { code: codeToDisable },
  });
  const deletedCheck = await validateSignupCode(codeToDisable);
  assert(!deletedCheck.valid, "Deleted code cannot be used");

  // Cleanup test records
  await prisma.user.deleteMany({
    where: { id: { in: [user1.id, user2.id, user3.id, userA.id, userB.id] } },
  });
  await prisma.signupCode.deleteMany({
    where: {
      OR: [
        { code: testCodeStr },
        { code: expCodeStr },
        { code: singleUseCodeStr },
        { code: { startsWith: "TESTBULK-" } },
      ],
    },
  });

  console.log("\n==================================================");
  console.log(`SIGN-UP CODES TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test runner encountered error:", err);
  process.exit(1);
});

