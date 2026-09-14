import { getSetting } from "@/lib/orders";

export interface EmailPayload {
  to: string;
  toName?: string;
  subject: string;
  text: string;
  html?: string;
}

export interface BrevoConfig {
  apiKey: string | null;
  senderEmail: string;
  senderName: string;
}

/**
 * Reads Brevo credentials from system settings (stored in DB) with fallbacks
 * to environment variables and system defaults.
 */
export async function getBrevoConfig(): Promise<BrevoConfig> {
  const dbApiKey = (await getSetting("brevo_api_key")).trim();
  const apiKey = dbApiKey || process.env.BREVO_API_KEY?.trim() || null;

  const dbSenderEmail = (await getSetting("brevo_sender_email")).trim();
  const envSenderEmail = process.env.BREVO_SENDER_EMAIL?.trim();
  const supportEmail = (await getSetting("support_email")).trim();
  const senderEmail = dbSenderEmail || envSenderEmail || supportEmail || "support@tskconnect.com";

  const dbSenderName = (await getSetting("brevo_sender_name")).trim();
  const envSenderName = process.env.BREVO_SENDER_NAME?.trim();
  const siteName = (await getSetting("site_name")).trim();
  const senderName = dbSenderName || envSenderName || siteName || "Tskconnect";

  return { apiKey, senderEmail, senderName };
}

export interface SendEmailOptions {
  apiKey?: string;
  senderEmail?: string;
  senderName?: string;
  allowSimulation?: boolean;
}

/**
 * Centralized email dispatcher using the Brevo REST API (POST https://api.brevo.com/v3/smtp/email).
 * If no Brevo API key is configured, falls back safely to console logging / simulated ID unless allowSimulation is false.
 */
