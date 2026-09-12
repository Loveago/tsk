import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashApiKey } from "@/lib/api-keys";

export interface ApiKeyContext {
  keyId: string;
  userId: string;
}

export async function requireApiKey(request: NextRequest): Promise<ApiKeyContext> {
  const auth = request.headers.get("authorization") ?? "";
  const raw = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!raw) {
    throw new ApiKeyError("Missing Authorization header. Send: Authorization: Bearer cf_live_…", 401);
  }

  const key = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(raw) },
    include: { user: true },
  });

  if (!key || !key.active) {
    throw new ApiKeyError("Invalid or inactive API key", 401);
  }
  if (key.user.status !== "ACTIVE") {
    throw new ApiKeyError("Account is disabled", 403);
  }

  // Fire-and-forget usage tracking
  prisma.apiKey
    .update({
      where: { id: key.id },
      data: { lastUsedAt: new Date(), requestCount: { increment: 1 } },
    })
    .catch(() => undefined);

  return { keyId: key.id, userId: key.userId };
}

export class ApiKeyError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export async function logApiRequest(
  keyId: string | null,
  endpoint: string,
  method: string,
  status: number,
  success: boolean,
  ip?: string | null
): Promise<void> {
  try {
    await prisma.apiRequestLog.create({
      data: { apiKeyId: keyId, endpoint, method, status, success, ip: ip ?? null },
    });
  } catch {
    // logging must never break the API response
  }
}
