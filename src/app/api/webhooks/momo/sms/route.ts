import { NextRequest, NextResponse } from "next/server";
import { verifyForwarderSecret, processIncomingForwardedSms } from "@/lib/send-claim";
import { apiError, handleRouteError } from "@/lib/api-helpers";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const secretHeader = request.headers.get("x-forwarder-secret");
    const token = authHeader || secretHeader;

    if (!verifyForwarderSecret(token)) {
      return apiError(401, "Unauthorized SMS forwarder request");
    }

    let body: Record<string, unknown> = {};
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      body = await request.json();
    } else {
      const rawText = await request.text();
      try {
        body = JSON.parse(rawText);
      } catch {
        body = { message: rawText };
      }
    }

    const rawSms =
      (body.message as string) ||
      (body.body as string) ||
      (body.text as string) ||
      (body.content as string) ||
      (body.sms as string) ||
      "";

    if (!rawSms || typeof rawSms !== "string" || !rawSms.trim()) {
      return apiError(400, "Missing SMS message content");
    }

    const senderPhone = (body.from as string) || (body.sender as string) || null;
    const recipientPhone = (body.recipient as string) || (body.to as string) || null;
    const networkHint = (body.network as string) || null;

    // Prevent SMS spoofing/injection from regular phone numbers.
    // Official MoMo messages come from alphanumeric sender IDs (e.g., MobileMoney, TelecelCash).
    if (senderPhone && /^\+?\d{9,}$/.test(senderPhone.replace(/\s+/g, ""))) {
      return apiError(403, "Rejected: SMS appears to be from a standard phone number rather than an official MoMo shortcode.");
    }

    const result = await processIncomingForwardedSms({
      rawSms: rawSms.trim(),
      senderPhone: senderPhone ? String(senderPhone) : null,
      recipientPhone: recipientPhone ? String(recipientPhone) : null,
      networkHint: networkHint ? String(networkHint) : null,
      source: "SMS_FORWARDER",
    });

    return NextResponse.json({
      received: true,
      ...result,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

