import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { dispatchOrdersBatch } from "@/lib/provider-apis/router";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { z } from "zod";

const schema = z.object({
  orderIds: z.array(z.coerce.number().int().positive()).min(1),
});

export async function POST(request: NextRequest) {
  try {
    await requireStaff();
    const body = await request.json();
    const { orderIds } = schema.parse(body);

    const result = await dispatchOrdersBatch(orderIds);
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
