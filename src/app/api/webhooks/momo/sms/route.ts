import { NextRequest, NextResponse } from "next/server";
import { verifyForwarderSecret, processIncomingForwardedSms } from "@/lib/send-claim";
import { apiError, handleRouteError } from "@/lib/api-helpers";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const secretHeader = request.headers.get("x-forwarder-secret");
    const apiKeyHeader = request.headers.get("x-api-key");
    const querySecret = request.nextUrl.searchParams.get("secret") || request.nextUrl.searchParams.get("token");
    const token = authHeader || secretHeader || apiKeyHeader || querySecret;

    if (!verifyForwarderSecret(token)) {
      console.warn("[MOMO_WEBHOOK] Unauthorized forwarder request. Token provided:", token ? "YES (masked)" : "NONE");
      return apiError(401, "Unauthorized SMS forwarder request. Please check your SMS forwarder secret token.");
    }

    let body: Record<string, unknown> = {};
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      try {
        body = await request.json();
      } catch {
        const rawText = await request.text();
        try {
          body = JSON.parse(rawText);
        } catch {
          body = { message: rawText };
        }
      }
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const rawText = await request.text();
      const params = new URLSearchParams(rawText);
      body = Object.fromEntries(params.entries());
    } else {
      const rawText = await request.text();
      try {
        body = JSON.parse(rawText);
      } catch {
        // Fallback for key-value or raw plain text
        if (
          rawText.includes("=") &&
          (rawText.includes("&") ||
            rawText.startsWith("message=") ||
            rawText.startsWith("content=") ||
            rawText.startsWith("body=") ||
            rawText.startsWith("msg="))
        ) {
          const params = new URLSearchParams(rawText);
          body = Object.fromEntries(params.entries());
        } else {
          body = { message: rawText };
        }
      }
    }

    const rawSms =
      (body.message as string) ||
      (body.body as string) ||
      (body.text as string) ||
      (body.content as string) ||
      (body.sms as string) ||
      (body.msg as string) ||
      (body.textMsg as string) ||
      (body.desp as string) ||
      (body.data as string) ||
      "";

    if (!rawSms || typeof rawSms !== "string" || !rawSms.trim()) {
      return apiError(400, "Missing SMS message content");
    }

    const senderPhone = (body.from as string) || (body.sender as string) || null;
    const recipientPhone = (body.recipient as string) || (body.to as string) || null;
    const networkHint = (body.network as string) || null;

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
