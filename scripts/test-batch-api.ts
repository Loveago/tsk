import { prisma } from "../src/lib/prisma";
import { generateApiKey, hashApiKey } from "../src/lib/api-keys";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";

// Import Route Handlers
import { POST as postOrdersHandler } from "../src/app/v1/orders/route";
import { POST as postBatchOrdersHandler } from "../src/app/v1/orders/batch/route";
import { GET as getOrderByIdHandler } from "../src/app/v1/orders/[id]/route";
import { GET as getOrderByRefHandler } from "../src/app/v1/orders/reference/[reference]/route";

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

function createRequest(
  method: string,
  url: string,
  headers: Record<string, string> = {},
  body?: any
): NextRequest {
  const init: any = {
    method,
    headers: new Headers({
      "Content-Type": "application/json",
      ...headers,
    }),
  };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  return new NextRequest(new URL(url, "https://api.tskconnect.com"), init);
}

async function run() {
  console.log("\n========================================================");
  console.log("   TSKCONNECT BATCH ORDER & CLICKYFIED INTEGRATION TEST");
  console.log("========================================================\n");

  const testEmail = `test_batch_${Date.now()}@tskconnect.com`;
  const passwordHash = await bcrypt.hash("Password123!", 10);

  // 1. Create Test User
  const user = await prisma.user.create({
    data: {
      email: testEmail,
      name: "Batch API Tester",
      passwordHash,
      role: "DEVELOPER",
      status: "ACTIVE",
      balance: 1000.0,
    },
  });

  // 2. Create Approved API Application
  await prisma.apiApplication.create({
    data: {
      userId: user.id,
      businessName: "Batch Tester Inc",
      websiteUrl: "https://batchtester.com",
      usageDescription: "Automated batch ordering test",
      expectedMonthlyVolume: "1000",
      contactEmail: testEmail,
      contactPhone: "0241234567",
      applicationType: "WEBSITE",
      status: "APPROVED",
      productionAccess: true,
    },
  });

  // 3. Create Live API Key
  const { key: liveKey, prefix: livePrefix } = generateApiKey("live");
  const hashedLiveKey = hashApiKey(liveKey);

  const cred = await prisma.apiCredential.create({
    data: {
      userId: user.id,
      name: "Batch Live Key",
      keyPrefix: livePrefix,
      keyHash: hashedLiveKey,
      environment: "PRODUCTION",
      scopes: "orders:create,orders:read,orders:status",
      status: "ACTIVE",
    },
  });

  const authHeader = { Authorization: `Bearer ${liveKey}` };

  // Setup sample package if not present
  let mtn1gb = await prisma.dataPackage.findFirst({
    where: { network: "MTN", gbAmount: 1, active: true },
  });
  if (!mtn1gb) {
    mtn1gb = await prisma.dataPackage.create({
      data: {
        network: "MTN",
        name: "MTN 1GB",
        gbAmount: 1,
        retailPriceGHS: 5.0,
        active: true,
      },
    });
  }

  let mtn2gb = await prisma.dataPackage.findFirst({
    where: { network: "MTN", gbAmount: 2, active: true },
  });
  if (!mtn2gb) {
    mtn2gb = await prisma.dataPackage.create({
      data: {
        network: "MTN",
        name: "MTN 2GB",
        gbAmount: 2,
        retailPriceGHS: 10.0,
        active: true,
      },
    });
  }

  // Setup a blocked number in BlockedMtnNumber
  const blockedPhone = "0240999888";
  await prisma.blockedMtnNumber.upsert({
    where: { normalizedNumber: blockedPhone },
    create: {
      number: blockedPhone,
      normalizedNumber: blockedPhone,
      status: "REJECTED",
    },
    update: {
      status: "REJECTED",
    },
  });

  try {
    // -------------------------------------------------------------
    // Test 1: Standard Batch Submission with valid recipients
    // -------------------------------------------------------------
    console.log("Test 1: Standard Batch Order Submission");
    const batchRef1 = `BATCH-TEST-1-${Date.now()}`;
    const req1 = createRequest("POST", "/v1/orders", {
      ...authHeader,
      "Idempotency-Key": batchRef1,
    }, {
      externalReference: batchRef1,
      network: "MTN",
      entries: [
        { number: "0535308871", allocationGB: 1 },
        { number: "0535308872", allocationGB: 2 },
      ],
    });

    const res1 = await postOrdersHandler(req1);
    const json1 = await res1.json();

    assert(res1.status === 201, "HTTP status 201 Created", `Got ${res1.status}`);
    assert(json1.success === true, "Response success: true");
    assert(!!json1.data.batchCode, `Batch code generated: ${json1.data?.batchCode}`);
    assert(json1.data.totalCount === 2, "totalCount is 2");
    assert(json1.data.entries?.length === 2, "entries length is 2");
    assert(json1.data.filteredOutEntries?.length === 0, "filteredOutEntries is empty");
    assert(!!json1.data.order, "order object wrapper present");
    assert(json1.data.status === "pending", "Initial batch status is pending");

    const batchCode1 = json1.data.batchCode;
    const publicOrderId1 = json1.data.orderId;

    // -------------------------------------------------------------
    // Test 2: Batch Submission with Blocked & Duplicate Numbers
    // -------------------------------------------------------------
    console.log("\nTest 2: Automatic Filter of Blocked & Intra-Batch Duplicate Numbers");
    const batchRef2 = `BATCH-TEST-2-${Date.now()}`;
    const req2 = createRequest("POST", "/v1/orders", {
      ...authHeader,
      "Idempotency-Key": batchRef2,
    }, {
      externalReference: batchRef2,
      network: "MTN",
      entries: [
        { number: "0535308873", allocationGB: 1 }, // valid
        { number: blockedPhone, allocationGB: 1 },  // blocked!
        { number: "0535308873", allocationGB: 2 }, // duplicate of first!
        { number: "not-a-valid-number", allocationGB: 1 }, // invalid!
      ],
    });

    const res2 = await postOrdersHandler(req2);
    const json2 = await res2.json();

    assert(res2.status === 201, "HTTP 201 Created when at least 1 valid entry remains");
    assert(json2.data.entries?.length === 1, `1 valid entry accepted (got ${json2.data?.entries?.length})`);
    assert(json2.data.entries[0]?.number === "0535308873", "Valid entry phone number matches");
    assert(json2.data.filteredOutEntries?.length === 3, `3 entries filtered out (got ${json2.data?.filteredOutEntries?.length})`);

    const blockedEntry = json2.data.filteredOutEntries.find((f: any) => f.number === blockedPhone);
    assert(!!blockedEntry, "Blocked entry found in filteredOutEntries");
    assert(blockedEntry?.type === "blocked", `Blocked entry marked with type: blocked (got ${blockedEntry?.type})`);

    const dupEntry = json2.data.filteredOutEntries.find((f: any) => f.type === "duplicate");
    assert(!!dupEntry, "Duplicate entry found in filteredOutEntries");

    const invalidEntry = json2.data.filteredOutEntries.find((f: any) => f.type === "invalid");
    assert(!!invalidEntry, "Invalid entry found in filteredOutEntries");

    // -------------------------------------------------------------
    // Test 3: Batch Submission where ALL entries are blocked/invalid
    // -------------------------------------------------------------
    console.log("\nTest 3: Batch submission where ALL entries are blocked/invalid -> 400 Bad Request");
    const batchRef3 = `BATCH-TEST-3-${Date.now()}`;
    const req3 = createRequest("POST", "/v1/orders", {
      ...authHeader,
      "Idempotency-Key": batchRef3,
    }, {
      externalReference: batchRef3,
      network: "MTN",
      entries: [
        { number: blockedPhone, allocationGB: 1 },
        { number: "0000000000", allocationGB: 1 },
      ],
    });

    const res3 = await postOrdersHandler(req3);
    const json3 = await res3.json();

    assert(res3.status === 400, `HTTP status 400 Bad Request (got ${res3.status})`);
    assert(json3.success === false, "success: false");
    assert(json3.code === "ALL_ENTRIES_FILTERED", `code is ALL_ENTRIES_FILTERED (got ${json3.code})`);
    assert(json3.filteredOutEntries?.length === 2, "filteredOutEntries returned with 2 items");

    // -------------------------------------------------------------
    // Test 4: Idempotent Replay (Reused: true)
    // -------------------------------------------------------------
    console.log("\nTest 4: Idempotent Replay returns 200 with reused: true");
    const req4 = createRequest("POST", "/v1/orders", {
      ...authHeader,
      "Idempotency-Key": batchRef1,
    }, {
      externalReference: batchRef1,
      network: "MTN",
      entries: [
        { number: "0535308871", allocationGB: 1 },
        { number: "0535308872", allocationGB: 2 },
      ],
    });

    const res4 = await postOrdersHandler(req4);
    const json4 = await res4.json();

    assert(res4.status === 200, `Replay returns HTTP 200 OK (got ${res4.status})`);
    assert(json4.data.reused === true, "data.reused is true");
    assert(json4.data.batchCode === batchCode1, "Replayed batchCode matches original");
    assert(json4.data.entries?.length === 2, "Replayed entries preserved");

    // -------------------------------------------------------------
    // Test 5: Status Query by Batch ID and Batch Code
    // -------------------------------------------------------------
    console.log("\nTest 5: Status Query via GET /v1/orders/[id]");
    // By public order ID (e.g. API-CF-BATCH-...)
    const req5a = createRequest("GET", `/v1/orders/${publicOrderId1}`, authHeader);
    const res5a = await getOrderByIdHandler(req5a, { params: Promise.resolve({ id: publicOrderId1 }) });
    const json5a = await res5a.json();

    assert(res5a.status === 200, `Query by publicOrderId returns 200 (got ${res5a.status})`);
    assert(json5a.data?.batchCode === batchCode1, "Returned correct batch");
    assert(json5a.data?.entries?.length === 2, "Batch entries array populated");

    // By batchCode directly (e.g. CF-BATCH-...)
    const req5b = createRequest("GET", `/v1/orders/${batchCode1}`, authHeader);
    const res5b = await getOrderByIdHandler(req5b, { params: Promise.resolve({ id: batchCode1 }) });
    const json5b = await res5b.json();

    assert(res5b.status === 200, `Query by batchCode directly returns 200 (got ${res5b.status})`);
    assert(json5b.data?.batchCode === batchCode1, "Returned correct batch");

    // -------------------------------------------------------------
    // Test 6: Status Query by External Reference
    // -------------------------------------------------------------
    console.log("\nTest 6: Status Query via GET /v1/orders/reference/[reference]");
    const req6 = createRequest("GET", `/v1/orders/reference/${batchRef1}`, authHeader);
    const res6 = await getOrderByRefHandler(req6, { params: Promise.resolve({ reference: batchRef1 }) });
    const json6 = await res6.json();

    assert(res6.status === 200, `Query by externalReference returns 200 (got ${res6.status})`);
    assert(json6.data?.batchCode === batchCode1, "Returned correct batch");
    assert(json6.data?.entries?.length === 2, "Entries array populated");

    // -------------------------------------------------------------
    // Test 7: Dedicated /v1/orders/batch endpoint
    // -------------------------------------------------------------
    console.log("\nTest 7: Dedicated /v1/orders/batch Endpoint");
    const batchRef7 = `BATCH-DEDICATED-${Date.now()}`;
    const req7 = createRequest("POST", "/v1/orders/batch", {
      ...authHeader,
      "Idempotency-Key": batchRef7,
    }, {
      externalReference: batchRef7,
      network: "MTN",
      entries: [
        { number: "0535308874", allocationGB: 1 },
      ],
    });

    const res7 = await postBatchOrdersHandler(req7);
    const json7 = await res7.json();

    assert(res7.status === 201, `Dedicated endpoint returns 201 Created (got ${res7.status})`);
    assert(json7.data?.entries?.length === 1, "Batch created with 1 entry");

    // -------------------------------------------------------------
    // Test 8: Backwards Compatibility: Single Order Submission
    // -------------------------------------------------------------
    console.log("\nTest 8: Backwards Compatibility for Single Order Submissions");
    const singleRef = `SINGLE-TEST-${Date.now()}`;
    const req8 = createRequest("POST", "/v1/orders", {
      ...authHeader,
      "Idempotency-Key": singleRef,
    }, {
      network: "MTN",
      packageId: mtn1gb.id,
      recipient: "0535308875",
      reference: singleRef,
    });

    const res8 = await postOrdersHandler(req8);
    const json8 = await res8.json();

    assert(res8.status === 201, `Single order returns 201 Created (got ${res8.status})`);
    assert(json8.data?.recipient === "0535308875", "Single order recipient preserved");
    assert(!json8.data?.entries, "Single order does NOT have entries array (original format intact)");

    // Query single order by ID
    const singleOrderId = json8.data.orderId;
    const req8b = createRequest("GET", `/v1/orders/${singleOrderId}`, authHeader);
    const res8b = await getOrderByIdHandler(req8b, { params: Promise.resolve({ id: singleOrderId }) });
    const json8b = await res8b.json();

    assert(res8b.status === 200, `Single order lookup returns 200 (got ${res8b.status})`);
    assert(json8b.data.recipient === "0535308875", "Single order lookup recipient matches");

  } finally {
    // Cleanup
    await prisma.blockedMtnNumber.deleteMany({
      where: { normalizedNumber: blockedPhone },
    }).catch(() => undefined);

    await prisma.apiApplication.deleteMany({
      where: { userId: user.id },
    }).catch(() => undefined);

    await prisma.apiCredential.deleteMany({
      where: { userId: user.id },
    }).catch(() => undefined);

    await prisma.orderStatusHistory.deleteMany({
      where: { order: { userId: user.id } },
    }).catch(() => undefined);

    await prisma.walletTransaction.deleteMany({
      where: { userId: user.id },
    }).catch(() => undefined);

    await prisma.order.deleteMany({
      where: { userId: user.id },
    }).catch(() => undefined);

    await prisma.orderBatch.deleteMany({
      where: { userId: user.id },
    }).catch(() => undefined);

    await prisma.idempotencyKey.deleteMany({
      where: { userId: user.id },
    }).catch(() => undefined);

    await prisma.user.delete({
      where: { id: user.id },
    }).catch(() => undefined);
  }

  console.log("\n========================================================");
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("========================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
