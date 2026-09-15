import { BigwindataClient, DEFAULT_BIGWINDATA_API_KEY, DEFAULT_BIGWINDATA_BASE_URL } from "../src/lib/provider-apis/bigwindata";
import { ClickyfiedClient, DEFAULT_CLICKYFIED_API_KEY, DEFAULT_CLICKYFIED_CLIENT_ID, DEFAULT_CLICKYFIED_SANDBOX_URL } from "../src/lib/provider-apis/clickyfied";
import { getProviderForNetwork, getProviderRoutingConfig } from "../src/lib/provider-apis/router";
import { prisma } from "../src/lib/prisma";
import crypto from "crypto";

async function runTests() {
  console.log("=================================================");
  console.log("   RUNNING PROVIDER APIS INTEGRATION TEST SUITE   ");
  console.log("=================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string, detail?: unknown) {
    if (condition) {
      console.log(`✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${name}`, detail !== undefined ? detail : "");
      failed++;
    }
  }

  // ---------------------------------------------------------------------------
  // 1. Bigwindata Client Tests
  // ---------------------------------------------------------------------------
  console.log("\n--- [1] Bigwindata Client & Webhook Signature ---");
  const bigwinClient = new BigwindataClient({
    apiKey: DEFAULT_BIGWINDATA_API_KEY,
    baseUrl: DEFAULT_BIGWINDATA_BASE_URL,
    webhookSecret: "test_secret_key_123",
  });

  assert(bigwinClient.mapNetworkToCode("MTN") === "mtn", "Bigwindata maps MTN -> mtn");
  assert(bigwinClient.mapNetworkToCode("MTN", "MTN Xpress") === "mtn_xpress", "Bigwindata maps MTN Xpress -> mtn_xpress");
  assert(bigwinClient.mapNetworkToCode("TELECEL") === "telecel", "Bigwindata maps TELECEL -> telecel");
  assert(bigwinClient.mapNetworkToCode("AIRTELTIGO", "Big Time 5GB") === "at_bigtime", "Bigwindata maps AirtelTigo Bigtime -> at_bigtime");
  assert(bigwinClient.mapNetworkToCode("AIRTELTIGO", "iShare 2GB") === "at_ishare", "Bigwindata maps AirtelTigo iShare -> at_ishare");

  // Webhook signature verification
  const testPayload = JSON.stringify({
    event: "order.delivered",
    order: { id: 101, status: "delivered", reference: "ORD_TSK_TEST" },
  });
  const validSig = crypto.createHmac("sha256", "test_secret_key_123").update(testPayload).digest("hex");
  const invalidSig = "bad_signature_string";

  assert(
    bigwinClient.verifyWebhookSignature(testPayload, validSig) === true,
    "Bigwindata verifies valid HMAC-SHA256 webhook signature"
  );
  assert(
    bigwinClient.verifyWebhookSignature(testPayload, invalidSig) === false,
    "Bigwindata rejects invalid webhook signature"
  );

  // Live Bigwindata balance query
  try {
    const balance = await bigwinClient.getBalance();
    assert(
      typeof balance.rawBalance === "number" && balance.rawBalance > 0,
      `Bigwindata live balance check: ${balance.balance} (raw: ${balance.rawBalance})`
    );
  } catch (err: any) {
    assert(false, `Bigwindata live balance query failed: ${err?.message}`);
  }

  // Live Bigwindata bundle catalogue & MTN 1GB resolution
  try {
    const bundleId = await bigwinClient.resolveBundleId("MTN", 1);
    assert(
      typeof bundleId === "number" && bundleId > 0,
      `Bigwindata resolveBundleId('MTN', 1GB) resolved to bundle ID: ${bundleId}`
    );
  } catch (err: any) {
    assert(false, `Bigwindata bundle resolution failed: ${err?.message}`);
  }

  // ---------------------------------------------------------------------------
  // 2. Clickyfied Client Tests (Sandbox & Credentials)
  // ---------------------------------------------------------------------------
  console.log("\n--- [2] Clickyfied Client & Sandbox Endpoints ---");
  const clickyfiedClient = new ClickyfiedClient({
    apiKey: DEFAULT_CLICKYFIED_API_KEY,
    baseUrl: DEFAULT_CLICKYFIED_SANDBOX_URL,
    clientId: DEFAULT_CLICKYFIED_CLIENT_ID,
    callbackSigningSecret: "test_cb_secret",
  });

  assert(
    DEFAULT_CLICKYFIED_CLIENT_ID === "ext-topskankatest-001",
    "Clickyfied client ID is configured to ext-topskankatest-001"
  );

  // Live Clickyfied current billing check
  try {
    const billing = await clickyfiedClient.getCurrentBilling();
    assert(
      billing?.success === true && billing?.bill?.user?.name === "Top Skanka API Test",
      `Clickyfied live billing check for user: ${billing?.bill?.user?.name} (Net: GHS ${billing?.bill?.netAmount})`
    );
  } catch (err: any) {
    assert(false, `Clickyfied billing check failed: ${err?.message}`);
  }

  // Live Clickyfied number verification
  try {
    const verifyRes = await clickyfiedClient.verifyNumbers(["0257467983"]);
    const hasNumber =
      verifyRes.validNumbers.includes("0257467983") ||
      verifyRes.validNumbers.includes("233257467983");
    assert(
      hasNumber,
      `Clickyfied live number verification for 0257467983: verified numbers = ${JSON.stringify(verifyRes.validNumbers)}`
    );
  } catch (err: any) {
    assert(false, `Clickyfied number verification failed: ${err?.message}`);
  }

  // Test generateClickyfiedReference helper format: order-1788XXXXXXXXX
  try {
    const { generateClickyfiedReference } = await import("../src/lib/provider-apis/clickyfied");
    const testRef = generateClickyfiedReference();
    const pattern = /^order-1788\d{9}$/;
    assert(
      pattern.test(testRef),
      `generateClickyfiedReference produced valid reference: ${testRef}`
    );
  } catch (err: any) {
    assert(false, `generateClickyfiedReference failed: ${err?.message}`);
  }

  // Live Clickyfied idempotent submit retry (Action 2 from docs)
  try {
    const orderRes = await clickyfiedClient.submitOrder({
      externalReference: "probe-001",
      entries: [{ number: "0257467983", allocationGB: 1 }],
      idempotencyKey: "probe-001",
    });
    assert(
      orderRes.orderId === "order-1789475166825" || !!orderRes.orderId,
      `Clickyfied submitOrder idempotent retry succeeded (orderId: ${orderRes.orderId}, reused: ${orderRes.reused})`
    );
  } catch (err: any) {
    assert(false, `Clickyfied submitOrder failed: ${err?.message}`);
  }

  // Live Clickyfied order status check (Action 3 from docs)
  try {
    const statusRes = await clickyfiedClient.getOrderStatus("order-1789475166825");
    assert(
      statusRes.status.toLowerCase() === "pending" || !!statusRes.status,
      `Clickyfied getOrderStatus('order-1789475166825') returned status: ${statusRes.status}`
    );
  } catch (err: any) {
    assert(false, `Clickyfied getOrderStatus failed: ${err?.message}`);
  }

  // ---------------------------------------------------------------------------
  // 3. Provider Routing Engine & Settings Matrix
  // ---------------------------------------------------------------------------
  console.log("\n--- [3] Provider Routing Matrix & Presets ---");

  // When routing is OFF
  await prisma.systemSetting.upsert({
    where: { key: "provider_routing_enabled" },
    create: { key: "provider_routing_enabled", value: "false" },
    update: { value: "false" },
  });

  const offRoute = await getProviderForNetwork("MTN");
  assert(offRoute === "MANUAL", "When provider_routing_enabled=false, routing returns MANUAL");

  // Configure user's desired matrix:
  // - MTN -> BIGWINDATA
  // - Telecel -> CLICKYFIED
  // - AirtelTigo iShare -> CLICKYFIED
  // - AirtelTigo Big Time -> CLICKYFIED
  await prisma.systemSetting.upsert({
    where: { key: "provider_routing_enabled" },
    create: { key: "provider_routing_enabled", value: "true" },
    update: { value: "true" },
  });
  await prisma.systemSetting.upsert({
    where: { key: "provider_route_MTN" },
    create: { key: "provider_route_MTN", value: "BIGWINDATA" },
    update: { value: "BIGWINDATA" },
  });
  await prisma.systemSetting.upsert({
    where: { key: "provider_route_MTN_XPRESS" },
    create: { key: "provider_route_MTN_XPRESS", value: "BIGWINDATA" },
    update: { value: "BIGWINDATA" },
  });
  await prisma.systemSetting.upsert({
    where: { key: "provider_route_TELECEL" },
    create: { key: "provider_route_TELECEL", value: "CLICKYFIED" },
    update: { value: "CLICKYFIED" },
  });
  await prisma.systemSetting.upsert({
    where: { key: "provider_route_AIRTELTIGO_ISHARE" },
    create: { key: "provider_route_AIRTELTIGO_ISHARE", value: "CLICKYFIED" },
    update: { value: "CLICKYFIED" },
  });
  await prisma.systemSetting.upsert({
    where: { key: "provider_route_AIRTELTIGO_BIGTIME" },
    create: { key: "provider_route_AIRTELTIGO_BIGTIME", value: "CLICKYFIED" },
    update: { value: "CLICKYFIED" },
  });
  await prisma.systemSetting.upsert({
    where: { key: "clickyfied_client_id" },
    create: { key: "clickyfied_client_id", value: "ext-topskankatest-001" },
    update: { value: "ext-topskankatest-001" },
  });

  const mtnRoute = await getProviderForNetwork("MTN");
  assert(mtnRoute === "BIGWINDATA", "MTN routes to BIGWINDATA");

  const telecelRoute = await getProviderForNetwork("TELECEL");
  assert(telecelRoute === "CLICKYFIED", "Telecel routes to CLICKYFIED");

  const ishareRoute = await getProviderForNetwork("AIRTELTIGO", "iShare 2GB");
  assert(ishareRoute === "CLICKYFIED", "AirtelTigo iShare routes to CLICKYFIED");

  const bigtimeRoute = await getProviderForNetwork("AIRTELTIGO", "Big Time 1GB");
  assert(bigtimeRoute === "CLICKYFIED", "AirtelTigo Big Time routes to CLICKYFIED");

  const config = await getProviderRoutingConfig();
  assert(config.enabled === true, "Routing config returns enabled: true");
  assert(config.clickyfied.clientId === "ext-topskankatest-001", "Routing config has correct client ID");

  // ---------------------------------------------------------------------------
  // 4. MTN Verification Check Integration
  // ---------------------------------------------------------------------------
  console.log("\n--- [4] MTN Verification Integration ---");
  const { validateMtnOrderRecipient, isMtnNumberAccepted } = await import("../src/lib/mtn-verification");

  // Ensure setting is active
  await prisma.systemSetting.upsert({
    where: { key: "clickyfied_mtn_verification_enabled" },
    create: { key: "clickyfied_mtn_verification_enabled", value: "true" },
    update: { value: "true" },
  });

  try {
    const valResult = await validateMtnOrderRecipient("0257467983", "MTN");
    assert(valResult.allowed === true, "validateMtnOrderRecipient for 0257467983 returns allowed: true");
    const isAccepted = await isMtnNumberAccepted("0257467983");
    assert(isAccepted === true, "0257467983 is saved into AcceptedMtnNumber database table");
  } catch (err: any) {
    assert(false, `validateMtnOrderRecipient threw error: ${err?.message}`);
  }

  // ---------------------------------------------------------------------------
  // 5. Test Live Single Order on Bigwindata (1GB MTN to 0257467983)
  // ---------------------------------------------------------------------------
  console.log("\n--- [5] Live Order Placement on Bigwindata (1GB MTN) ---");
  try {
    // Check if an order was already placed with this idempotency key
    const idempotencyKey = "TSK-TEST-MTN1GB-0257467983";
    const purchaseResult = await bigwinClient.purchase({
      bundleId: 43, // Express 1GB
      recipient: "0257467983",
      idempotencyKey,
    });
    const isSuccess =
      purchaseResult.order_id > 0 &&
      ["accepted", "processing", "success"].includes(purchaseResult.status.toLowerCase());
    assert(
      isSuccess,
      `Bigwindata 1GB MTN test purchase succeeded! Order ID: ${purchaseResult.order_id}, Ref: ${purchaseResult.reference}, Price: ${purchaseResult.price}`
    );
  } catch (err: any) {
    // If already placed (e.g. 409 duplicate_order), verify message
    if (err?.message?.includes("duplicate") || err?.message?.includes("already")) {
      assert(true, `Bigwindata 1GB MTN order already placed idempotently: ${err.message}`);
    } else {
      assert(false, `Bigwindata 1GB MTN order failed: ${err?.message}`);
    }
  }

  console.log("\n=================================================");
  console.log(`   TEST RUN COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests()
  .catch((e) => {
    console.error("Test execution encountered fatal error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
