import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { phoneSchema } from "@/lib/validation";
import { requireStorefront } from "@/lib/storefront";

/** Owner: save the default MoMo payout account (§27/§28). */
export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser();
    await requireStorefront(user.id);
    const body = (await request.json()) as {
      payoutNetwork?: string;
      payoutNumber?: string;
      payoutAccountName?: string;
    };

    const network = ["MTN", "TELECEL", "AIRTELTIGO"].includes(body.payoutNetwork ?? "")
      ? body.payoutNetwork
      : null;
    const momoNumber = body.payoutNumber ? phoneSchema.parse(body.payoutNumber) : "";
    const accountName = (body.payoutAccountName ?? "").trim().slice(0, 80);

    if (momoNumber && (!network || !accountName)) {
      return apiError(400, "Account name and network are required with a MoMo number");
    }

    const updated = await prisma.storefront.update({
      where: { id: (await requireStorefront(user.id)).id },
      data: {
        payoutNetwork: network,
        payoutNumber: momoNumber || null,
        payoutAccountName: accountName || null,
      },
    });
    return NextResponse.json({ storefront: updated });
  } catch (err) {
    return handleRouteError(err);
  }
}
