import { prisma } from "../src/lib/prisma";
import { generateApiKey } from "../src/lib/api-keys";
import {
  dispatchNotReceivedFeedback,
  verifyWebhookSignature,
  getBaseAppUrl,
} from "../src/lib/webhooks";
import { NextRequest } from "next/server";
import { POST as postNotReceivedHandler, GET as getNotReceivedHandler } from "../src/app/v1/orders/[id]/not-received/route";
import { GET as getOrderByIdHandler } from "../src/app/v1/orders/[id]/route";
import { GET as getEvidenceHandler } from "../src/app/api/evidence/[id]/route";
import { GET as getV1EvidenceHandler } from "../src/app/v1/reports/evidence/[id]/route";
import { POST as postClickyfiedWebhookHandler } from "../src/app/api/webhooks/providers/clickyfied/route";
import { deliveryReportCode } from "../src/lib/types";
import bcrypt from "bcryptjs";

let passed = 0;
let failed = 0;

function assert(condition: any, name: string, detail?: string) {
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

async function parseResponse(res: Response | Promise<Response>) {
  const resolved = await res;
  let json: any = null;
  let text = "";
  try {
    text = await resolved.text();
    json = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { status: resolved.status, headers: resolved.headers, json, text };
}

async function runNotReceivedE2ETests() {
  console.log("\n========================================================");
  console.log("TSKCONNECT 'NOT RECEIVED' REPORT & EVIDENCE FEEDBACK E2E");
  console.log("========================================================\n");

  const testEmail = `nr_e2e_user_${Date.now()}@test.com`;
  const pwHash = await bcrypt.hash("TestPass123!", 10);

  // 1. Setup Test Developer User & Application
  console.log("[1] Setup Test Developer User & Application");
  const user = await prisma.user.create({
    data: {
      name: "E2E Not Received Dev",
      email: testEmail,
      passwordHash: pwHash,
      role: "USER",
      balance: 100.0,
      status: "ACTIVE",
    },
  });

  await prisma.apiApplication.create({
    data: {
      userId: user.id,
      businessName: "E2E 3rd Party Store",
      websiteUrl: "https://e2e-store.com",
      usageDescription: "E2E not received testing",
      expectedMonthlyVolume: "100",
      contactEmail: testEmail,
      contactPhone: "0240001122",
      applicationType: "WEBSITE",
      status: "APPROVED",
      productionAccess: true,
      sandboxAccess: true,
      allowedScopes: "orders:create,orders:read,orders:status,webhooks:read,webhooks:manage",
    },
  });

  const liveKey = generateApiKey("live", "ck");
  await prisma.apiCredential.create({
    data: {
      userId: user.id,
      name: "E2E Live Key",
      environment: "PRODUCTION",
      keyPrefix: liveKey.prefix,
      keyHash: liveKey.keyHash,
      status: "ACTIVE",
      scopes: "orders:create,orders:read,orders:status,webhooks:read,webhooks:manage",
    },
  });

  const mtnPkg = await prisma.dataPackage.findFirst({
    where: { network: "MTN", active: true },
  });
  assert(!!mtnPkg, "Active MTN package found");

  // 2. Create Completed Order
  console.log("\n[2] Create Completed Test Order for User");
  const externalRef = `E2E-EXT-${Date.now()}`;
  const testPhone = "024" + Math.floor(1000000 + Math.random() * 9000000);
  const order = await prisma.order.create({
    data: {
      userId: user.id,
      phoneNumber: testPhone,
      network: "MTN",
      packageId: mtnPkg!.id,
      gbAmount: mtnPkg!.gbAmount,
      amount: 4.5,
      status: "SUCCESS",
      source: "API",
      externalReference: externalRef,
      completedAt: new Date(),
    },
  });
  assert(order.id > 0, `Created completed test order #${order.id}`);

  // 3. Submit Not Received Report via POST /v1/orders/{id}/not-received
  console.log("\n[3] Submit Not Received Report via API with Callback URL");
  const callbackUrl = "https://e2e-store.com/api/tsk-webhook";
  const callbackSecret = "e2e_whsec_secret_123456789";

  const submitRes = await parseResponse(
    await postNotReceivedHandler(
      createRequest(
        "POST",
        `/v1/orders/${order.id}/not-received`,
        { Authorization: `Bearer ${liveKey.key}` },
        {
          reason: "Customer reports bundle not delivered after 2 hours",
          customerNote: "I have restarted my phone twice and still no data.",
          callbackUrl,
          callbackSigningSecret: callbackSecret,
        }
      ),
      { params: Promise.resolve({ id: String(order.id) }) }
    )
  );

  assert(submitRes.status === 201, "POST /v1/orders/{id}/not-received returns 201 Created");
  assert(submitRes.json?.data?.report?.status === "pending_resolution", "Status is pending_resolution");
  assert(
    submitRes.json?.data?.report?.internalOrderId === `API-${order.id}` ||
    submitRes.json?.data?.report?.orderId === `API-${order.id}` ||
    submitRes.json?.data?.report?.orderId === externalRef,
    "Order ID formatted correctly"
  );
  assert(submitRes.json?.data?.report?.number === testPhone, "Phone number matches");

  const reportId = submitRes.json?.data?.report?.reportId;
  assert(!!reportId, `Report ID generated: ${reportId}`);

  // 4. Duplicate Report Prevention
  console.log("\n[4] Duplicate Not Received Submission Prevention");
  const dupRes = await parseResponse(
    await postNotReceivedHandler(
      createRequest(
        "POST",
        `/v1/orders/${order.id}/not-received`,
        { Authorization: `Bearer ${liveKey.key}` },
        { reason: "Duplicate submission" }
      ),
      { params: Promise.resolve({ id: String(order.id) }) }
    )
  );
  assert(dupRes.status === 409, "Duplicate submission returns 409 Conflict");
  assert(dupRes.json?.error?.code === "NOT_RECEIVED_ALREADY_EXISTS", "Error code is NOT_RECEIVED_ALREADY_EXISTS");

  // 5. Query Report via GET /v1/orders/{id}/not-received
  console.log("\n[5] Query Report via GET /v1/orders/{id}/not-received");
  const queryRes = await parseResponse(
    await getNotReceivedHandler(
      createRequest("GET", `/v1/orders/${order.id}/not-received`, {
        Authorization: `Bearer ${liveKey.key}`,
      }),
      { params: Promise.resolve({ id: String(order.id) }) }
    )
  );
  assert(queryRes.status === 200, "GET /v1/orders/{id}/not-received returns 200");
  const firstReport = queryRes.json?.data?.reports?.[0];
  assert(firstReport?.reportId === reportId, "Report ID matches");
  assert(firstReport?.externalReference === externalRef, "External reference matches");

  // 6. Carrier Proof Attachment & Public Evidence Endpoint
  console.log("\n[6] Carrier Proof Image Attachment & Public Evidence Endpoint");
  const dbReport = await prisma.deliveryReport.findFirst({
    where: { orderId: order.id },
  });
  assert(!!dbReport, "Delivery report record found in database");

  // Attach a mock 1x1 transparent PNG data URI as carrier proof
  const sampleProofBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  await prisma.deliveryReport.update({
    where: { id: dbReport!.id },
    data: {
      proofImage: sampleProofBase64,
      status: "CONFIRM_SENT",
      adminResponse: "MTN Carrier Delivery Audit: Bundle delivered successfully.",
    },
  });

  // Query /api/evidence/{seq}
  const evidenceRes = await parseResponse(
    await getEvidenceHandler(
      createRequest("GET", `/api/evidence/${dbReport!.seq}`),
      { params: Promise.resolve({ id: String(dbReport!.seq) }) }
    )
  );
  assert(evidenceRes.status === 200, "Public /api/evidence/{seq} returns 200 OK without authentication");
  assert(evidenceRes.headers.get("content-type") === "image/png", "Content-Type is image/png");
  assert(evidenceRes.headers.get("access-control-allow-origin") === "*", "CORS header Access-Control-Allow-Origin: * set");

  // Query alias /v1/reports/evidence/{code}
  const v1EvidenceRes = await parseResponse(
    await getV1EvidenceHandler(
      createRequest("GET", `/v1/reports/evidence/${deliveryReportCode(dbReport!.seq)}`),
      { params: Promise.resolve({ id: deliveryReportCode(dbReport!.seq) }) }
    )
  );
  assert(v1EvidenceRes.status === 200, "Alias /v1/reports/evidence/{code} returns 200 OK");
  assert(v1EvidenceRes.headers.get("content-type") === "image/png", "Content-Type is image/png");

  // 7. Verify Query now returns confirmed_sent with evidenceUrl
  console.log("\n[7] Query reflects confirmed_sent with Public Evidence URL");
  const queryUpdatedRes = await parseResponse(
    await getNotReceivedHandler(
      createRequest("GET", `/v1/orders/${order.id}/not-received`, {
        Authorization: `Bearer ${liveKey.key}`,
      }),
      { params: Promise.resolve({ id: String(order.id) }) }
    )
  );
  const updatedFirstReport = queryUpdatedRes.json?.data?.reports?.[0];
  assert(updatedFirstReport?.status === "confirmed_sent", "Status mapped to confirmed_sent");
  const returnedEvidenceUrl = updatedFirstReport?.evidenceUrl;
  assert(
    typeof returnedEvidenceUrl === "string" && returnedEvidenceUrl.includes(`/api/evidence/${dbReport!.seq}`),
    `Public evidenceUrl returned: ${returnedEvidenceUrl}`
  );

  // 8. Test dispatchNotReceivedFeedback Execution
  console.log("\n[8] Test Real-time Feedback Dispatch Logic");
  await dispatchNotReceivedFeedback({
    reportId: dbReport!.id,
    eventName: "report.not_received.confirmed_sent",
    status: "confirmed_sent",
    adminNotes: "Carrier confirmed delivery with official transmission statement.",
    actorLabel: "Admin Tester",
  });
  assert(true, "dispatchNotReceivedFeedback completed successfully without error");

  // 9. Upstream Clickyfied Webhook Simulation
  console.log("\n[9] Upstream Clickyfied Webhook Simulation");
  // Set provider reference on order so Clickyfied webhook matches it
  const clickyfiedOrderRef = `order-test-${Date.now()}`;
  await prisma.order.update({
    where: { id: order.id },
    data: { providerReference: `CLICKYFIED:${clickyfiedOrderRef}:999888` },
  });

  const clickyfiedWebhookRes = await parseResponse(
    await postClickyfiedWebhookHandler(
      createRequest(
        "POST",
        "/api/webhooks/providers/clickyfied",
        { "x-clickyfied-event": "report.not_received.confirmed_sent" },
        {
          event: "report.not_received.confirmed_sent",
          orderId: clickyfiedOrderRef,
          clientId: externalRef,
          report: {
            reportId: `CLK-NR-${order.id}`,
            orderId: clickyfiedOrderRef,
            number: testPhone,
            allocationGb: mtnPkg!.gbAmount,
            status: "confirmed_sent",
            adminNotes: "Delivered via MTN batch fulfillment",
            evidenceUrl: "https://carrier-proof.net/img/test-carrier-audit.jpg",
            evidenceType: "carrier_statement",
            updatedAt: new Date().toISOString(),
          },
        }
      )
    )
  );
  assert(clickyfiedWebhookRes.status === 200, "Clickyfied webhook returns 200");
  assert(clickyfiedWebhookRes.json?.received === true, "Clickyfied webhook acknowledged with received: true");

  // 10. Clean Up Test Artifacts
  console.log("\n[10] Clean Up Test Artifacts");
  await prisma.deliveryReportEvent.deleteMany({ where: { reportId: dbReport!.id } });
  await prisma.deliveryReport.deleteMany({ where: { id: dbReport!.id } });
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: order.id } });
  await prisma.order.deleteMany({ where: { id: order.id } });
  await prisma.apiCredential.deleteMany({ where: { userId: user.id } });
  await prisma.apiApplication.deleteMany({ where: { userId: user.id } });
  await prisma.apiWebhookDelivery.deleteMany({ where: { webhook: { userId: user.id } } });
  await prisma.apiWebhook.deleteMany({ where: { userId: user.id } });
  await prisma.user.deleteMany({ where: { id: user.id } });
  console.log("  ✓ Test artifacts cleaned up");

  console.log("\n========================================================");
  console.log(`E2E TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("========================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runNotReceivedE2ETests().catch((err) => {
  console.error("Fatal error in Not Received E2E suite:", err);
  process.exit(1);
});
