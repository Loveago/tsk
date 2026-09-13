import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { mtnVerificationSubmitSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import {
  submitVerificationRequest,
  getMtnVerificationInstructions,
  isMtnVerificationEnabled,
} from "@/lib/mtn-verification";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));
    const status = searchParams.get("status");
    const q = searchParams.get("q")?.trim();

    const where: Record<string, unknown> = { userId: user.id };
    if (status && status !== "ALL") {
      where.status = status;
    }
    if (q) {
      where.normalizedNumber = { contains: q };
    }

    const [items, total, instructions, enabled] = await Promise.all([
      prisma.mtnVerificationRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          batch: {
            select: { batchReference: true, status: true },
          },
        },
      }),
      prisma.mtnVerificationRequest.count({ where }),
      getMtnVerificationInstructions(),
      isMtnVerificationEnabled(),
    ]);

    return NextResponse.json({
      data: items,
      total,
      page,
      pageSize,
      pages: Math.ceil(total / pageSize),
      instructions,
      verificationEnabled: enabled,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();

    // Rate limiting (§23)
    const rl = rateLimit(`mtn_submit:${user.id}`, 20, 60_000);
    if (!rl.allowed) {
      return apiError(429, "Too many verification requests. Please wait a minute before submitting again.");
    }

    const body = await request.json();
    const input = mtnVerificationSubmitSchema.parse(body);

    const result = await submitVerificationRequest(
      user.id,
      input.phoneNumber,
      user.email
    );

    return NextResponse.json({
      success: true,
      status: result.status,
      message: result.message,
      request: result.request ?? null,
    });
  } catch (err: any) {
    if (err.message && !err.status) {
      return apiError(400, err.message);
    }
    return handleRouteError(err);
  }
}
