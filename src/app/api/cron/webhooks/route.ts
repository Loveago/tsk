import { NextRequest, NextResponse } from "next/server";
import { processDueWebhookRetries } from "@/lib/webhooks";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10) || 50));
    const result = await processDueWebhookRetries(limit);

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || "Failed to process webhook retries" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
