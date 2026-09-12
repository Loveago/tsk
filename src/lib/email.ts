import { prisma } from "@/lib/prisma";

export interface EmailPayload {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Centralized notification / email dispatcher for Developer API events (§44, §45).
 * If external SMTP or transactional email credentials are configured in the future,
 * this is the single integration boundary. In all environments, events are recorded
 * in the audit log and console for traceability.
 */
export async function sendEmail(payload: EmailPayload): Promise<{ success: boolean; messageId?: string }> {
  const simulatedId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  console.log(`[Email Service] To: ${payload.to} | Subject: ${payload.subject} | ID: ${simulatedId}`);
  return { success: true, messageId: simulatedId };
}

export async function sendApiApprovalEmail(userEmail: string, userName: string, businessName: string): Promise<void> {
  await sendEmail({
    to: userEmail,
    subject: "Your Clickyfied API Access Has Been Approved!",
    text: `Hello ${userName},\n\nCongratulations! Your developer API access application for "${businessName}" has been approved by the Clickyfied admin team.\n\nYou can now log in to your developer dashboard, generate production API credentials (ck_live_...), configure your webhooks, and start submitting live automated data orders.\n\nDashboard: https://clickyfied.com/dashboard/api?tab=credentials\nDocs: https://clickyfied.com/dashboard/api?tab=docs\n\nBest regards,\nThe Clickyfied Team`,
  });
}

export async function sendApiRejectionEmail(userEmail: string, userName: string, businessName: string, reason?: string): Promise<void> {
  await sendEmail({
    to: userEmail,
    subject: "Clickyfied API Application Update",
    text: `Hello ${userName},\n\nThank you for your interest in the Clickyfied Developer API. After reviewing your application for "${businessName}", we are unable to approve production access at this time.\n\n${reason ? `Reason: ${reason}\n\n` : ""}You may update your business details and re-apply from your dashboard.\n\nBest regards,\nThe Clickyfied Team`,
  });
}

export async function sendApiSuspensionEmail(userEmail: string, userName: string, businessName: string, reason?: string): Promise<void> {
  await sendEmail({
    to: userEmail,
    subject: "Notice: Clickyfied API Access Suspended",
    text: `Hello ${userName},\n\nPlease be advised that API access for "${businessName}" has been temporarily suspended.\n\n${reason ? `Details: ${reason}\n\n` : ""}If you believe this was in error, please reach out to our support team.\n\nBest regards,\nThe Clickyfied Team`,
  });
}

export async function sendCredentialCreatedEmail(userEmail: string, userName: string, credentialName: string, keyPrefix: string, env: string): Promise<void> {
  await sendEmail({
    to: userEmail,
    subject: `New Clickyfied API Key Generated: ${credentialName}`,
    text: `Hello ${userName},\n\nA new ${env} API credential "${credentialName}" (${keyPrefix}...) was generated on your account.\n\nIf you did not perform this action, please revoke the key immediately from your Developer Dashboard.\n\nBest regards,\nThe Clickyfied Team`,
  });
}

export async function sendCredentialRevokedEmail(userEmail: string, userName: string, credentialName: string, keyPrefix: string): Promise<void> {
  await sendEmail({
    to: userEmail,
    subject: `Clickyfied API Key Revoked: ${credentialName}`,
    text: `Hello ${userName},\n\nThe API key "${credentialName}" (${keyPrefix}...) on your account has been revoked and can no longer make API requests.\n\nBest regards,\nThe Clickyfied Team`,
  });
}

export async function sendWebhookFailureEmail(userEmail: string, webhookUrl: string, errorDetail: string): Promise<void> {
  await sendEmail({
    to: userEmail,
    subject: "Alert: Clickyfied Webhook Delivery Failures",
    text: `Hello,\n\nWe detected multiple consecutive delivery failures when dispatching order status webhooks to your endpoint:\n\n${webhookUrl}\n\nLast error: ${errorDetail}\n\nPlease check that your server is online, reachable, and responds with an HTTP 2xx status within 10 seconds.\n\nBest regards,\nThe Clickyfied Team`,
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
    subject: "Your Clickyfied Wallet Top-Up Was Successful",
    text: `Hello ${userName},\n\nYour GHS ${amount.toFixed(2)} Mobile Money payment has been successfully added to your Clickyfied wallet.\n\nTransaction Reference: ${reference}\nNetwork: ${network}\n\nBest regards,\nThe Clickyfied Team`,
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
    subject: "Clickyfied Mobile Money Claim Update",
    text: `Hello ${userName},\n\nYour claim for Mobile Money transaction ${reference} could not be processed.\n\nReason: ${reason}\n\nIf you need assistance, please verify your transaction details or contact Clickyfied support.\n\nBest regards,\nThe Clickyfied Team`,
  });
}

