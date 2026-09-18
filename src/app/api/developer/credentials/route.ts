import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { generateApiKey } from "@/lib/api-keys";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { z } from "zod";

const createCredentialSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(60),
  environment: z.enum(["PRODUCTION", "SANDBOX"]).default("PRODUCTION"),
});

export async function GET() {
  try {
    const user = await requireUser();
    const credentials = await prisma.apiCredential.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        environment: true,
        keyPrefix: true,
        status: true,
        scopes: true,
        rateLimitPerMin: true,
        dailyLimit: true,
        requestCount: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ credentials });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const input = createCredentialSchema.parse(body);

    const application = await prisma.apiApplication.findUnique({
      where: { userId: user.id },
    });

    // Verification: Only APPROVED users can create PRODUCTION credentials
    if (input.environment === "PRODUCTION") {
      if (!application || application.status !== "APPROVED" || !application.productionAccess) {
        const appStatus = application ? application.status : "NOT_APPLIED";
        return apiError(
          403,
          `Production credentials require an APPROVED API application. Your current status is: ${appStatus}`
        );
      }
    } else {
      if (application && !application.sandboxAccess) {
        return apiError(403, "Sandbox access is disabled for this account");
      }
    }

    const count = await prisma.apiCredential.count({
      where: { userId: user.id, status: { not: "REVOKED" } },
    });

    if (count >= 10) {
      return apiError(400, "Maximum limit of 10 API credentials reached");
    }

    const envParam = input.environment === "SANDBOX" ? "test" : "live";
    const generated = generateApiKey(envParam, "ck");

    const credential = await prisma.apiCredential.create({
      data: {
        userId: user.id,
        name: input.name,
        environment: input.environment,
        keyPrefix: generated.prefix,
        keyHash: generated.keyHash,
        status: "ACTIVE",
        scopes: application?.allowedScopes || "networks:read,packages:read,orders:create,orders:read,orders:status,orders:bulk_status,balance:read,webhooks:read,webhooks:manage,numbers:verify",
        rateLimitPerMin: application?.rateLimitPerMin || 60,
        dailyLimit: application?.dailyRequestLimit || 5000,
        allowedIps: application?.ipRestrictions || null,
      },
    });

    await recordAudit({
      userId: user.id,
      actorLabel: user.email,
      action: "api_credential.create",
      target: `api_credential:${credential.id}`,
      newValue: JSON.stringify({
        name: input.name,
        environment: input.environment,
        prefix: generated.prefix,
      }),
    });

    return NextResponse.json({
      success: true,
      credential: {
        id: credential.id,
        name: credential.name,
        environment: credential.environment,
        keyPrefix: credential.keyPrefix,
        status: credential.status,
        scopes: credential.scopes,
        createdAt: credential.createdAt,
      },
      apiKey: generated.key, // Exposed once at creation
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
