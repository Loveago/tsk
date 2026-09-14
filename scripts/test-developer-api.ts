import { prisma } from "../src/lib/prisma";
import { generateApiKey, hashApiKey } from "../src/lib/api-keys";
import {
  computeWebhookSignature,
  verifyWebhookSignature,
  getRetryDelayMs,
  processDueWebhookRetries,
} from "../src/lib/webhooks";
import { rateLimit } from "../src/lib/rate-limit";
import { isOrderProcessingHalted, setSetting, changeOrderStatus } from "../src/lib/orders";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";

// Import actual Route Handlers
import { GET as getNetworksHandler } from "../src/app/v1/networks/route";
import { GET as getNetworksStatusHandler } from "../src/app/v1/networks/status/route";
import { GET as getPackagesHandler } from "../src/app/v1/packages/route";
import { GET as getOrdersHandler, POST as postOrdersHandler } from "../src/app/v1/orders/route";
import { GET as getOrderByIdHandler } from "../src/app/v1/orders/[id]/route";
import { GET as getOrderByRefHandler } from "../src/app/v1/orders/reference/[reference]/route";
import { POST as postBulkStatusHandler } from "../src/app/v1/orders/status/route";
import { GET as getBalanceHandler } from "../src/app/v1/balance/route";
import { GET as getWebhooksHandler, POST as postWebhooksHandler } from "../src/app/v1/webhooks/route";
import { POST as postWebhooksTestHandler } from "../src/app/v1/webhooks/test/route";
import { GET as getStatusHandler } from "../src/app/v1/status/route";
import { GET as getRequestIdHandler } from "../src/app/v1/request-id/route";
import { GET as getWebhookCronHandler } from "../src/app/api/cron/webhooks/route";

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

async function parseResponse(res: Response) {
  const status = res.status;
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  const requestId = res.headers.get("x-request-id");
  return { status, json, requestId, headers: res.headers };
}

