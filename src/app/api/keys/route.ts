import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { generateApiKey, hashApiKey } from "@/lib/api-keys";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function GET() {
  try {
    const user = await requireUser();
    const keys = await prisma.apiKey.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        prefix: true,
        active: true,
        lastUsedAt: true,
        requestCount: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ keys });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Default key";

    const count = await prisma.apiKey.count({ where: { userId: user.id, active: true } });
    if (count >= 5) return apiError(400, "Maximum of 5 active keys reached");

    const generated = generateApiKey("live");
    const key = await prisma.apiKey.create({
      data: {
        name,
        prefix: generated.prefix,
        keyHash: hashApiKey(generated.key),
        userId: user.id,
      },
    });

    await recordAudit({
      userId: user.id,
      actorLabel: user.email,
      action: "api_key.create",
      target: `api_key:${key.id}`,
      newValue: JSON.stringify({ name }),
    });

    // Full key is shown exactly once
    return NextResponse.json({ key: { ...key, secret: generated.key } });
  } catch (err) {
    return handleRouteError(err);
  }
}
