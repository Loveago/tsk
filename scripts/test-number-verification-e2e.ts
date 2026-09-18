import { prisma } from "../src/lib/prisma";
import { generateApiKey, hashApiKey } from "../src/lib/api-keys";
import { NextRequest } from "next/server";
import {
  OPTIONS as optionsHandler,
  POST as postVerifyHandler,
  GET as getVerifyHandler,
} from "../src/app/v1/numbers/verify/route";

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

async function runNumberVerificationE2E() {
  console.log("\n========================================================");
  console.log("TSKCONNECT NUMBER VERIFICATION ENDPOINT E2E TEST SUITE");
  console.log("========================================================\n");

  // 1. Setup test user & credentials
  console.log("[Setup] Creating test user and API credentials");
  let testUser: any = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      testUser = await prisma.user.findFirst({
        where: { email: "verify-e2e-tester@tskconnect.com" },
      });
      if (!testUser) {
        testUser = await prisma.user.create({
          data: {
            email: "verify-e2e-tester@tskconnect.com",
            name: "Verify E2E Tester",
            passwordHash: "test_dummy_hash",
            balance: 500,
            role: "USER",
          },
        });
      }
      break;
    } catch (err) {
      if (attempt === 5) throw err;
      console.log(`[DB] Connection attempt ${attempt} failed, retrying in 2s...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  // Ensure testUser has an APPROVED ApiApplication for production access
  await prisma.apiApplication.upsert({
    where: { userId: testUser.id },
    create: {
      userId: testUser.id,
      businessName: "Verify Tester Corp",
      websiteUrl: "https://test.tskconnect.com",
      usageDescription: "E2E Testing",
      expectedMonthlyVolume: "1000",
      contactEmail: "verify-e2e-tester@tskconnect.com",
      contactPhone: "0240000000",
      applicationType: "WEBSITE",
      status: "APPROVED",
      productionAccess: true,
      sandboxAccess: true,
      allowedScopes: "networks:read,packages:read,orders:create,orders:read,orders:status,balance:read,webhooks:read,webhooks:manage,numbers:verify",
    },
    update: {
      status: "APPROVED",
      productionAccess: true,
      sandboxAccess: true,
      allowedScopes: "networks:read,packages:read,orders:create,orders:read,orders:status,balance:read,webhooks:read,webhooks:manage,numbers:verify",
    },
  });

  // Generate test sandbox key with full scopes
  const sandboxKeyGen = generateApiKey("test");
  const liveKeyGen = generateApiKey("live");
  const restrictedKeyGen = generateApiKey("test");

  // Create API credentials in DB
  const sandboxCred = await prisma.apiCredential.create({
    data: {
      userId: testUser.id,
      name: "E2E Sandbox Key",
      keyPrefix: sandboxKeyGen.prefix,
      keyHash: sandboxKeyGen.keyHash,
      environment: "sandbox",
      scopes: "networks:read,packages:read,orders:create,orders:read,numbers:verify",
      rateLimitPerMin: 120,
    },
  });

  const liveCred = await prisma.apiCredential.create({
    data: {
      userId: testUser.id,
      name: "E2E Live Key",
      keyPrefix: liveKeyGen.prefix,
      keyHash: liveKeyGen.keyHash,
      environment: "production",
      scopes: "networks:read,packages:read,orders:create,orders:read,numbers:verify",
      rateLimitPerMin: 120,
    },
  });

  const restrictedCred = await prisma.apiCredential.create({
    data: {
      userId: testUser.id,
      name: "E2E Restricted Key",
      keyPrefix: restrictedKeyGen.prefix,
      keyHash: restrictedKeyGen.keyHash,
      environment: "sandbox",
      scopes: "networks:read,packages:read", // missing numbers:verify
      rateLimitPerMin: 120,
    },
  });

  try {
    // ── Test 1: OPTIONS Preflight ──────────────────────────────────────────
    console.log("\n[Test 1] CORS Preflight OPTIONS Request");
    const optionsRes = await optionsHandler();
    assert(optionsRes.status === 204, "OPTIONS returns 204 No Content");
    const allowMethods = optionsRes.headers.get("Access-Control-Allow-Methods");
    assert(
      Boolean(allowMethods?.includes("POST") && allowMethods?.includes("GET")),
      "Access-Control-Allow-Methods includes POST and GET",
      allowMethods || undefined
    );

    // ── Test 2: Authentication & Authorization ────────────────────────────
    console.log("\n[Test 2] Authentication & Security Gaps");

    // Missing auth header
    const noAuthReq = createRequest("POST", "/v1/numbers/verify", {}, { numbers: ["0241234567"] });
    const noAuthRes = await parseResponse(await postVerifyHandler(noAuthReq));
    assert(noAuthRes.status === 401, "Missing Authorization header returns 401");
    assert(noAuthRes.json?.error?.code === "UNAUTHORIZED", "Error code is UNAUTHORIZED");

    // Invalid/Tampered key
    const badKeyReq = createRequest(
      "POST",
      "/v1/numbers/verify",
      { Authorization: "Bearer ck_test_invalidfakekey999999999999999" },
      { numbers: ["0241234567"] }
    );
    const badKeyRes = await parseResponse(await postVerifyHandler(badKeyReq));
    assert(badKeyRes.status === 401, "Invalid API key returns 401");

    // Insufficient scope (missing numbers:verify)
    const restrictedReq = createRequest(
      "POST",
      "/v1/numbers/verify",
      { Authorization: `Bearer ${restrictedKeyGen.key}` },
      { numbers: ["0241234567"] }
    );
    const restrictedRes = await parseResponse(await postVerifyHandler(restrictedReq));
    assert(restrictedRes.status === 403, "Key lacking numbers:verify scope returns 403");
    assert(
      restrictedRes.json?.error?.code === "FORBIDDEN",
      "Error code is FORBIDDEN"
    );

    // ── Test 3: Input Validation ──────────────────────────────────────────
    console.log("\n[Test 3] Input Validation & Edge Cases");

    // Empty numbers array
    const emptyReq = createRequest(
      "POST",
      "/v1/numbers/verify",
      { Authorization: `Bearer ${sandboxKeyGen.key}` },
      { numbers: [] }
    );
    const emptyRes = await parseResponse(await postVerifyHandler(emptyReq));
    assert(emptyRes.status === 400, "Empty numbers array returns 400");
    assert(emptyRes.json?.error?.code === "INVALID_REQUEST", "Error code is INVALID_REQUEST");

    // Exceeding batch size limit (>100)
    const largeList = Array.from({ length: 101 }, (_, i) => `0241000${String(i).padStart(3, "0")}`);
    const largeReq = createRequest(
      "POST",
      "/v1/numbers/verify",
      { Authorization: `Bearer ${sandboxKeyGen.key}` },
      { numbers: largeList }
    );
    const largeRes = await parseResponse(await postVerifyHandler(largeReq));
    assert(largeRes.status === 400, "Submitting >100 numbers returns 400 batch limit error");
    assert(
      largeRes.json?.error?.message?.includes("maximum of 100 numbers"),
      "Message explains 100 limit"
    );

    // Invalid JSON body
    const badJsonReq = createRequest(
      "POST",
      "/v1/numbers/verify",
      { Authorization: `Bearer ${sandboxKeyGen.key}` },
      "{ malformed_json"
    );
    const badJsonRes = await parseResponse(await postVerifyHandler(badJsonReq));
    assert(badJsonRes.status === 400, "Malformed JSON returns 400");

    // ── Test 4: Batch Verification in Sandbox Mode ────────────────────────
    console.log("\n[Test 4] Sandbox Verification (MTN, Telecel, AirtelTigo, Invalid)");
    const batchReq = createRequest(
      "POST",
      "/v1/numbers/verify",
      { Authorization: `Bearer ${sandboxKeyGen.key}` },
      {
        numbers: [
          "0241234567",       // MTN valid
          "+233201234567",    // Telecel valid (international format)
          "233261234567",     // AirtelTigo valid (national prefix)
          "024000",           // Invalid Ghanaian phone
        ],
      }
    );
    const batchRes = await parseResponse(await postVerifyHandler(batchReq));
    assert(batchRes.status === 200, "POST batch verification returns 200");
    assert(batchRes.json?.success === true, "success is true");

    const data = batchRes.json?.data;
    assert(Array.isArray(data?.results) && data.results.length === 4, "Returns 4 results");
    assert(Array.isArray(data?.verified), "Returns top-level verified array");
    assert(Array.isArray(data?.unverified), "Returns top-level unverified array");
    assert(Array.isArray(data?.invalid), "Returns top-level invalid array");

    // Check summary counters
    assert(data?.summary?.total === 4, "Summary total is 4");
    assert(data?.summary?.verified === 3, "Summary verified count is 3");
    assert(data?.summary?.unverified === 0, "Summary unverified count is 0");
    assert(data?.summary?.invalid === 1, "Summary invalid count is 1");

    // Verify individual items
    const mtnItem = data?.results?.find((r: any) => r.number === "0241234567");
    assert(mtnItem?.network === "MTN" && mtnItem?.verified === true, "MTN is verified in sandbox");

    const telecelItem = data?.results?.find((r: any) => r.number === "0201234567");
    assert(telecelItem?.network === "TELECEL" && telecelItem?.verified === true, "Telecel normalized and verified");

    const tigoItem = data?.results?.find((r: any) => r.number === "0261234567");
    assert(tigoItem?.network === "AIRTELTIGO" && tigoItem?.verified === true, "AirtelTigo normalized and verified");

    const invalidItem = data?.results?.find((r: any) => r.number === "024000");
    assert(invalidItem?.valid === false && invalidItem?.canOrder === false, "Invalid number marked valid=false");

    // ── Test 5: Single Number POST formats ────────────────────────────────
    console.log("\n[Test 5] Flexible POST Payload (number / phone)");

    // Single "number" key
    const singleReq = createRequest(
      "POST",
      "/v1/numbers/verify",
      { Authorization: `Bearer ${sandboxKeyGen.key}` },
      { number: "0241234567" }
    );
    const singleRes = await parseResponse(await postVerifyHandler(singleReq));
    assert(singleRes.status === 200, "POST { number: '0241234567' } returns 200");
    assert(singleRes.json?.data?.summary?.total === 1, "Verified 1 number from single property");

    // Single "phone" key
    const phoneReq = createRequest(
      "POST",
      "/v1/numbers/verify",
      { Authorization: `Bearer ${sandboxKeyGen.key}` },
      { phone: "0201234567" }
    );
    const phoneRes = await parseResponse(await postVerifyHandler(phoneReq));
    assert(phoneRes.status === 200, "POST { phone: '0201234567' } returns 200");

    // ── Test 6: GET Method Support ─────────────────────────────────────────
    console.log("\n[Test 6] GET Query Parameter Verification");

    // GET with single number
    const getSingleReq = createRequest(
      "GET",
      "/v1/numbers/verify?number=0241234567",
      { Authorization: `Bearer ${sandboxKeyGen.key}` }
    );
    const getSingleRes = await parseResponse(await getVerifyHandler(getSingleReq));
    assert(getSingleRes.status === 200, "GET /v1/numbers/verify?number=0241234567 returns 200");
    assert(getSingleRes.json?.data?.verified?.includes("0241234567"), "Single number returned in verified array");

    // GET with comma-separated numbers
    const getMultiReq = createRequest(
      "GET",
      "/v1/numbers/verify?numbers=0241234567,0201234567",
      { Authorization: `Bearer ${sandboxKeyGen.key}` }
    );
    const getMultiRes = await parseResponse(await getVerifyHandler(getMultiReq));
    assert(getMultiRes.status === 200, "GET ?numbers=0241234567,0201234567 returns 200");
    assert(getMultiRes.json?.data?.summary?.total === 2, "Verified 2 numbers from query params");

    // GET without parameters
    const getMissingReq = createRequest(
      "GET",
      "/v1/numbers/verify",
      { Authorization: `Bearer ${sandboxKeyGen.key}` }
    );
    const getMissingRes = await parseResponse(await getVerifyHandler(getMissingReq));
    assert(getMissingRes.status === 400, "GET without query param returns 400 INVALID_REQUEST");

    // ── Test 7: Live Mode Verification Against Database ───────────────────
    console.log("\n[Test 7] Production Mode DB Verification (AcceptedMtnNumber lookup)");

    const testMtnVerified = "0249999001";
    const testMtnUnverified = "0249999002";

    // Ensure system setting is enabled for test, with Clickyfied off to isolate local DB check
    await prisma.systemSetting.upsert({
      where: { key: "mtn_number_verification_enabled" },
      create: { key: "mtn_number_verification_enabled", value: "true" },
      update: { value: "true" },
    });
    await prisma.systemSetting.upsert({
      where: { key: "clickyfied_mtn_verification_enabled" },
      create: { key: "clickyfied_mtn_verification_enabled", value: "false" },
      update: { value: "false" },
    });

    // Seed testMtnVerified into AcceptedMtnNumber
    await prisma.acceptedMtnNumber.upsert({
      where: { normalizedNumber: testMtnVerified },
      create: {
        number: testMtnVerified,
        normalizedNumber: testMtnVerified,
        source: "E2E_TEST",
      },
      update: {},
    });

    // Make sure testMtnUnverified is NOT in AcceptedMtnNumber
    await prisma.acceptedMtnNumber.deleteMany({
      where: { normalizedNumber: testMtnUnverified },
    });

    const liveReq = createRequest(
      "POST",
      "/v1/numbers/verify",
      { Authorization: `Bearer ${liveKeyGen.key}` },
      { numbers: [testMtnVerified, testMtnUnverified, "0201234567"] }
    );
    const liveRes = await parseResponse(await postVerifyHandler(liveReq));
    assert(liveRes.status === 200, "Production verification returns 200");

    const liveResults = liveRes.json?.data?.results;
    const verifiedEntry = liveResults?.find((r: any) => r.number === testMtnVerified);
    assert(
      verifiedEntry?.verified === true && verifiedEntry?.canOrder === true,
      "Seeded MTN number is verified: true and canOrder: true"
    );

    const unverifiedEntry = liveResults?.find((r: any) => r.number === testMtnUnverified);
    assert(
      unverifiedEntry?.verified === false && unverifiedEntry?.canOrder === false,
      "Unseeded MTN number is verified: false and canOrder: false"
    );

    const telecelEntry = liveResults?.find((r: any) => r.number === "0201234567");
    assert(
      telecelEntry?.verified === true && telecelEntry?.canOrder === true,
      "Telecel number in live mode is verified: true and canOrder: true"
    );

    assert(
      liveRes.json?.data?.verified?.includes(testMtnVerified),
      "Top-level verified array includes verified MTN number"
    );
    assert(
      liveRes.json?.data?.unverified?.includes(testMtnUnverified),
      "Top-level unverified array includes unverified MTN number"
    );

    // Clean up seeded number
    await prisma.acceptedMtnNumber.deleteMany({
      where: { normalizedNumber: testMtnVerified },
    });

    // ── Test 8: Request Audit Logging ─────────────────────────────────────
    console.log("\n[Test 8] API Request Logging & Audit Trail");
    const loggedEntry = await prisma.apiRequestLog.findFirst({
      where: {
        credentialId: sandboxCred.id,
        endpoint: "/v1/numbers/verify",
        status: 200,
      },
      orderBy: { createdAt: "desc" },
    });
    assert(Boolean(loggedEntry), "ApiRequestLog recorded entry for /v1/numbers/verify");
    assert(loggedEntry?.status === 200, "Logged entry has status 200");
    assert(typeof loggedEntry?.responseTimeMs === "number", "Logged entry tracks responseTimeMs");

  } finally {
    // ── Cleanup ────────────────────────────────────────────────────────────
    console.log("\n[Cleanup] Removing test credentials, applications, and logs");
    await prisma.apiRequestLog.deleteMany({
      where: {
        credentialId: { in: [sandboxCred.id, liveCred.id, restrictedCred.id] },
      },
    });
    await prisma.apiCredential.deleteMany({
      where: {
        id: { in: [sandboxCred.id, liveCred.id, restrictedCred.id] },
      },
    });
    await prisma.apiApplication.deleteMany({
      where: { userId: testUser.id },
    });
  }

  console.log("\n========================================================");
  console.log(`E2E SUITE FINISHED: ${passed} passed, ${failed} failed`);
  console.log("========================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runNumberVerificationE2E()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("Test error:", err);
    process.exit(1);
  });
