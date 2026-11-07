import { prisma } from "../src/lib/prisma";
import { signSession, SESSION_COOKIE } from "../src/lib/session";
import {
  normalizeCustomDomain,
  validateCustomDomain,
  getStorefrontUrls,
  getStorefrontDnsConfig,
} from "../src/lib/storefront";
import { generateStorefrontDomainGuidePdf } from "../src/lib/storefront-domain-guide-pdf";
import { NextRequest } from "next/server";
import { GET as pingHandler } from "../src/app/api/store/domain-ping/route";
import { GET as resolveHandler } from "../src/app/api/store/domain-resolve/route";
import { GET as paystackCallbackHandler } from "../src/app/api/store/paystack/callback/route";
import { middleware } from "../src/middleware";

let passed = 0;
let failed = 0;

function assert(condition: any, name: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

async function runCustomDomainE2E() {
  console.log("\n======================================================================");
  console.log("   TSKCONNECT STOREFRONT CUSTOM DOMAIN & PDF GUIDE — E2E TEST SUITE");
  console.log("======================================================================\n");

  const baseUrl = process.env.TEST_BASE_URL || "http://127.0.0.1:3099";
  const testEmail1 = "e2e-custom-domain-owner1@tskconnect.com";
  const testEmail2 = "e2e-custom-domain-owner2@tskconnect.com";
  const testSlug1 = "e2e-kofi-bundles";
  const testSlug2 = "e2e-ama-bundles";
  const testDomain = "e2e-kofibundles.com";
  const testPaymentRef = `GH-E2E-${Date.now()}`;

  try {
    // -------------------------------------------------------------------------
    // 1. UNIT & VALIDATION TESTS
    // -------------------------------------------------------------------------
    console.log("1. Testing Domain Normalization, Validation & URL Resolution Helpers...");

    assert(
      normalizeCustomDomain("  HTTPS://www.KofiBundles.com:8080/mtn?ref=123#top ") ===
        "kofibundles.com",
      "normalizeCustomDomain strips protocol, www, port, path, query, and hash"
    );
    assert(
      normalizeCustomDomain("http://shop.mensahdata.store/") === "shop.mensahdata.store",
      "normalizeCustomDomain preserves valid subdomains (e.g. shop.mensahdata.store)"
    );

    const vValid1 = validateCustomDomain("https://www.kofibundles.com");
    assert(
      vValid1.valid && vValid1.domain === "kofibundles.com",
      "validateCustomDomain accepts clean root .com domain"
    );

    const vValid2 = validateCustomDomain("bundles.fastdata.store");
    assert(
      vValid2.valid && vValid2.domain === "bundles.fastdata.store",
      "validateCustomDomain accepts subdomain on .store TLD"
    );

    const vReserved1 = validateCustomDomain("tskdatastore.com");
    assert(
      !vReserved1.valid && Boolean(vReserved1.error?.includes("reserved")),
      "validateCustomDomain blocks platform storefront domain (tskdatastore.com)"
    );

    const vReserved2 = validateCustomDomain("sub.tsk05.net");
    assert(
      !vReserved2.valid && Boolean(vReserved2.error?.includes("reserved")),
      "validateCustomDomain blocks main platform domain & subdomains (tsk05.net)"
    );

    const vReserved3 = validateCustomDomain("data-deals.com");
    assert(
      !vReserved3.valid && Boolean(vReserved3.error?.includes("reserved")),
      "validateCustomDomain blocks admin custom domain (data-deals.com)"
    );

    const vVercel = validateCustomDomain("my-test-app.vercel.app");
    assert(
      !vVercel.valid,
      "validateCustomDomain blocks .vercel.app preview domains"
    );

    const vBadSyntax = validateCustomDomain("not a domain!!");
    assert(!vBadSyntax.valid, "validateCustomDomain rejects invalid domain characters");

    const urlsDefault = getStorefrontUrls({
      slug: testSlug1,
      customDomain: testDomain,
      customDomainStatus: "PENDING_DNS",
      preferredDomainMode: "CUSTOM",
    });
    assert(
      urlsDefault.primaryUrl === `https://tskdatastore.com/${testSlug1}` &&
        !urlsDefault.hasActiveCustomDomain,
      "getStorefrontUrls falls back to default URL while customDomainStatus is PENDING_DNS"
    );

    const urlsCustomActive = getStorefrontUrls({
      slug: testSlug1,
      customDomain: testDomain,
      customDomainStatus: "ACTIVE",
      preferredDomainMode: "CUSTOM",
    });
    assert(
      urlsCustomActive.primaryUrl === `https://${testDomain}` &&
        urlsCustomActive.defaultUrl === `https://tskdatastore.com/${testSlug1}` &&
        urlsCustomActive.hasActiveCustomDomain &&
        urlsCustomActive.useCustomAsPrimary,
      "getStorefrontUrls returns custom domain as primary and preserves defaultUrl as fallback when ACTIVE"
    );

    const urlsSwitchToDefault = getStorefrontUrls({
      slug: testSlug1,
      customDomain: testDomain,
      customDomainStatus: "ACTIVE",
      preferredDomainMode: "DEFAULT",
    });
    assert(
      urlsSwitchToDefault.primaryUrl === `https://tskdatastore.com/${testSlug1}` &&
        urlsSwitchToDefault.hasActiveCustomDomain &&
        !urlsSwitchToDefault.useCustomAsPrimary,
      "getStorefrontUrls respects user switching preferredDomainMode back to DEFAULT"
    );

    // -------------------------------------------------------------------------
    // 2. SETUP TEST USERS & STOREFRONTS IN DATABASE
    // -------------------------------------------------------------------------
    console.log("\n2. Setting up E2E Test Users & Storefronts in Database...");

    // Clean up any leftover customDomain usage from previous runs
    await prisma.storefront.updateMany({
      where: { customDomain: testDomain },
      data: { customDomain: null, customDomainStatus: "NONE" },
    });

    const user1 = await prisma.user.upsert({
      where: { email: testEmail1 },
      update: { status: "ACTIVE", role: "RESELLER" },
      create: {
        email: testEmail1,
        name: "Kofi E2E Store Owner",
        passwordHash: "e2e_test_hash",
        role: "RESELLER",
        status: "ACTIVE",
        balance: 200,
      },
    });

    const user2 = await prisma.user.upsert({
      where: { email: testEmail2 },
      update: { status: "ACTIVE", role: "RESELLER" },
      create: {
        email: testEmail2,
        name: "Ama E2E Store Owner",
        passwordHash: "e2e_test_hash",
        role: "RESELLER",
        status: "ACTIVE",
        balance: 200,
      },
    });

    const existingSf1 = await prisma.storefront.findFirst({
      where: { OR: [{ userId: user1.id, isCustomDomain: false }, { slug: testSlug1 }] },
    });
    const storefront1 = existingSf1
      ? await prisma.storefront.update({
          where: { id: existingSf1.id },
          data: {
            userId: user1.id,
            slug: testSlug1,
            name: "Kofi Bundles Hub",
            status: "ENABLED",
            isActive: true,
            isCustomDomain: false,
            customDomain: null,
            customDomainStatus: "NONE",
            customDomainVerifiedAt: null,
            customDomainError: null,
            preferredDomainMode: "DEFAULT",
          },
        })
      : await prisma.storefront.create({
          data: {
            userId: user1.id,
            slug: testSlug1,
            name: "Kofi Bundles Hub",
            status: "ENABLED",
            isActive: true,
            isCustomDomain: false,
          },
        });

    const existingSf2 = await prisma.storefront.findFirst({
      where: { OR: [{ userId: user2.id, isCustomDomain: false }, { slug: testSlug2 }] },
    });
    const storefront2 = existingSf2
      ? await prisma.storefront.update({
          where: { id: existingSf2.id },
          data: {
            userId: user2.id,
            slug: testSlug2,
            name: "Ama Data Express",
            status: "ENABLED",
            isActive: true,
            isCustomDomain: false,
            customDomain: null,
            customDomainStatus: "NONE",
          },
        })
      : await prisma.storefront.create({
          data: {
            userId: user2.id,
            slug: testSlug2,
            name: "Ama Data Express",
            status: "ENABLED",
            isActive: true,
            isCustomDomain: false,
          },
        });

    assert(Boolean(storefront1.id && storefront2.id), "Provisioned two active test storefronts");

    const token1 = await signSession({
      sub: user1.id,
      email: user1.email,
      name: user1.name,
      role: user1.role,
      tv: user1.tokenVersion,
    });
    const token2 = await signSession({
      sub: user2.id,
      email: user2.email,
      name: user2.name,
      role: user2.role,
      tv: user2.tokenVersion,
    });
    const cookieHeader1 = `${SESSION_COOKIE}=${token1}`;
    const cookieHeader2 = `${SESSION_COOKIE}=${token2}`;

    // -------------------------------------------------------------------------
    // 3. TEST AUTHENTICATED API ROUTES (/api/storefront/domain) VIA LIVE SERVER
    // -------------------------------------------------------------------------
    console.log("\n3. Testing /api/storefront/domain Lifecycle (GET, PUT, Conflict, Mode Switch)...");

    // 3a. Initial GET
    const getRes1 = await fetch(`${baseUrl}/api/storefront/domain`, {
      headers: { Cookie: cookieHeader1 },
    });
    const getJson1 = await getRes1.json();
    assert(
      getRes1.status === 200 &&
        getJson1.domainConfig?.slug === testSlug1 &&
        getJson1.domainConfig?.customDomain === null &&
        getJson1.domainConfig?.customDomainStatus === "NONE",
      "GET /api/storefront/domain returns initial NONE status and DNS targets"
    );

    // 3b. PUT with reserved domain -> 400
    const putReservedRes = await fetch(`${baseUrl}/api/storefront/domain`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader1 },
      body: JSON.stringify({ customDomain: "https://tskdatastore.com" }),
    });
    assert(
      putReservedRes.status === 400,
      "PUT /api/storefront/domain rejects reserved platform domain with 400"
    );

    // 3c. PUT with valid custom domain (including https://www. prefix to test auto-sanitization)
    const putValidRes = await fetch(`${baseUrl}/api/storefront/domain`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader1 },
      body: JSON.stringify({
        customDomain: `https://www.${testDomain}/shop`,
        preferredDomainMode: "CUSTOM",
      }),
    });
    const putValidJson = await putValidRes.json();
    assert(
      putValidRes.status === 200 &&
        putValidJson.storefront?.customDomain === testDomain &&
        putValidJson.storefront?.customDomainStatus === "PENDING_DNS" &&
        putValidJson.storefront?.preferredDomainMode === "CUSTOM",
      `PUT /api/storefront/domain sanitizes & saves "${testDomain}" with status PENDING_DNS`
    );

    // 3d. Uniqueness Conflict: User 2 attempts to connect the exact same custom domain -> 409
    const putConflictRes = await fetch(`${baseUrl}/api/storefront/domain`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader2 },
      body: JSON.stringify({ customDomain: testDomain }),
    });
    assert(
      putConflictRes.status === 409,
      "PUT /api/storefront/domain blocks another storefront from claiming an already-connected domain (409 Conflict)"
    );

    // -------------------------------------------------------------------------
    // 4. TEST /api/store/domain-ping AND /api/store/domain-resolve
    // -------------------------------------------------------------------------
    console.log("\n4. Testing Gateway Handshake (/api/store/domain-ping) & Resolver (/api/store/domain-resolve)...");

    const pingReq = new NextRequest(`https://${testDomain}/api/store/domain-ping`, {
      headers: { host: testDomain, "x-forwarded-host": testDomain },
    });
    const pingRes = await pingHandler(pingReq);
    const pingJson = await pingRes.json();
    assert(
      pingRes.status === 200 &&
        pingJson.pong === true &&
        pingJson.host === testDomain &&
        pingRes.headers.get("x-tsk-storefront-gateway") === "verified",
      "GET /api/store/domain-ping returns pong=true and X-Tsk-Storefront-Gateway=verified header"
    );

    const resolveReqFound = new NextRequest(
      `${baseUrl}/api/store/domain-resolve?host=www.${testDomain}`
    );
    const resolveResFound = await resolveHandler(resolveReqFound);
    const resolveJsonFound = await resolveResFound.json();
    assert(
      resolveResFound.status === 200 &&
        resolveJsonFound.found === true &&
        resolveJsonFound.slug === testSlug1 &&
        resolveJsonFound.domain === testDomain,
      `GET /api/store/domain-resolve resolves "www.${testDomain}" -> slug "${testSlug1}"`
    );

    const resolveReqMissing = new NextRequest(
      `${baseUrl}/api/store/domain-resolve?host=nonexistent-domain-9999.com`
    );
    const resolveResMissing = await resolveHandler(resolveReqMissing);
    assert(
      resolveResMissing.status === 404,
      "GET /api/store/domain-resolve returns 404 for unknown custom domain"
    );

    // -------------------------------------------------------------------------
    // 5. TEST LIVE DNS + HTTP VERIFICATION ENGINE (POST /api/storefront/domain)
    // -------------------------------------------------------------------------
    console.log("\n5. Testing Live DNS & HTTP Verification (POST /api/storefront/domain)...");

    // 5a. Unregistered domain should fail DNS verification gracefully with clear message
    const verifyUnregisteredRes = await fetch(`${baseUrl}/api/storefront/domain`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader1 },
      body: JSON.stringify({ customDomain: testDomain }),
    });
    const verifyUnregisteredJson = await verifyUnregisteredRes.json();
    assert(
      verifyUnregisteredRes.status === 200 &&
        verifyUnregisteredJson.verified === false &&
        verifyUnregisteredJson.storefront?.customDomainStatus === "ERROR" &&
        Boolean(verifyUnregisteredJson.message?.includes("No DNS A or CNAME records")),
      "POST /api/storefront/domain detects missing DNS records and sets informative error state"
    );

    // 5b. Simulate verified ACTIVE state on testDomain and verify mode switching
    await prisma.storefront.update({
      where: { id: storefront1.id },
      data: {
        customDomain: testDomain,
        customDomainStatus: "ACTIVE",
        customDomainVerifiedAt: new Date(),
        customDomainError: null,
        preferredDomainMode: "CUSTOM",
      },
    });

    const getActiveRes = await fetch(`${baseUrl}/api/storefront/domain`, {
      headers: { Cookie: cookieHeader1 },
    });
    const getActiveJson = await getActiveRes.json();
    assert(
      getActiveRes.status === 200 &&
        getActiveJson.domainConfig?.customDomainStatus === "ACTIVE" &&
        getActiveJson.domainConfig?.primaryUrl === `https://${testDomain}`,
      "GET /api/storefront/domain reflects ACTIVE status and primaryUrl = https://e2e-kofibundles.com"
    );

    // -------------------------------------------------------------------------
    // 6. TEST NEXT.JS MIDDLEWARE MULTI-DOMAIN ROUTING E2E
    // -------------------------------------------------------------------------
    console.log("\n6. Testing Next.js Middleware Custom Domain Routing & Security Isolation...");

    // Ensure middleware can reach the running server for domain-resolve
    process.env.PORT = new URL(baseUrl).port || "3099";

    // 6a. Root path on custom domain: https://e2e-kofibundles.com/ -> rewrites to /store/e2e-kofi-bundles
    const mwRootReq = new NextRequest(`https://${testDomain}/`, {
      headers: { host: testDomain, "x-forwarded-host": testDomain },
    });
    const mwRootRes = await middleware(mwRootReq);
    const mwRootRewrite = mwRootRes.headers.get("x-middleware-rewrite") || "";
    assert(
      mwRootRewrite.endsWith(`/store/${testSlug1}`),
      `Middleware rewrites https://${testDomain}/ -> /store/${testSlug1} (got: ${mwRootRewrite})`
    );

    // 6b. Network path on www. custom domain: https://www.e2e-kofibundles.com/mtn -> /store/e2e-kofi-bundles/mtn
    const mwNetworkReq = new NextRequest(`https://www.${testDomain}/mtn`, {
      headers: { host: `www.${testDomain}`, "x-forwarded-host": `www.${testDomain}` },
    });
    const mwNetworkRes = await middleware(mwNetworkReq);
    const mwNetworkRewrite = mwNetworkRes.headers.get("x-middleware-rewrite") || "";
    assert(
      mwNetworkRewrite.endsWith(`/store/${testSlug1}/mtn`),
      `Middleware rewrites https://www.${testDomain}/mtn -> /store/${testSlug1}/mtn`
    );

    // 6c. Track path on custom domain: https://e2e-kofibundles.com/track -> /store/e2e-kofi-bundles/track
    const mwTrackReq = new NextRequest(`https://${testDomain}/track`, {
      headers: { host: testDomain, "x-forwarded-host": testDomain },
    });
    const mwTrackRes = await middleware(mwTrackReq);
    const mwTrackRewrite = mwTrackRes.headers.get("x-middleware-rewrite") || "";
    assert(
      mwTrackRewrite.endsWith(`/store/${testSlug1}/track`),
      `Middleware rewrites https://${testDomain}/track -> /store/${testSlug1}/track`
    );

    // 6d. Order receipt path on custom domain: https://e2e-kofibundles.com/order/GH-123 -> /store/e2e-kofi-bundles/order/GH-123
    const mwOrderReq = new NextRequest(`https://${testDomain}/order/GH-123`, {
      headers: { host: testDomain, "x-forwarded-host": testDomain },
    });
    const mwOrderRes = await middleware(mwOrderReq);
    const mwOrderRewrite = mwOrderRes.headers.get("x-middleware-rewrite") || "";
    assert(
      mwOrderRewrite.endsWith(`/store/${testSlug1}/order/GH-123`),
      `Middleware rewrites https://${testDomain}/order/GH-123 -> /store/${testSlug1}/order/GH-123`
    );

    // 6e. Clean URL normalization: https://e2e-kofibundles.com/e2e-kofi-bundles/mtn -> redirects to /mtn
    const mwSlugPrefixedReq = new NextRequest(`https://${testDomain}/${testSlug1}/mtn`, {
      headers: { host: testDomain, "x-forwarded-host": testDomain },
    });
    const mwSlugPrefixedRes = await middleware(mwSlugPrefixedReq);
    const mwSlugLocation = mwSlugPrefixedRes.headers.get("location") || "";
    assert(
      (mwSlugPrefixedRes.status === 307 || mwSlugPrefixedRes.status === 308) &&
        mwSlugLocation.endsWith("/mtn") &&
        !mwSlugLocation.includes(testSlug1),
      `Middleware normalizes /${testSlug1}/mtn on custom domain -> clean /mtn (${mwSlugLocation})`
    );

    // 6f. Security isolation: /admin and /dashboard on custom domain redirect to https://tsk05.net/login
    const mwAdminReq = new NextRequest(`https://${testDomain}/admin`, {
      headers: { host: testDomain, "x-forwarded-host": testDomain },
    });
    const mwAdminRes = await middleware(mwAdminReq);
    const mwAdminLoc = mwAdminRes.headers.get("location") || "";
    assert(
      (mwAdminRes.status === 307 || mwAdminRes.status === 308) &&
        mwAdminLoc.includes("/login"),
      `Middleware blocks /admin on custom domain and redirects to main platform login (${mwAdminLoc})`
    );

    // 6g. Default storefront domain still works simultaneously: https://tskdatastore.com/e2e-kofi-bundles
    const mwDefaultReq = new NextRequest(`https://tskdatastore.com/${testSlug1}`, {
      headers: { host: "tskdatastore.com", "x-forwarded-host": "tskdatastore.com" },
    });
    const mwDefaultRes = await middleware(mwDefaultReq);
    const mwDefaultRewrite = mwDefaultRes.headers.get("x-middleware-rewrite") || "";
    assert(
      mwDefaultRewrite.endsWith(`/store/${testSlug1}`),
      `Default storefront link (https://tskdatastore.com/${testSlug1}) continues working alongside custom domain`
    );

    // -------------------------------------------------------------------------
    // 7. TEST LIVE STOREFRONT PAGE RENDERING VIA CUSTOM DOMAIN HOST HEADER
    // -------------------------------------------------------------------------
    console.log("\n7. Testing End-to-End Storefront HTML Rendering via Custom Domain Host Header...");

    const liveStoreHtmlRes = await fetch(`${baseUrl}/`, {
      headers: {
        Host: testDomain,
        "X-Forwarded-Host": testDomain,
      },
      redirect: "manual",
    });
    const liveStoreHtml = await liveStoreHtmlRes.text();
    assert(
      liveStoreHtmlRes.status === 200 && liveStoreHtml.includes("Kofi Bundles Hub"),
      `Live HTTP GET "/" with Host: ${testDomain} renders "Kofi Bundles Hub" storefront page (HTTP 200)`
    );

    // -------------------------------------------------------------------------
    // 8. TEST PAYSTACK CALLBACK REDIRECT ON CUSTOM DOMAIN VS DEFAULT DOMAIN
    // -------------------------------------------------------------------------
    console.log("\n8. Testing Paystack Callback Redirects for Custom Domain & Default Domain...");

    let pkg = await prisma.dataPackage.findFirst({ where: { active: true } });
    if (!pkg) {
      pkg = await prisma.dataPackage.create({
        data: {
          network: "MTN",
          name: "1GB E2E Package",
          gbAmount: 1,
          retailPriceGHS: 5,
          active: true,
        },
      });
    }

    const sfProduct = await prisma.storefrontProduct.upsert({
      where: {
        storefrontId_packageId: {
          storefrontId: storefront1.id,
          packageId: pkg.id,
        },
      },
      update: { sellingPrice: 600, isActive: true },
      create: {
        storefrontId: storefront1.id,
        packageId: pkg.id,
        sellingPrice: 600,
        isActive: true,
      },
    });

    const maxSeqAgg = await prisma.storefrontOrder.aggregate({ _max: { seq: true } });
    const nextSeq = (maxSeqAgg._max.seq ?? 0) + 1;

    const testSfOrder = await prisma.storefrontOrder.create({
      data: {
        seq: nextSeq,
        storefrontId: storefront1.id,
        productId: sfProduct.id,
        customerPhone: "0241234567",
        customerEmail: "buyer@e2e.com",
        sellingPrice: 600,
        productCost: 450,
        commission: 150,
        status: "PENDING",
        commissionState: "PENDING",
        paymentReference: testPaymentRef,
      },
    });

    // 8a. Callback arriving on Custom Domain
    const cbCustomReq = new NextRequest(
      `https://${testDomain}/api/store/paystack/callback?reference=${testPaymentRef}`,
      {
        headers: {
          host: testDomain,
          "x-forwarded-host": testDomain,
          "x-forwarded-proto": "https",
        },
      }
    );
    const cbCustomRes = await paystackCallbackHandler(cbCustomReq);
    const cbCustomLoc = cbCustomRes.headers.get("location") || "";
    assert(
      (cbCustomRes.status === 307 || cbCustomRes.status === 302) &&
        cbCustomLoc.includes(`${testDomain}/order/${testPaymentRef}`),
      `Paystack callback on custom domain redirects buyer to ${cbCustomLoc}`
    );

    // 8b. Callback arriving on Default Storefront Domain (tskdatastore.com)
    const cbDefaultReq = new NextRequest(
      `https://tskdatastore.com/api/store/paystack/callback?reference=${testPaymentRef}`,
      {
        headers: {
          host: "tskdatastore.com",
          "x-forwarded-host": "tskdatastore.com",
          "x-forwarded-proto": "https",
        },
      }
    );
    const cbDefaultRes = await paystackCallbackHandler(cbDefaultReq);
    const cbDefaultLoc = cbDefaultRes.headers.get("location") || "";
    assert(
      (cbDefaultRes.status === 307 || cbDefaultRes.status === 302) &&
        cbDefaultLoc.includes(`tskdatastore.com/${testSlug1}/order/${testPaymentRef}`),
      `Paystack callback on default domain redirects buyer to ${cbDefaultLoc}`
    );

    // Clean up test order
    await prisma.storefrontOrder.delete({ where: { id: testSfOrder.id } });

    // -------------------------------------------------------------------------
    // 9. TEST PERSONALIZED PDF SETUP GUIDE EXPORT (/api/storefront/domain-guide-pdf)
    // -------------------------------------------------------------------------
    console.log("\n9. Testing Personalized PDF Setup Guide Export (/api/storefront/domain-guide-pdf)...");

    const pdfRes = await fetch(
      `${baseUrl}/api/storefront/domain-guide-pdf?domain=${encodeURIComponent(testDomain)}`,
      {
        headers: { Cookie: cookieHeader1 },
      }
    );
    const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
    const pdfHeader = pdfBuf.subarray(0, 8).toString("ascii");
    const contentDisposition = pdfRes.headers.get("content-disposition") || "";

    assert(
      pdfRes.status === 200 &&
        pdfRes.headers.get("content-type") === "application/pdf" &&
        pdfHeader.startsWith("%PDF-1.7") &&
        pdfBuf.byteLength > 5000 &&
        contentDisposition.includes(`custom-domain-setup-guide-${testSlug1}.pdf`),
      `GET /api/storefront/domain-guide-pdf returns valid PDF (${pdfBuf.byteLength} bytes, filename="custom-domain-setup-guide-${testSlug1}.pdf")`
    );

    // -------------------------------------------------------------------------
    // 10. TEST DISCONNECTING CUSTOM DOMAIN (DELETE /api/storefront/domain)
    // -------------------------------------------------------------------------
    console.log("\n10. Testing Custom Domain Disconnection (DELETE /api/storefront/domain)...");

    const delRes = await fetch(`${baseUrl}/api/storefront/domain`, {
      method: "DELETE",
      headers: { Cookie: cookieHeader1 },
    });
    const delJson = await delRes.json();
    assert(
      delRes.status === 200 &&
        delJson.storefront?.customDomain === null &&
        delJson.storefront?.customDomainStatus === "NONE" &&
        delJson.storefront?.preferredDomainMode === "DEFAULT",
      "DELETE /api/storefront/domain disconnects domain and reverts preferredDomainMode to DEFAULT"
    );
  } finally {
    // Cleanup E2E test storefronts & users
    await prisma.storefront.deleteMany({
      where: { slug: { in: [testSlug1, testSlug2] } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [testEmail1, testEmail2] } },
    });
  }

  console.log("\n======================================================================");
  console.log(`E2E SUMMARY: ${passed} passed, ${failed} failed`);
  console.log("======================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runCustomDomainE2E().catch((err) => {
  console.error("Fatal error in Custom Domain E2E test suite:", err);
  process.exit(1);
});
