import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { signupCodeBulkSchema } from "@/lib/validation";
import { bulkGenerateSignupCodes } from "@/lib/signup-codes";
import { recordAudit } from "@/lib/audit";
import { handleRouteError } from "@/lib/api-helpers";

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdmin();
    const body = await request.json();
    const input = signupCodeBulkSchema.parse(body);

    const generated = await bulkGenerateSignupCodes({
      quantity: input.quantity,
      prefix: input.prefix,
      length: input.length,
      maxUses: input.maxUses ?? null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      notes: input.notes || null,
      createdBy: actor.email,
    });

    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: "signup_code.bulk_generate",
      target: "signup-codes",
      newValue: JSON.stringify({ count: generated.length, prefix: input.prefix }),
    });

    return NextResponse.json({
      success: true,
      count: generated.length,
      codes: generated,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

