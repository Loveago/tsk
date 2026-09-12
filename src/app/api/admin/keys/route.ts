import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { z } from "zod";

export async function GET() {
  try {
    await requireAdmin();
    const [keys, recentLogs] = await Promise.all([
      prisma.apiKey.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
          _count: { select: { logs: true } },
        },
      }),
      prisma.apiRequestLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { apiKey: { select: { name: true, user: { select: { email: true } } } } },
      }),
    ]);
    return NextResponse.json({ keys, recentLogs });
  } catch (err) {
    return handleRouteError(err);
  }
}

const toggleSchema = z.object({ id: z.string(), active: z.boolean() });

export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireAdmin();
    const input = toggleSchema.parse(await request.json());

    const key = await prisma.apiKey.findUnique({ where: { id: input.id } });
    if (!key) return apiError(404, "API key not found");

    await prisma.apiKey.update({
      where: { id: input.id },
      data: { active: input.active },
    });

    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: input.active ? "api_key.enable" : "api_key.disable",
      target: `api_key:${key.id}`,
      newValue: JSON.stringify({ name: key.name, active: input.active }),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
