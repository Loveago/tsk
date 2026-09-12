import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { generateApiKey } from "@/lib/api-keys";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { z } from "zod";

const actionSchema = z.object({
  action: z.enum(["DISABLE", "ENABLE", "REVOKE", "ROTATE"]),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await request.json();
    const { action } = actionSchema.parse(body);

    const credential = await prisma.apiCredential.findFirst({
      where: { id, userId: user.id },
    });

    if (!credential) {
      return apiError(404, "Credential not found");
    }

    if (credential.status === "REVOKED" && action !== "REVOKE") {
      return apiError(400, "Revoked credentials cannot be modified");
    }

    let newStatus = credential.status;
    let newKey: string | null = null;
    let updateData: any = {};

    if (action === "DISABLE") {
      newStatus = "DISABLED";
      updateData.status = newStatus;
    } else if (action === "ENABLE") {
      newStatus = "ACTIVE";
      updateData.status = newStatus;
    } else if (action === "REVOKE") {
      newStatus = "REVOKED";
      updateData.status = newStatus;
    } else if (action === "ROTATE") {
      const envParam = credential.environment === "SANDBOX" ? "test" : "live";
      const generated = generateApiKey(envParam, "ck");
      newKey = generated.key;
      updateData.keyPrefix = generated.prefix;
      updateData.keyHash = generated.keyHash;
      updateData.status = "ACTIVE";
      newStatus = "ACTIVE";
    }

    const updated = await prisma.apiCredential.update({
      where: { id: credential.id },
      data: updateData,
    });

    await recordAudit({
      userId: user.id,
      actorLabel: user.email,
      action: `api_credential.${action.toLowerCase()}`,
      target: `api_credential:${credential.id}`,
      previousValue: credential.status,
      newValue: newStatus,
    });

    return NextResponse.json({
      success: true,
      credential: {
        id: updated.id,
        name: updated.name,
        environment: updated.environment,
        keyPrefix: updated.keyPrefix,
        status: updated.status,
        lastUsedAt: updated.lastUsedAt,
      },
      ...(newKey ? { newApiKey: newKey } : {}),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
