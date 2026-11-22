import { NextRequest, NextResponse } from "next/server";
import { reportCashoutJob, verifyAgentAppRequest } from "@/lib/cashout";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const timeHeader = request.headers.get("x-agent-time");
  const signHeader = request.headers.get("x-agent-sign");

  if (!(await verifyAgentAppRequest(rawBody, timeHeader, signHeader))) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  let data: { id?: number | string; ok?: boolean; text?: string };
  try {
    data = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const jobId = Number(data.id);
  if (!Number.isInteger(jobId) || jobId <= 0) {
    return NextResponse.json({ success: false, error: "Invalid job id" }, { status: 400 });
  }

  await reportCashoutJob({
    id: jobId,
    ok: Boolean(data.ok),
    text: typeof data.text === "string" ? data.text : null,
  });

  return NextResponse.json({ success: true });
}
