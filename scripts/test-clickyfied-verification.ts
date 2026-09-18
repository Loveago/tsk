import { prisma } from "../src/lib/prisma";
import { getProviderRoutingConfig } from "../src/lib/provider-apis/router";
import { ClickyfiedClient } from "../src/lib/provider-apis/clickyfied";

async function runClickyfiedVerificationTest() {
  console.log("\n========================================================");
  console.log("TESTING CLICKYFIED NUMBER VERIFICATION ENDPOINT");
  console.log("========================================================\n");

  const config = await getProviderRoutingConfig();
  console.log("Clickyfied Configuration:");
  console.log("  Enabled:", config.clickyfied.enabled);
  console.log("  Base URL:", config.clickyfied.baseUrl);
  console.log("  Client ID:", config.clickyfied.clientId || "(none)");
  console.log("  API Key:", config.clickyfied.apiKey ? `${config.clickyfied.apiKey.slice(0, 8)}...` : "(none)");
  console.log("  MTN Verification Setting:", config.clickyfied.mtnVerificationEnabled);

  if (!config.clickyfied.apiKey) {
    console.error("ERROR: Clickyfied API key is not configured in system settings!");
    process.exit(1);
  }

  const client = new ClickyfiedClient(config.clickyfied);

  const testNumberVerified = "0535308873";
  const testNumberUnverified = "0598427212";

  // 1. Direct raw fetch inspection
  console.log("\n[1] Direct Raw HTTP Request to Clickyfied /numbers/verify");
  const endpoint = `${config.clickyfied.baseUrl.replace(/\/$/, "")}/numbers/verify`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.clickyfied.apiKey}`,
  };
  if (config.clickyfied.clientId) {
    headers["X-Client-ID"] = config.clickyfied.clientId;
  }

  const payload = {
    numbers: [testNumberVerified, testNumberUnverified],
  };

  console.log(`URL: ${endpoint}`);
  console.log("Payload:", JSON.stringify(payload, null, 2));

  try {
    const rawRes = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    console.log(`Response HTTP Status: ${rawRes.status} ${rawRes.statusText}`);
    const rawText = await rawRes.text();
    console.log("Raw Response Body:");
    try {
      const parsedJson = JSON.parse(rawText);
      console.log(JSON.stringify(parsedJson, null, 2));
    } catch {
      console.log(rawText);
    }
  } catch (err: any) {
    console.error("Direct fetch failed:", err);
  }

  // 2. Testing via our ClickyfiedClient.verifyNumbers method
  console.log("\n[2] Testing via ClickyfiedClient.verifyNumbers() Batch");
  try {
    const result = await client.verifyNumbers([testNumberVerified, testNumberUnverified]);
    console.log("Parsed Valid Numbers:", result.validNumbers);
    console.log("Parsed Invalid Numbers:", result.invalidNumbers);
    console.log("Raw Response:", JSON.stringify(result.raw, null, 2));

    const isVerifiedFound = result.validNumbers.includes(testNumberVerified);
    const isUnverifiedFound = result.validNumbers.includes(testNumberUnverified);

    console.log("\nVerification Outcomes:");
    console.log(`  ${testNumberVerified} (expected VERIFIED): ${isVerifiedFound ? "✓ VERIFIED" : "✗ NOT VERIFIED"}`);
    console.log(`  ${testNumberUnverified} (expected UNVERIFIED): ${!isUnverifiedFound ? "✓ UNVERIFIED (Correct)" : "✗ INCORRECTLY VERIFIED"}`);
  } catch (err: any) {
    console.error("verifyNumbers batch failed:", err.message || err);
  }

  // 3. Testing single number verification individually
  console.log("\n[3] Testing single numbers individually");
  try {
    console.log(`Checking ${testNumberVerified}...`);
    const res1 = await client.verifyNumbers([testNumberVerified]);
    console.log(`  Result for ${testNumberVerified}:`, {
      validNumbers: res1.validNumbers,
      invalidNumbers: res1.invalidNumbers,
      raw: res1.raw,
    });

    console.log(`Checking ${testNumberUnverified}...`);
    const res2 = await client.verifyNumbers([testNumberUnverified]);
    console.log(`  Result for ${testNumberUnverified}:`, {
      validNumbers: res2.validNumbers,
      invalidNumbers: res2.invalidNumbers,
      raw: res2.raw,
    });
  } catch (err: any) {
    console.error("Individual checks failed:", err.message || err);
  }

  console.log("\n========================================================");
  console.log("CLICKYFIED VERIFICATION TEST COMPLETE");
  console.log("========================================================\n");
}

runClickyfiedVerificationTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
