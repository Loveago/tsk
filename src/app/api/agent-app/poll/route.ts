import { NextRequest, NextResponse } from "next/server";
import {
  getCashoutConfig,
  pullNextCashoutJob,
  verifyAgentAppRequest,
} from "@/lib/cashout";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const timeHeader = request.headers.get("x-agent-time");
  const signHeader = request.headers.get("x-agent-sign");

  if (!(await verifyAgentAppRequest(rawBody, timeHeader, signHeader))) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  try {
    // Parse safely, ignoring unknown fields per spec ({ ready, note })
    if (rawBody) JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const config = await getCashoutConfig();
  if (!config.enabled) {
    return NextResponse.json({
      success: true,
      enabled: false,
      site: config.siteName,
      job: null,
    });
  }

  const job = await pullNextCashoutJob();
  return NextResponse.json({
    success: true,
    enabled: true,
    site: config.siteName,
    job,
  });
}
