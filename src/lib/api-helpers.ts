import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "./auth";

export function apiError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export function zodFail(err: ZodError) {
  return NextResponse.json(
    { error: err.errors[0]?.message ?? "Invalid input" },
    { status: 400 }
  );
}

export function handleRouteError(err: unknown) {
  if (err instanceof ZodError) return zodFail(err);
  if (err instanceof AuthError) return apiError(err.status, err.message);
  const message = err instanceof Error ? err.message : "Something went wrong";
  console.error("[api]", err);
  return apiError(500, message);
}
