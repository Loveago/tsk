import { NextResponse } from "next/server";
import { getSignupCodeMode } from "@/lib/signup-codes";
import { handleRouteError } from "@/lib/api-helpers";

export async function GET() {
  try {
    const mode = await getSignupCodeMode();
    return NextResponse.json({ mode });
  } catch (err) {
    return handleRouteError(err);
  }
}

