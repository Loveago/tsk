import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { z } from "zod";

const updateSchema = z.object({
  status: z.enum(["ACTIVE", "DISABLED", "REVOKED"]).optional(),
  scopes: z.string().optional(),
  rateLimitPerMin: z.coerce.number().int().min(5).max(1000).optional(),
  dailyLimit: z.coerce.number().int().min(100).max(100000).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await request.json();
    const input = updateSchema.parse(body);

    const credential = await prisma.apiCredential.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!credential) {
      return apiError(404, "Credential not found");
    }

    const updated = await prisma.apiCredential.update({
      where: { id },
      data: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.scopes ? { scopes: input.scopes } : {}),
        ...(input.rateLimitPerMin !== undefined ? { rateLimitPerMin: input.rateLimitPerMin } : {}),
        ...(input.dailyLimit !== undefined ? { dailyLimit: input.dailyLimit } : {}),
      },
    });

    await recordAudit({
      userId: admin.id,
      actorLabel: admin.email,
      action: "admin.api_credential.update",
      target: `api_credential:${credential.id}`,
      previousValue: JSON.stringify({
        status: credential.status,
        rateLimit: credential.rateLimitPerMin,
        scopes: credential.scopes,
      }),
      newValue: JSON.stringify(input),
    });

    return NextResponse.json({
      success: true,
      credential: updated,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
