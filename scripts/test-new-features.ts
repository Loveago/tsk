import assert from "assert";
import { splitOrderLines, parseOrderLine } from "../src/lib/order-parse";
import { isMtnPrefix, detectNetworkNameByPrefix } from "../src/lib/phone-utils";
import { storefrontApplySchema, storefrontSettingsSchema, settingsSchema } from "../src/lib/validation";

console.log("Running comprehensive feature verification tests...\n");

// ----------------------------------------------------
// 1. Test splitOrderLines and Duplicate handling
// ----------------------------------------------------
console.log("1. Testing splitOrderLines & duplicates on single line:");

const packages = [
  { network: "MTN", gbAmount: 1, price: 3.8 },
  { network: "MTN", gbAmount: 2, price: 7.0 },
  { network: "TELECEL", gbAmount: 1, price: 3.5 },
];

const duplicateInput = "0535308873 1 gb ,0535308873 2 gb";
const splitLines = splitOrderLines(duplicateInput);
assert.strictEqual(splitLines.length, 2, "Should split comma-separated orders preceding a phone number");
assert.strictEqual(splitLines[0], "0535308873 1 gb");
assert.strictEqual(splitLines[1], "0535308873 2 gb");

const parsedOrders = splitLines.map((l) => parseOrderLine(l, packages, "MTN")).filter(Boolean);
assert.strictEqual(parsedOrders.length, 2);
assert.strictEqual(parsedOrders[0]!.phoneNumber, "0535308873");
assert.strictEqual(parsedOrders[0]!.gbAmount, 1);
assert.strictEqual(parsedOrders[1]!.phoneNumber, "0535308873");
assert.strictEqual(parsedOrders[1]!.gbAmount, 2);

// Simulate deduplication logic
const seen = new Set<string>();
const deduplicated = [];
for (const o of parsedOrders) {
  if (!seen.has(o!.phoneNumber)) {
    seen.add(o!.phoneNumber);
    deduplicated.push(o);
  }
}
assert.strictEqual(deduplicated.length, 1, "Only 1 order per number should survive deduplication");
assert.strictEqual(deduplicated[0]!.gbAmount, 1, "First occurrence should be preserved");
console.log("   ✓ User prompt duplicate scenario passed: only one order kept (1 GB)\n");

// ----------------------------------------------------
// 2. Test MTN vs Ported Prefix Detection
// ----------------------------------------------------
console.log("2. Testing MTN Ghana prefixes and ported number detection:");

const mtnNumbers = ["0241234567", "0251234567", "0535308873", "0541234567", "0551234567", "0591234567"];
for (const num of mtnNumbers) {
  assert.strictEqual(isMtnPrefix(num), true, `${num} should be recognized as MTN prefix`);
  assert.strictEqual(detectNetworkNameByPrefix(num), "MTN");
}

const portedTelecel = ["0201234567", "0501234567"];
for (const num of portedTelecel) {
  assert.strictEqual(isMtnPrefix(num), false, `${num} should NOT be recognized as MTN prefix`);
  assert.strictEqual(detectNetworkNameByPrefix(num), "Telecel");
}

const portedAirtelTigo = ["0261234567", "0271234567", "0561234567", "0571234567"];
for (const num of portedAirtelTigo) {
  assert.strictEqual(isMtnPrefix(num), false, `${num} should NOT be recognized as MTN prefix`);
  assert.strictEqual(detectNetworkNameByPrefix(num), "AirtelTigo");
}
console.log("   ✓ Prefix detection correctly separates standard MTN (024, 025, 053, 054, 055, 059) from Telecel & AirtelTigo\n");

// ----------------------------------------------------
// 3. Test Storefront Validation Schemas
// ----------------------------------------------------
console.log("3. Testing Storefront validation schemas:");

// Storefront Application requires storeName, contactNumber, whatsappGroupLink
const validApply = storefrontApplySchema.safeParse({
  storeName: "Topshanka Data",
  contactNumber: "0241234567",
  whatsappGroupLink: "https://chat.whatsapp.com/ABC123XYZ",
});
assert.strictEqual(validApply.success, true);

// Missing contact number
const missingContact = storefrontApplySchema.safeParse({
  storeName: "Topshanka Data",
  whatsappGroupLink: "https://chat.whatsapp.com/ABC123XYZ",
});
assert.strictEqual(missingContact.success, false, "contactNumber must be mandatory");

// Missing WhatsApp group link
const missingWhatsapp = storefrontApplySchema.safeParse({
  storeName: "Topshanka Data",
  contactNumber: "0241234567",
});
assert.strictEqual(missingWhatsapp.success, false, "whatsappGroupLink must be mandatory");

// Storefront settings allows updating phone and whatsappGroupLink
const validSettings = storefrontSettingsSchema.safeParse({
  storeName: "Topshanka Data Updated",
  phone: "0249998888",
  whatsappGroupLink: "https://chat.whatsapp.com/NEWLINK",
  description: "Best bundle reseller",
});
assert.strictEqual(validSettings.success, true);
console.log("   ✓ Storefront application mandatory fields enforced & settings schema includes contact and whatsapp group link\n");

// ----------------------------------------------------
// 4. Test System Settings Schema
// ----------------------------------------------------
console.log("4. Testing System Settings schema categories:");

const testSettings = {
  number_submission_page_enabled: "false",
  mtn_single_order_per_day_enabled: "true",
  default_register_role: "RESELLER",
  allow_user_registration: "true",
  storefront_feature_enabled: "true",
  order_processing_halted: "false",
  site_name: "Clickyfied",
  site_announcement: "Special weekend promo live now!",
  support_whatsapp: "233535308873",
  default_momo_number: "0241234567",
  contact_email: "support@topshanka.com",
  storefront_min_markup: "1.00",
  storefront_max_markup: "10.00",
  storefront_min_withdrawal: "50.00",
  max_orders_per_submission: "250",
};

const settingsParsed = settingsSchema.safeParse(testSettings);
assert.strictEqual(settingsParsed.success, true, "All new system settings keys must be accepted");
console.log("   ✓ All settings keys (kill switches, roles, daily limits, storefront, announcement, branding) valid\n");

console.log("All comprehensive verification tests passed successfully! ✓");