async function runApiTests() {
  console.log("\n==================================================");
  console.log("TSKCONNECT DEVELOPER API PLATFORM E2E SUITE");
  console.log("==================================================\n");

  // 1. Webhook Signatures & Retries
  console.log("[1] Webhook Security & Signatures");
  const secret = "whsec_test_secret_123456789";
  const payload = JSON.stringify({ event: "order.completed", orderId: "CLK-100" });
  const ts = Math.floor(Date.now() / 1000);
  const signature = computeWebhookSignature(payload, secret, ts);
  assert(typeof signature === "string" && signature.length === 64, "HMAC SHA-256 signature generated");

  const valid = verifyWebhookSignature(payload, secret, `sha256=${signature}`, ts);
  assert(valid, "Signature verification succeeds with valid secret and timestamp");

  const invalidSecret = verifyWebhookSignature(payload, "wrong_secret", signature, ts);
  assert(!invalidSecret, "Tampered secret fails signature verification");

  const tamperedPayload = verifyWebhookSignature(payload + "tampered", secret, signature, ts);
  assert(!tamperedPayload, "Tampered payload fails signature verification");

  assert(getRetryDelayMs(1) === 60000, "Exponential backoff attempt 1 is 1 minute");
  assert(getRetryDelayMs(2) === 300000, "Exponential backoff attempt 2 is 5 minutes");
  assert(getRetryDelayMs(3) === 1800000, "Exponential backoff attempt 3 is 30 minutes");

  const retryRes = await processDueWebhookRetries(10);
  assert(typeof retryRes.processed === "number", "processDueWebhookRetries runs safely");

  // 2. Rate Limiting Engine
  console.log("\n[2] Rate Limiting");
  const rlKey = `test_rate_limit_${Date.now()}`;
  const r1 = rateLimit(rlKey, 3, 60000);
  const r2 = rateLimit(rlKey, 3, 60000);
  const r3 = rateLimit(rlKey, 3, 60000);
  const r4 = rateLimit(rlKey, 3, 60000);

  assert(r1.allowed && r1.remaining === 2, "1st request within limit allowed");
  assert(r2.allowed && r2.remaining === 1, "2nd request within limit allowed");
  assert(r3.allowed && r3.remaining === 0, "3rd request reaches limit");
  assert(!r4.allowed && r4.remaining === 0, "4th request rate-limited (HTTP 429 condition)");

  // 3. Setup Test Database Records
  console.log("\n[3] Setup Test Users & Profiles");
  const pwHash = await bcrypt.hash("testpass123", 4);
  const userA = await prisma.user.upsert({
    where: { email: "api_dev_user_a@test.com" },
    create: {
      name: "API Developer A",
      email: "api_dev_user_a@test.com",
      passwordHash: pwHash,
      role: "USER",
      balance: 100.0,
      status: "ACTIVE",
    },
    update: { balance: 100.0, status: "ACTIVE" },
  });

  const userB = await prisma.user.upsert({
    where: { email: "api_dev_user_b@test.com" },
    create: {
      name: "API Developer B",
      email: "api_dev_user_b@test.com",
      passwordHash: pwHash,
      role: "USER",
      balance: 50.0,
      status: "ACTIVE",
    },
    update: { balance: 50.0, status: "ACTIVE" },
  });

  assert(userA.id !== userB.id, "Distinct test users created");
  await setSetting("order_processing_halted", "false");
  await setSetting("mtn_number_verification_enabled", "false");

  // Setup Approved Application for User A
  const appA = await prisma.apiApplication.upsert({
    where: { userId: userA.id },
    create: {
      userId: userA.id,
      businessName: "Dev A Stores Ltd",
      websiteUrl: "https://deva.com",
      usageDescription: "Reselling bundles",
      expectedMonthlyVolume: "500-2000",
      contactEmail: "dev_a@test.com",
      contactPhone: "0241112233",
      applicationType: "WEBSITE",
      status: "APPROVED",
      productionAccess: true,
      sandboxAccess: true,
      rateLimitPerMin: 60,
      allowedScopes: "networks:read,packages:read,orders:create,orders:read,orders:status,balance:read,webhooks:read,webhooks:manage",
    },
    update: {
      status: "APPROVED",
      productionAccess: true,
      sandboxAccess: true,
    },
  });
  assert(appA.status === "APPROVED", "User A application is APPROVED");

  // User B has NO approved application
  await prisma.apiApplication.deleteMany({ where: { userId: userB.id } });

  // Generate Credentials for User A (Live & Sandbox)
  const liveKeyGenA = generateApiKey("live", "ck");
  const credLiveA = await prisma.apiCredential.create({
    data: {
      userId: userA.id,
      name: "Production Web Store",
      environment: "PRODUCTION",
      keyPrefix: liveKeyGenA.prefix,
      keyHash: liveKeyGenA.keyHash,
      status: "ACTIVE",
      scopes: appA.allowedScopes,
      rateLimitPerMin: appA.rateLimitPerMin,
    },
  });

  const testKeyGenA = generateApiKey("test", "ck");
  const credTestA = await prisma.apiCredential.create({
    data: {
      userId: userA.id,
      name: "Sandbox Testing Key",
      environment: "SANDBOX",
      keyPrefix: testKeyGenA.prefix,
      keyHash: testKeyGenA.keyHash,
      status: "ACTIVE",
      scopes: appA.allowedScopes,
      rateLimitPerMin: appA.rateLimitPerMin,
    },
  });

  // Generate Credential for User B (Unapproved application)
  const liveKeyGenB = generateApiKey("live", "ck");
  await prisma.apiCredential.create({
    data: {
      userId: userB.id,
      name: "User B Key",
      environment: "PRODUCTION",
      keyPrefix: liveKeyGenB.prefix,
      keyHash: liveKeyGenB.keyHash,
      status: "ACTIVE",
      scopes: "orders:create,orders:read",
    },
  });

  const mtnPackage = await prisma.dataPackage.findFirst({
    where: { network: "MTN", active: true },
  });
  assert(!!mtnPackage, `Found active master package: ${mtnPackage?.name} (${mtnPackage?.gbAmount}GB)`);

  // 4. Test Public & Discovery Endpoints
  console.log("\n[4] Discovery Endpoints (GET /v1/request-id, /v1/status)");
  const reqIdRes = await parseResponse(await getRequestIdHandler(createRequest("GET", "/v1/request-id")));
  assert(reqIdRes.status === 200, "GET /v1/request-id returns 200");
  assert(reqIdRes.json?.requestId?.startsWith("req_"), "Returns generated requestId");

  const statusRes = await parseResponse(await getStatusHandler(createRequest("GET", "/v1/status")));
  assert(statusRes.status === 200, "GET /v1/status returns 200");
  assert(statusRes.json?.data?.status === "OPERATIONAL", "Status reports OPERATIONAL");

  // 5. Test Authentication & Authorization via Route Handlers
  console.log("\n[5] Authentication & Security Boundary Testing");
  // Missing auth header
  const unauthRes = await parseResponse(await postOrdersHandler(createRequest("POST", "/v1/orders", {}, {})));
  assert(unauthRes.status === 401, "Missing auth header returns 401");
  assert(unauthRes.json?.error?.code === "UNAUTHORIZED", "Error code is UNAUTHORIZED");

  // Unapproved user (User B) attempting to use production key
  const unapprovedRes = await parseResponse(
    await postOrdersHandler(
      createRequest("POST", "/v1/orders", { Authorization: `Bearer ${liveKeyGenB.key}` }, {
        network: "MTN",
        packageId: mtnPackage!.id,
        recipient: "0241234567",
      })
    )
  );
  assert(unapprovedRes.status === 403, "Unapproved application cannot create orders (returns 403)");
  assert(unapprovedRes.json?.error?.code === "FORBIDDEN", "Error code is FORBIDDEN");

  // 6. Test Networks & Packages API
  console.log("\n[6] Networks & Packages Route Handlers");
  const networksRes = await parseResponse(
    await getNetworksHandler(createRequest("GET", "/v1/networks", { Authorization: `Bearer ${liveKeyGenA.key}` }))
  );
  assert(networksRes.status === 200, "GET /v1/networks returns 200");
  assert(Array.isArray(networksRes.json?.data) && networksRes.json.data.length >= 3, "Returns supported networks");

  const netStatusRes = await parseResponse(
    await getNetworksStatusHandler(createRequest("GET", "/v1/networks/status", { Authorization: `Bearer ${liveKeyGenA.key}` }))
  );
  assert(netStatusRes.status === 200, "GET /v1/networks/status returns 200");
  assert(netStatusRes.json?.data[0]?.ordersEnabled !== undefined, "Returns ordersEnabled per network");

  const packagesRes = await parseResponse(
    await getPackagesHandler(createRequest("GET", "/v1/packages?network=MTN", { Authorization: `Bearer ${liveKeyGenA.key}` }))
  );
  assert(packagesRes.status === 200, "GET /v1/packages returns 200");
  assert(packagesRes.json?.data?.length > 0, "Returns MTN data packages");
  assert(typeof packagesRes.json?.data[0]?.price === "number", "Package has numeric resolved price");

  // 7. Balance API
  console.log("\n[7] Balance Endpoint");
  const balanceLive = await parseResponse(
    await getBalanceHandler(createRequest("GET", "/v1/balance", { Authorization: `Bearer ${liveKeyGenA.key}` }))
  );
  assert(balanceLive.status === 200 && balanceLive.json?.data?.balance === 100, "Live balance matches wallet balance (100.00)");

  const balanceTest = await parseResponse(
    await getBalanceHandler(createRequest("GET", "/v1/balance", { Authorization: `Bearer ${testKeyGenA.key}` }))
  );
  assert(balanceTest.status === 200 && balanceTest.json?.data?.balance === 1000, "Sandbox balance returns 1000.00 virtual credit");

  // 8. Order Creation Validation via Route Handlers
  console.log("\n[8] Input Validation on POST /v1/orders");
  // Invalid recipient
  const badPhoneRes = await parseResponse(
    await postOrdersHandler(
      createRequest("POST", "/v1/orders", { Authorization: `Bearer ${liveKeyGenA.key}` }, {
        network: "MTN",
        packageId: mtnPackage!.id,
        recipient: "12345",
      })
    )
  );
  assert(badPhoneRes.status === 400 && badPhoneRes.json?.error?.code === "INVALID_RECIPIENT", "Invalid recipient phone returns 400 INVALID_RECIPIENT");

  // Invalid network
  const badNetRes = await parseResponse(
    await postOrdersHandler(
      createRequest("POST", "/v1/orders", { Authorization: `Bearer ${liveKeyGenA.key}` }, {
        network: "INVALID_NET",
        packageId: mtnPackage!.id,
        recipient: "0241234567",
      })
    )
  );
  assert(badNetRes.status === 400 && badNetRes.json?.error?.code === "INVALID_NETWORK", "Invalid network returns 400 INVALID_NETWORK");

  // Invalid package
  const badPkgRes = await parseResponse(
    await postOrdersHandler(
      createRequest("POST", "/v1/orders", { Authorization: `Bearer ${liveKeyGenA.key}` }, {
        network: "MTN",
        packageId: "non_existent_pkg_id",
        recipient: "0241234567",
      })
    )
  );
  assert(badPkgRes.status === 400 && badPkgRes.json?.error?.code === "INVALID_PACKAGE", "Invalid package returns 400 INVALID_PACKAGE");

  // 9. Successful Order Creation & Atomic Wallet Deduction
  console.log("\n[9] Order Creation & Atomic Wallet Deduction");
  const testRefA = `ORD-LIVE-${Date.now()}`;
  const testIdemKeyA = `IDEM-KEY-${Date.now()}`;
  const initialBalance = (await prisma.user.findUnique({ where: { id: userA.id } }))?.balance ?? 0;

  const createOrderRes = await parseResponse(
    await postOrdersHandler(
      createRequest(
        "POST",
        "/v1/orders",
        {
          Authorization: `Bearer ${liveKeyGenA.key}`,
          "Idempotency-Key": testIdemKeyA,
        },
        {
          network: "MTN",
          packageId: mtnPackage!.id,
          recipient: "0241234567",
          reference: testRefA,
        }
      )
    )
  );

  assert(createOrderRes.status === 201, "POST /v1/orders returns 201 Created");
  assert(createOrderRes.json?.data?.status === "PENDING", "Order initially created with status PENDING for export processing");
  assert(createOrderRes.json?.data?.reference === testRefA, "External reference saved");

  const numericOrderIdA = parseInt(createOrderRes.json?.data?.orderId.replace("CLK-", ""), 10);
  const orderIdsToClean: number[] = [numericOrderIdA];
  const afterBalance = (await prisma.user.findUnique({ where: { id: userA.id } }))?.balance ?? 0;
  assert(afterBalance < initialBalance, "User wallet atomically debited on order creation");

  // 10. Idempotency Replays
  console.log("\n[10] Idempotency Handling (Idempotency-Key & Reference)");
  // Retry with same Idempotency-Key
  const replayIdemRes = await parseResponse(
    await postOrdersHandler(
      createRequest(
        "POST",
        "/v1/orders",
        {
          Authorization: `Bearer ${liveKeyGenA.key}`,
          "Idempotency-Key": testIdemKeyA,
        },
        {
          network: "MTN",
          packageId: mtnPackage!.id,
          recipient: "0241234567",
          reference: testRefA,
        }
      )
    )
  );
  assert(replayIdemRes.status === 200, "Replayed request with same Idempotency-Key returns 200 OK");
  assert(replayIdemRes.json?.data?.replayed === true, "Response marked as replayed");
  assert(replayIdemRes.json?.data?.orderId === createOrderRes.json?.data?.orderId, "Same order returned");

  const balanceAfterReplay = (await prisma.user.findUnique({ where: { id: userA.id } }))?.balance ?? 0;
  assert(balanceAfterReplay === afterBalance, "No duplicate wallet debit on idempotency replay");

  // Retry with same reference without Idempotency-Key header
  const replayRefRes = await parseResponse(
    await postOrdersHandler(
      createRequest(
        "POST",
        "/v1/orders",
        { Authorization: `Bearer ${liveKeyGenA.key}` },
        {
          network: "MTN",
          packageId: mtnPackage!.id,
          recipient: "0241234567",
          reference: testRefA,
        }
      )
    )
  );
  assert(replayRefRes.status === 200, "Replayed request by reference returns existing order (200 OK)");
  assert(replayRefRes.json?.data?.replayed === true, "Response marked as replayed by reference");

  // Idempotency cleanup on validation failure
  const badIdemKey = `IDEM-FAIL-TEST-${Date.now()}`;
  const failedIdemRes = await parseResponse(
    await postOrdersHandler(
      createRequest(
        "POST",
        "/v1/orders",
        {
          Authorization: `Bearer ${liveKeyGenA.key}`,
          "Idempotency-Key": badIdemKey,
        },
        {
          network: "MTN",
          packageId: mtnPackage!.id,
          recipient: "invalid-phone",
        }
      )
    )
  );
  assert(failedIdemRes.status === 400, "Invalid recipient returns 400 validation error");

  // Re-attempting with the same Idempotency-Key and valid parameters must NOT be blocked by a stuck PROCESSING key
  const recoveredIdemRes = await parseResponse(
    await postOrdersHandler(
      createRequest(
        "POST",
        "/v1/orders",
        {
          Authorization: `Bearer ${liveKeyGenA.key}`,
          "Idempotency-Key": badIdemKey,
        },
        {
          network: "MTN",
          packageId: mtnPackage!.id,
          recipient: "0241234567",
          reference: `RECOVERED-${Date.now()}`,
        }
      )
    )
  );
  assert(recoveredIdemRes.status === 201, "Re-trying with same Idempotency-Key after validation failure succeeds (no 409 deadlock)");
  if (recoveredIdemRes.json?.data?.orderId) {
    orderIdsToClean.push(parseInt(recoveredIdemRes.json.data.orderId.replace("CLK-", ""), 10));
  }

  // 11. Cross-Account Idempotency Isolation
  console.log("\n[11] Cross-Account Idempotency Isolation");
  // Temporarily approve User B to test that User B can use the SAME idempotency key without colliding with User A
  await prisma.apiApplication.upsert({
    where: { userId: userB.id },
    create: {
      userId: userB.id,
      businessName: "Dev B Ltd",
      websiteUrl: "https://devb.com",
      usageDescription: "Testing",
      expectedMonthlyVolume: "100",
      contactEmail: "dev_b@test.com",
      contactPhone: "0242223344",
      applicationType: "WEBSITE",
      status: "APPROVED",
      productionAccess: true,
      sandboxAccess: true,
      allowedScopes: "orders:create,orders:read,orders:status",
    },
    update: { status: "APPROVED", productionAccess: true },
  });

  const crossIdemRes = await parseResponse(
    await postOrdersHandler(
      createRequest(
        "POST",
        "/v1/orders",
        {
          Authorization: `Bearer ${liveKeyGenB.key}`,
          "Idempotency-Key": testIdemKeyA, // User B passes the EXACT SAME Idempotency-Key as User A!
        },
        {
          network: "MTN",
          packageId: mtnPackage!.id,
          recipient: "0242223344",
          reference: "USER-B-REF-1",
        }
      )
    )
  );
  assert(crossIdemRes.status === 201, "User B with identical Idempotency-Key succeeds independently (no 403 collision)");
  assert(crossIdemRes.json?.data?.orderId !== createOrderRes.json?.data?.orderId, "Creates distinct order for User B");
  if (crossIdemRes.json?.data?.orderId) {
    orderIdsToClean.push(parseInt(crossIdemRes.json.data.orderId.replace("CLK-", ""), 10));
  }

  // 12. Order Retrieval and Data Isolation
  console.log("\n[12] Order Retrieval & Cross-Account Isolation");
  // User A gets own order by ID
  const getOwnOrderRes = await parseResponse(
    await getOrderByIdHandler(
      createRequest("GET", `/v1/orders/${numericOrderIdA}`, { Authorization: `Bearer ${liveKeyGenA.key}` }),
      { params: Promise.resolve({ id: String(numericOrderIdA) }) }
    )
  );
  assert(getOwnOrderRes.status === 200, "User A can retrieve own order by ID");
  assert(getOwnOrderRes.json?.data?.orderId === `CLK-${numericOrderIdA}`, "Correct order ID returned");

  // User B tries to get User A's order by ID -> 404
  const getForeignOrderRes = await parseResponse(
    await getOrderByIdHandler(
      createRequest("GET", `/v1/orders/${numericOrderIdA}`, { Authorization: `Bearer ${liveKeyGenB.key}` }),
      { params: Promise.resolve({ id: String(numericOrderIdA) }) }
    )
  );
  assert(getForeignOrderRes.status === 404, "User B CANNOT access User A's order (returns 404 ORDER_NOT_FOUND)");

  // User A gets own order by reference
  const getOwnRefRes = await parseResponse(
    await getOrderByRefHandler(
      createRequest("GET", `/v1/orders/reference/${testRefA}`, { Authorization: `Bearer ${liveKeyGenA.key}` }),
      { params: Promise.resolve({ reference: testRefA }) }
    )
  );
  assert(getOwnRefRes.status === 200, "User A can retrieve own order by reference");

  // User B tries to get User A's order by reference -> 404
  const getForeignRefRes = await parseResponse(
    await getOrderByRefHandler(
      createRequest("GET", `/v1/orders/reference/${testRefA}`, { Authorization: `Bearer ${liveKeyGenB.key}` }),
      { params: Promise.resolve({ reference: testRefA }) }
    )
  );
  assert(getForeignRefRes.status === 404, "User B CANNOT access User A's order by reference (returns 404)");

  // 12b. Delivery Reports integration with adminResponse & adminNote
  console.log("\n[12b] Delivery Reports adminResponse & adminNote query");
  const reportSeq = Math.floor(Math.random() * 1000000) + 10000;
  await prisma.deliveryReport.create({
    data: {
      seq: reportSeq,
      orderId: numericOrderIdA,
      userId: userA.id,
      reason: "Not received yet",
      adminResponse: "Checked with carrier, delivery confirmed.",
      adminNote: "Internal admin note: confirmed by MTN backend.",
      status: "RESOLVED",
    },
  });

  const orderWithReportRes = await parseResponse(
    await getOrderByIdHandler(
      createRequest("GET", `/v1/orders/${numericOrderIdA}`, { Authorization: `Bearer ${liveKeyGenA.key}` }),
      { params: Promise.resolve({ id: String(numericOrderIdA) }) }
    )
  );
  assert(orderWithReportRes.status === 200, "Order with delivery report fetched without schema mismatch error");
  assert(
    orderWithReportRes.json?.data?.deliveryReport?.adminResponse === "Checked with carrier, delivery confirmed.",
    "deliveryReport contains adminResponse"
  );
  assert(
    orderWithReportRes.json?.data?.deliveryReport?.adminNote === "Internal admin note: confirmed by MTN backend.",
    "deliveryReport contains adminNote"
  );

  // 13. Bulk Status API
  console.log("\n[13] Bulk Status Endpoint (POST /v1/orders/status)");
  const bulkRes = await parseResponse(
    await postBulkStatusHandler(
      createRequest(
        "POST",
        "/v1/orders/status",
        { Authorization: `Bearer ${liveKeyGenA.key}` },
        { orderIds: [`CLK-${numericOrderIdA}`, "CLK-999999"] }
      )
    )
  );
  assert(bulkRes.status === 200, "POST /v1/orders/status returns 200");
  assert(bulkRes.json?.data?.statuses?.[0]?.found === true, "Authorized order found: true");
  assert(bulkRes.json?.data?.statuses?.[1]?.found === false, "Unauthorized / missing order found: false");

  // 14. Order History Endpoint
  console.log("\n[14] Order History (GET /v1/orders)");
  const historyRes = await parseResponse(
    await getOrdersHandler(createRequest("GET", "/v1/orders?limit=10", { Authorization: `Bearer ${liveKeyGenA.key}` }))
  );
  assert(historyRes.status === 200, "GET /v1/orders returns 200");
  assert(Array.isArray(historyRes.json?.data?.orders), "Returns array of orders");
  assert(historyRes.json?.data?.total >= 1, "Order history contains created orders");

  // 15. Webhooks Configuration & Test API
  console.log("\n[15] Webhooks API Endpoints");
  const saveWebhookRes = await parseResponse(
    await postWebhooksHandler(
      createRequest(
        "POST",
        "/v1/webhooks",
        { Authorization: `Bearer ${liveKeyGenA.key}` },
        { url: "https://example.com/webhook", events: ["order.created", "order.completed"] }
      )
    )
  );
  assert(saveWebhookRes.status === 200, "POST /v1/webhooks saves webhook URL");
  assert(saveWebhookRes.json?.data?.url === "https://example.com/webhook", "Webhook URL saved accurately");
  assert(saveWebhookRes.json?.data?.secret?.startsWith("whsec_"), "Generates secret prefixed with whsec_");

  const getWebhooksRes = await parseResponse(
    await getWebhooksHandler(createRequest("GET", "/v1/webhooks", { Authorization: `Bearer ${liveKeyGenA.key}` }))
  );
  assert(getWebhooksRes.status === 200, "GET /v1/webhooks retrieves configuration");

  // 15b. Background Cron Webhook Retries Endpoint
  console.log("\n[15b] Background Cron Webhook Retries Endpoint");
  const cronRes = await parseResponse(
    await getWebhookCronHandler(createRequest("GET", "/api/cron/webhooks?limit=10"))
  );
  assert(cronRes.status === 200, "GET /api/cron/webhooks returns 200");
  assert(cronRes.json?.success === true, "Cron webhook endpoint responds with success: true");

  // 16. Sandbox Mode Isolation
  console.log("\n[16] Sandbox Mode Route Handler Testing");
  const sandboxRef = `SANDBOX-${Date.now()}`;
  const sandboxOrderRes = await parseResponse(
    await postOrdersHandler(
      createRequest(
        "POST",
        "/v1/orders",
        { Authorization: `Bearer ${testKeyGenA.key}` },
        {
          network: "MTN",
          packageId: mtnPackage!.id,
          recipient: "0241234567",
          reference: sandboxRef,
        }
      )
    )
  );
  assert(sandboxOrderRes.status === 201, "Sandbox order created with ck_test_ key");
  assert(sandboxOrderRes.json?.data?.status === "TEST_COMPLETED", "Sandbox order returns TEST_COMPLETED");

  const sandboxOrderId = parseInt(sandboxOrderRes.json?.data?.orderId.replace("CLK-", ""), 10);
  orderIdsToClean.push(sandboxOrderId);
  const dbSandboxOrder = await prisma.order.findUnique({ where: { id: sandboxOrderId } });
  assert(dbSandboxOrder?.isSandbox === true, "Database record has isSandbox=true");

  // Production key cannot access sandbox order
  const liveAccessingSandboxRes = await parseResponse(
    await getOrderByIdHandler(
      createRequest("GET", `/v1/orders/${sandboxOrderId}`, { Authorization: `Bearer ${liveKeyGenA.key}` }),
      { params: Promise.resolve({ id: String(sandboxOrderId) }) }
    )
  );
  assert(liveAccessingSandboxRes.status === 404, "Live credentials CANNOT access sandbox orders (strict environment isolation)");

  // 17. Master Order Engine Transitions
  console.log("\n[17] Master Order Engine Integration");
  const transitionRes = await changeOrderStatus(numericOrderIdA, "PROCESSING", "In delivery", {
    id: "system",
    label: "admin",
  });
  assert(transitionRes.changed, "Master order engine transitions order PENDING -> PROCESSING");

  const transitionedOrderRes = await parseResponse(
    await getOrderByIdHandler(
      createRequest("GET", `/v1/orders/${numericOrderIdA}`, { Authorization: `Bearer ${liveKeyGenA.key}` }),
      { params: Promise.resolve({ id: String(numericOrderIdA) }) }
    )
  );
  assert(transitionedOrderRes.json?.data?.status === "PROCESSING", "API order status immediately reflects master order engine");

  // 18. Maintenance Mode Halted Integration
  console.log("\n[18] Maintenance Mode / Order Processing Halted");
  await setSetting("order_processing_halted", "true");

  const haltedOrderRes = await parseResponse(
    await postOrdersHandler(
      createRequest(
        "POST",
        "/v1/orders",
        { Authorization: `Bearer ${liveKeyGenA.key}` },
        {
          network: "MTN",
          packageId: mtnPackage!.id,
          recipient: "0241234567",
        }
      )
    )
  );
  assert(haltedOrderRes.status === 503, "POST /v1/orders returns 503 when order processing is halted");
  assert(haltedOrderRes.json?.error?.code === "ORDER_PROCESSING_UNAVAILABLE", "Returns code ORDER_PROCESSING_UNAVAILABLE");

  // Status check continues to work during maintenance!
  const statusDuringHalt = await parseResponse(
    await getOrderByIdHandler(
      createRequest("GET", `/v1/orders/${numericOrderIdA}`, { Authorization: `Bearer ${liveKeyGenA.key}` }),
      { params: Promise.resolve({ id: String(numericOrderIdA) }) }
    )
  );
  assert(statusDuringHalt.status === 200, "GET /v1/orders/:id continues working during maintenance");

  // Restore maintenance mode
  await setSetting("order_processing_halted", "false");

  // 18b. Carrier-Specific Network Maintenance Controls
  console.log("\n[18b] Carrier-Specific Network Maintenance Controls");
  await setSetting("network_mtn_enabled", "false");

  const mtnHaltedRes = await parseResponse(
    await postOrdersHandler(
      createRequest(
        "POST",
        "/v1/orders",
        { Authorization: `Bearer ${liveKeyGenA.key}` },
        {
          network: "MTN",
          packageId: mtnPackage!.id,
          recipient: "0241234567",
        }
      )
    )
  );
  assert(mtnHaltedRes.status === 503, "POST /v1/orders for MTN returns 503 when network_mtn_enabled is false");
  assert(mtnHaltedRes.json?.error?.message?.includes("MTN"), "Error message mentions MTN maintenance");

  // Networks status endpoint reflects MTN UNAVAILABLE
  const carrierMaintStatusRes = await parseResponse(
    await getNetworksStatusHandler(
      createRequest("GET", "/v1/networks/status", { Authorization: `Bearer ${liveKeyGenA.key}` })
    )
  );
  assert(carrierMaintStatusRes.status === 200, "GET /v1/networks/status returns 200");
  const mtnNet = carrierMaintStatusRes.json?.data?.find((n: any) => n.network === "MTN");
  assert(mtnNet?.status === "UNAVAILABLE" && mtnNet?.ordersEnabled === false, "MTN status marked UNAVAILABLE in /v1/networks/status");

  // Restore MTN
  await setSetting("network_mtn_enabled", "true");

  // Clean up test records
  console.log("\n[19] Cleaning Up Test Artifacts");
  await prisma.idempotencyKey.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
  await prisma.walletTransaction.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
  await prisma.apiWebhookDelivery.deleteMany({ where: { webhook: { userId: { in: [userA.id, userB.id] } } } });
  await prisma.apiWebhook.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIdsToClean } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIdsToClean } } });
  await prisma.apiCredential.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
  await prisma.apiApplication.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });

  console.log("\n==================================================");
  console.log(`TOTAL TESTS: ${passed + failed}`);
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runApiTests()
  .catch((e) => {
    console.error("FATAL ERROR in test runner:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