export async function sendEmail(
  payload: EmailPayload,
  options?: SendEmailOptions
): Promise<{ success: boolean; messageId?: string; error?: string; simulated?: boolean }> {
  const config = await getBrevoConfig();
  const apiKey = (options?.apiKey?.trim()) || config.apiKey;
  const senderEmail = (options?.senderEmail?.trim()) || config.senderEmail;
  const senderName = (options?.senderName?.trim()) || config.senderName;
  const allowSimulation = options?.allowSimulation ?? true;

  if (!apiKey) {
    if (!allowSimulation) {
      return {
        success: false,
        error: "Brevo API key is not configured. Please enter and save your API key in admin settings.",
      };
    }
    const simulatedId = `msg_sim_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    console.log(
      `[Email Service - Simulated] To: ${payload.to} | Subject: ${payload.subject} | ID: ${simulatedId}`
    );
    return { success: true, messageId: simulatedId, simulated: true };
  }

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: {
          name: senderName,
          email: senderEmail,
        },
        to: [
          {
            email: payload.to,
            name: payload.toName || payload.to.split("@")[0],
          },
        ],
        subject: payload.subject,
        htmlContent: payload.html || payload.text.replace(/\n/g, "<br/>"),
        textContent: payload.text,
      }),
    });

    const data = (await res.json().catch(() => null)) as {
      messageId?: string;
      message?: string;
      code?: string;
    } | null;

    if (!res.ok) {
      const errMsg = data?.message || `Brevo request failed with status ${res.status}`;
      console.error(`[Email Service] Brevo delivery error (${res.status}):`, errMsg);
      return { success: false, error: errMsg };
    }

    const messageId = data?.messageId || `brevo_${Date.now()}`;
    console.log(`[Email Service] Delivered via Brevo to ${payload.to} (ID: ${messageId})`);
    return { success: true, messageId };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error dispatching email";
    console.error("[Email Service] Exception sending via Brevo:", error);
    return { success: false, error };
  }
}

/**
 * Sends a password recovery email with a responsive styled HTML template and secure reset link.
 */
export async function sendPasswordResetEmail(
  userEmail: string,
  userName: string,
  resetUrl: string,
  expiryMinutes = 60
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const brandName = (await getSetting("site_name", "Tskconnect")).trim() || "Tskconnect";
  const subject = `Reset your ${brandName} password`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #334155;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0f172a; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 560px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
          <tr>
            <td style="background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%); padding: 32px 32px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">${brandName}</h1>
              <p style="margin: 6px 0 0 0; color: #bae6fd; font-size: 14px;">Password Recovery Request</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 36px 32px 28px 32px;">
              <p style="margin: 0 0 16px 0; font-size: 16px; color: #1e293b; font-weight: 600;">Hello ${userName || "there"},</p>
              <p style="margin: 0 0 24px 0; font-size: 15px; color: #475569; line-height: 1.6;">
                We received a request to reset your password for your <strong>${brandName}</strong> account. Click the button below to choose a new password:
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
                <tr>
                  <td align="center">
                    <a href="${resetUrl}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%); color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 14px 32px; border-radius: 10px; box-shadow: 0 4px 12px rgba(37,99,235,0.3);">
                      Reset My Password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 24px 0 12px 0; font-size: 13px; color: #64748b; line-height: 1.5;">
                This link will expire in <strong>${expiryMinutes} minutes</strong>. If the button above doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin: 0 0 24px 0; font-size: 12px; color: #0284c7; word-break: break-all; background-color: #f1f5f9; padding: 10px 14px; border-radius: 8px;">
                <a href="${resetUrl}" style="color: #0284c7; text-decoration: underline;">${resetUrl}</a>
              </p>
              <div style="border-top: 1px solid #e2e8f0; padding-top: 20px;">
                <p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.5;">
                  If you did not request this password reset, please ignore this email or contact support if you suspect unauthorized access to your account.
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 32px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                &copy; ${new Date().getFullYear()} ${brandName}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const text = `Hello ${userName || "there"},\n\nWe received a request to reset your password for your ${brandName} account.\n\nReset your password here:\n${resetUrl}\n\nThis link is valid for ${expiryMinutes} minutes.\n\nIf you did not make this request, please ignore this email.\n\nBest regards,\nThe ${brandName} Team`;

  return sendEmail({
    to: userEmail,
    toName: userName,
    subject,
    html,
    text,
  });
}

/**
 * Sends a 6-digit OTP code for secure login verification.
 */
export async function sendLoginOtpEmail(
  userEmail: string,
  userName: string,
  otpCode: string,
  expiryMinutes = 10
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const brandName = (await getSetting("site_name", "Tskconnect")).trim() || "Tskconnect";
  const subject = `${otpCode} is your ${brandName} verification code`;
  const formattedOtp = otpCode.split("").join(" ");

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #334155;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0f172a; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 560px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
          <tr>
            <td style="background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%); padding: 32px 32px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">${brandName}</h1>
              <p style="margin: 6px 0 0 0; color: #bae6fd; font-size: 14px;">Sign-in Verification</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 36px 32px 28px 32px;">
              <p style="margin: 0 0 16px 0; font-size: 16px; color: #1e293b; font-weight: 600;">Hello ${userName || "there"},</p>
              <p style="margin: 0 0 24px 0; font-size: 15px; color: #475569; line-height: 1.6;">
                Use the verification code below to complete your sign-in to your <strong>${brandName}</strong> account:
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
                <tr>
                  <td align="center">
                    <div style="display: inline-block; background-color: #f0f9ff; border: 2px dashed #0284c7; border-radius: 12px; padding: 16px 36px; letter-spacing: 10px; font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 700; color: #0369a1; text-align: center;">
                      ${formattedOtp}
                    </div>
                  </td>
                </tr>
              </table>
              <p style="margin: 20px 0 12px 0; font-size: 14px; color: #64748b; line-height: 1.5; text-align: center;">
                This code will expire in <strong>${expiryMinutes} minutes</strong>.
              </p>
              <div style="border-top: 1px solid #e2e8f0; margin-top: 28px; padding-top: 20px;">
                <p style="margin: 0 0 8px 0; font-size: 12px; color: #dc2626; font-weight: 600;">
                  Security Note:
                </p>
                <p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.5;">
                  Never share this code with anyone. Tskconnect staff will never ask for your verification code. If you did not attempt to sign in, please change your password immediately.
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 32px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                &copy; ${new Date().getFullYear()} ${brandName}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const text = `Hello ${userName || "there"},\n\nYour ${brandName} sign-in verification code is: ${otpCode}\n\nThis code expires in ${expiryMinutes} minutes.\n\nNever share this code with anyone. If you did not attempt to sign in, please secure your account immediately.\n\nBest regards,\nThe ${brandName} Team`;

  return sendEmail({
    to: userEmail,
    toName: userName,
    subject,
    html,
    text,
  });
}

export async function sendApiApprovalEmail(userEmail: string, userName: string, businessName: string): Promise<void> {
  const appUrl = (
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://tskconnect.com")
  ).replace(/\/$/, "");

  await sendEmail({
    to: userEmail,
    subject: "Your Tskconnect API Access Has Been Approved!",
    text: `Hello ${userName},\n\nCongratulations! Your developer API access application for "${businessName}" has been approved by the Tskconnect admin team.\n\nYou can now log in to your developer dashboard, generate production API credentials (ck_live_...), configure your webhooks, and start submitting live automated data orders.\n\nDashboard: ${appUrl}/dashboard/api?tab=credentials\nDocs: ${appUrl}/dashboard/api?tab=docs\n\nBest regards,\nThe Tskconnect Team`,
  });
}

export async function sendApiRejectionEmail(userEmail: string, userName: string, businessName: string, reason?: string): Promise<void> {
  await sendEmail({
    to: userEmail,
    subject: "Tskconnect API Application Update",
    text: `Hello ${userName},\n\nThank you for your interest in the Tskconnect Developer API. After reviewing your application for "${businessName}", we are unable to approve production access at this time.\n\n${reason ? `Reason: ${reason}\n\n` : ""}You may update your business details and re-apply from your dashboard.\n\nBest regards,\nThe Tskconnect Team`,
  });
}

export async function sendApiSuspensionEmail(userEmail: string, userName: string, businessName: string, reason?: string): Promise<void> {
  await sendEmail({
    to: userEmail,
    subject: "Notice: Tskconnect API Access Suspended",
    text: `Hello ${userName},\n\nPlease be advised that API access for "${businessName}" has been temporarily suspended.\n\n${reason ? `Details: ${reason}\n\n` : ""}If you believe this was in error, please reach out to our support team.\n\nBest regards,\nThe Tskconnect Team`,
  });
}

export async function sendCredentialCreatedEmail(userEmail: string, userName: string, credentialName: string, keyPrefix: string, env: string): Promise<void> {
  await sendEmail({
    to: userEmail,
    subject: `New Tskconnect API Key Generated: ${credentialName}`,
    text: `Hello ${userName},\n\nA new ${env} API credential "${credentialName}" (${keyPrefix}...) was generated on your account.\n\nIf you did not perform this action, please revoke the key immediately from your Developer Dashboard.\n\nBest regards,\nThe Tskconnect Team`,
  });
}

export async function sendCredentialRevokedEmail(userEmail: string, userName: string, credentialName: string, keyPrefix: string): Promise<void> {
  await sendEmail({
    to: userEmail,
    subject: `Tskconnect API Key Revoked: ${credentialName}`,
    text: `Hello ${userName},\n\nThe API key "${credentialName}" (${keyPrefix}...) on your account has been revoked and can no longer make API requests.\n\nBest regards,\nThe Tskconnect Team`,
  });
}

export async function sendWebhookFailureEmail(userEmail: string, webhookUrl: string, errorDetail: string): Promise<void> {
  await sendEmail({
    to: userEmail,
    subject: "Alert: Tskconnect Webhook Delivery Failures",
    text: `Hello,\n\nWe detected multiple consecutive delivery failures when dispatching order status webhooks to your endpoint:\n\n${webhookUrl}\n\nLast error: ${errorDetail}\n\nPlease check that your server is online, reachable, and responds with an HTTP 2xx status within 10 seconds.\n\nBest regards,\nThe Tskconnect Team`,
  });
}

export async function sendClaimSuccessEmail(
  userEmail: string,
  userName: string,
  amount: number,
  reference: string,
  network: string
): Promise<void> {
  await sendEmail({
    to: userEmail,
    subject: "Your Tskconnect Wallet Top-Up Was Successful",
    text: `Hello ${userName},\n\nYour GHS ${amount.toFixed(2)} Mobile Money payment has been successfully added to your Tskconnect wallet.\n\nTransaction Reference: ${reference}\nNetwork: ${network}\n\nBest regards,\nThe Tskconnect Team`,
  });
}

export async function sendClaimRejectedEmail(
  userEmail: string,
  userName: string,
  reference: string,
  reason: string
): Promise<void> {
  await sendEmail({
    to: userEmail,
    subject: "Tskconnect Mobile Money Claim Update",
    text: `Hello ${userName},\n\nYour claim for Mobile Money transaction ${reference} could not be processed.\n\nReason: ${reason}\n\nIf you need assistance, please verify your transaction details or contact Tskconnect support.\n\nBest regards,\nThe Tskconnect Team`,
  });
}
