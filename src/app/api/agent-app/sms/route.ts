import { NextRequest, NextResponse } from "next/server";
import { settleCashoutFromSms, verifyAgentAppRequest } from "@/lib/cashout";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const timeHeader = request.headers.get("x-agent-time");
  const signHeader = request.headers.get("x-agent-sign");

  if (!(await verifyAgentAppRequest(rawBody, timeHeader, signHeader))) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  let data: { body?: string; sender?: string; time?: number };
  try {
    data = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof data.body !== "string" || !data.body.trim()) {
    return NextResponse.json({ success: true });
  }

  await settleCashoutFromSms({
    body: data.body,
    sender: typeof data.sender === "string" ? data.sender : null,
    time: typeof data.time === "number" ? data.time : null,
  });

  // Always ack { success: true } so it isn't re-delivered
  return NextResponse.json({ success: true });
}
