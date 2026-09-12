import { NextRequest, NextResponse } from "next/server";
import { validateSignupCode, getSignupCodeMode } from "@/lib/signup-codes";
import { handleRouteError } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code")?.trim();

    const mode = await getSignupCodeMode();
    if (mode === "DISABLED") {
      return NextResponse.json({ valid: true, note: "Codes disabled" });
    }

    if (!code) {
      return NextResponse.json({
        valid: mode !== "REQUIRED",
        message: mode === "REQUIRED" ? "Signup code is required" : undefined,
      });
    }

    const result = await validateSignupCode(code);
    return NextResponse.json({
      valid: result.valid,
      message: result.valid ? "Valid signup code" : (result.message || "Invalid or expired signup code"),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const code = (body.code as string)?.trim();

    const mode = await getSignupCodeMode();
    if (mode === "DISABLED") {
      return NextResponse.json({ valid: true, note: "Codes disabled" });
    }

    if (!code) {
      return NextResponse.json({
        valid: mode !== "REQUIRED",
        message: mode === "REQUIRED" ? "Signup code is required" : undefined,
      });
    }

    const result = await validateSignupCode(code);
    return NextResponse.json({
      valid: result.valid,
      message: result.valid ? "Valid signup code" : (result.message || "Invalid or expired signup code"),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

