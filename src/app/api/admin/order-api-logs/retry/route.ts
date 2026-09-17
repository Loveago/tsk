import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { dispatchOrder } from "@/lib/provider-apis/router";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { z } from "zod";

const schema = z.object({
  orderId: z.coerce.number().int().positive(),
});

export async function POST(request: NextRequest) {
  try {
    await requireStaff();
    const body = await request.json();
    const { orderId } = schema.parse(body);

    const result = await dispatchOrder(orderId, { force: true });
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
