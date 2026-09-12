import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { settingsSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleRouteError } from "@/lib/api-helpers";

export async function GET() {
  try {
    await requireAdmin();
    const settings = await prisma.systemSetting.findMany();
    const map: Record<string, string> = {};
    for (const s of settings) map[s.key] = s.value;
    return NextResponse.json({ settings: map });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireAdmin();
    const body = await request.json();
    const input = settingsSchema.parse(body);

    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) continue;
      const strValue = String(value);
      await prisma.systemSetting.upsert({
        where: { key },
        update: { value: strValue },
        create: { key, value: strValue },
      });
    }

    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: "settings.update",
      target: "settings",
      newValue: JSON.stringify(input),
    });

    const settings = await prisma.systemSetting.findMany();
    const map: Record<string, string> = {};
    for (const s of settings) map[s.key] = s.value;
    return NextResponse.json({ settings: map });
  } catch (err) {
    return handleRouteError(err);
  }
}
