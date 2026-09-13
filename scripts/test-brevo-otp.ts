import assert from "assert";
import {
  generateLoginOtp,
  verifyLoginOtp,
  verifyOtpTicket,
  isTicketConsumed,
} from "../src/lib/otp";
import {
  verifyOtpSchema,
  resendOtpSchema,
  settingsSchema,
} from "../src/lib/validation";
import {
  sendPasswordResetEmail,
  sendLoginOtpEmail,
  getBrevoConfig,
  sendEmail,
} from "../src/lib/email";
import { verifyWebhookSignature } from "../src/lib/paystack";
import { createHmac } from "crypto";

async function runTests() {
  console.log("=== Starting Automated Verification Tests ===");

  // 1. Validation Schemas
  console.log("Testing validation schemas...");
  const validSettings = settingsSchema.parse({
    brevo_api_key: "xkeysib-test-key-12345",
    brevo_sender_email: "support@example.com",
    brevo_sender_name: "Clickyfied Support",
    login_otp_enabled: "true",
    paystack_secret_key: "sk_test_1234567890",
  });
  assert.strictEqual(validSettings.brevo_api_key, "xkeysib-test-key-12345");
  assert.strictEqual(validSettings.brevo_sender_email, "support@example.com");
  assert.strictEqual(validSettings.brevo_sender_name, "Clickyfied Support");
  assert.strictEqual(validSettings.login_otp_enabled, "true");
  assert.strictEqual(validSettings.paystack_secret_key, "sk_test_1234567890");

  const validOtpInput = verifyOtpSchema.parse({
    ticket: "sample.jwt.token",
    code: "123456",
  });
  assert.strictEqual(validOtpInput.code, "123456");

  assert.throws(
    () => verifyOtpSchema.parse({ ticket: "sample.jwt.token", code: "123" }),
    /Code must be 6 digits/
  );
  assert.throws(
    () => verifyOtpSchema.parse({ ticket: "", code: "123456" }),
    /OTP ticket is required/
  );

  const validResendInput = resendOtpSchema.parse({ ticket: "sample.jwt.token" });
  assert.strictEqual(validResendInput.ticket, "sample.jwt.token");
  console.log("✓ Validation schemas test passed.");

  // 2. OTP Generation and Verification
  console.log("Testing OTP generation and verification...");
  const testUserId = "user_test_123";
  const testEmail = "testuser@example.com";

  const { code, ticket } = await generateLoginOtp(testUserId, testEmail);
  assert.ok(code.length === 6, "Code should be 6 digits");
  assert.ok(/^\d{6}$/.test(code), "Code should be purely numeric");
  assert.ok(ticket.length > 20, "Ticket should be a non-empty JWT");

  // Verify ticket structure helper
  const ticketParsed = await verifyOtpTicket(ticket);
  assert.strictEqual(ticketParsed.valid, true);
  assert.strictEqual(ticketParsed.payload?.sub, testUserId);
  assert.strictEqual(ticketParsed.payload?.email, testEmail);
  assert.ok(ticketParsed.payload?.jti, "Ticket must contain a jti");
  assert.strictEqual(isTicketConsumed(ticketParsed.payload!.jti), false);

  // Incorrect code test
  const wrongCode = code === "000000" ? "111111" : "000000";
  const wrongRes = await verifyLoginOtp(ticket, wrongCode);
  assert.strictEqual(wrongRes.valid, false);
  assert.ok(wrongRes.error?.includes("Incorrect"), "Should indicate incorrect code");
  // Ticket should NOT be burned by a wrong code attempt
  assert.strictEqual(isTicketConsumed(ticketParsed.payload!.jti), false);

  // Correct code test (should succeed and consume ticket)
  const successRes = await verifyLoginOtp(ticket, code);
  assert.strictEqual(successRes.valid, true);
  assert.strictEqual(successRes.userId, testUserId);
  assert.strictEqual(successRes.email, testEmail);
  assert.strictEqual(isTicketConsumed(ticketParsed.payload!.jti), true);

  // Replay protection test with correct code (should reject already used ticket)
  const replayRes1 = await verifyLoginOtp(ticket, code);
  assert.strictEqual(replayRes1.valid, false);
  assert.ok(replayRes1.error?.includes("already been used"), "Should reject replayed ticket on correct code");

  // Replay protection test with wrong code (should STILL reject as already used, not report wrong code)
  const replayRes2 = await verifyLoginOtp(ticket, wrongCode);
  assert.strictEqual(replayRes2.valid, false);
  assert.ok(replayRes2.error?.includes("already been used"), "Should reject replayed ticket on wrong code too");

  console.log("✓ OTP generation, verification, and replay prevention tests passed.");

  // 3. Email Templates, Options Overrides, and Simulation
  console.log("Testing Email dispatch and templates...");
  const brevoConfig = await getBrevoConfig();
  assert.ok(brevoConfig.senderEmail, "Sender email should have fallback or value");
  assert.ok(brevoConfig.senderName, "Sender name should have fallback or value");

  // Test simulation when no brevo key is in env
  const simResult = await sendEmail({
    to: "someone@example.com",
    subject: "Test Email",
    text: "This is a test",
  });
  assert.strictEqual(simResult.success, true);
  assert.ok(simResult.messageId, "Should return a messageId");

  // Test allowSimulation: false rejects when no key is provided
  const noSimResult = await sendEmail(
    {
      to: "someone@example.com",
      subject: "Test Email",
      text: "This is a test",
    },
    { allowSimulation: false, apiKey: "" }
  );
  assert.strictEqual(noSimResult.success, false);
  assert.ok(noSimResult.error?.includes("not configured"));

  // Test sendPasswordResetEmail
  const resetRes = await sendPasswordResetEmail(
    "resetuser@example.com",
    "John Doe",
    "https://clickyfied.com/reset-password?token=abcdef123456",
    60
  );
  assert.strictEqual(resetRes.success, true);
  assert.ok(resetRes.messageId, "Password reset email should succeed");

  // Test sendLoginOtpEmail
  const otpEmailRes = await sendLoginOtpEmail(
    "otpuser@example.com",
    "Jane Doe",
    "582910",
    10
  );
  assert.strictEqual(otpEmailRes.success, true);
  assert.ok(otpEmailRes.messageId, "OTP email should succeed");
  console.log("✓ Email templates and dispatch tests passed.");

  // 4. Paystack Webhook Signature Verification
  console.log("Testing Paystack webhook signature verification...");
  const originalSecret = process.env.PAYSTACK_SECRET_KEY;
  process.env.PAYSTACK_SECRET_KEY = "sk_test_paystack_mock_secret";

  const rawPayload = JSON.stringify({ event: "charge.success", data: { reference: "REF123" } });
  const validSig = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
    .update(rawPayload, "utf8")
    .digest("hex");

  const sigVerified = await verifyWebhookSignature(rawPayload, validSig);
  assert.strictEqual(sigVerified, true, "Valid webhook signature must verify");

  const invalidSig = await verifyWebhookSignature(rawPayload, "bad_signature");
  assert.strictEqual(invalidSig, false, "Invalid webhook signature must fail");

  const tamperedPayload = await verifyWebhookSignature(rawPayload + " ", validSig);
  assert.strictEqual(tamperedPayload, false, "Tampered payload must fail signature check");

  process.env.PAYSTACK_SECRET_KEY = originalSecret;
  console.log("✓ Paystack webhook signature verification tests passed.");

  console.log("=== ALL AUTOMATED TESTS PASSED SUCCESSFULLY ===");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
