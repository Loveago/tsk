import { NextResponse } from "next/server";
import { destroySession, getSession, getClientIp } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

export async function POST() {
  const session = await getSession();
  await destroySession();
  if (session) {
    await recordAudit({
      userId: session.sub,
      actorLabel: session.email,
      action: "auth.logout",
      target: `user:${session.sub}`,
      ip: await getClientIp(),
    });
  }
  return NextResponse.json({ ok: true });
}
