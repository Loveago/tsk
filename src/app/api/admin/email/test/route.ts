import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { sendEmail, getBrevoConfig } from "@/lib/email";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { z } from "zod";

const testEmailSchema = z.object({
  toEmail: z.string().trim().email("Invalid email address").or(z.literal("")).optional(),
  apiKey: z.string().trim().max(255).optional(),
  senderEmail: z.string().trim().email("Invalid sender email address").or(z.literal("")).optional(),
  senderName: z.string().trim().max(100).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await request.json().catch(() => ({}));
    const input = testEmailSchema.parse(body);

    const config = await getBrevoConfig();
    const effectiveApiKey = input.apiKey?.trim() || config.apiKey;

    if (!effectiveApiKey) {
      return apiError(
        400,
        "No Brevo API key is configured. Please enter your Brevo API key and save changes before testing."
      );
    }

    const recipient = input.toEmail?.trim() || admin.email;
    const res = await sendEmail(
      {
        to: recipient,
        toName: admin.name || "Admin",
        subject: "Tskconnect Email Integration Test",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
            <h2 style="color: #0284c7; margin-top: 0;">Brevo Email Integration Test</h2>
            <p style="color: #334155; font-size: 15px; line-height: 1.6;">
              Congratulations! Your Brevo transactional email configuration is working properly.
            </p>
            <div style="background-color: #f8fafc; border-left: 4px solid #0284c7; padding: 12px 16px; margin: 20px 0; border-radius: 4px;">
              <p style="margin: 0 0 6px 0; font-size: 13px; color: #64748b;">Recipient: <strong style="color: #1e293b;">${recipient}</strong></p>
              <p style="margin: 0; font-size: 13px; color: #64748b;">Dispatched at: <strong style="color: #1e293b;">${new Date().toISOString()}</strong></p>
            </div>
            <p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">
              Sent by Tskconnect Admin Settings Test Tool
            </p>
          </div>
        `,
        text: `Tskconnect Email Integration Test\n\nCongratulations! Your Brevo transactional email configuration is working properly.\n\nRecipient: ${recipient}\nDispatched at: ${new Date().toISOString()}`,
      },
      {
        apiKey: effectiveApiKey,
        senderEmail: input.senderEmail?.trim() || undefined,
        senderName: input.senderName?.trim() || undefined,
        allowSimulation: false, // Must test real Brevo API, never simulate for this test tool
      }
    );

    if (!res.success) {
      return apiError(400, res.error || "Failed to dispatch test email via Brevo.");
    }

    return NextResponse.json({
      ok: true,
      messageId: res.messageId,
      recipient,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
