import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { storefrontStatusToggleSchema } from "@/lib/validation";
import { requireStorefront } from "@/lib/storefront";

/**
 * Reseller storefront status toggle: allows the owner to open or pause/disable
 * their public storefront at any time.
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser();
    const storefront = await requireStorefront(user.id);

    if (storefront.status !== "ENABLED") {
      return apiError(
        403,
        storefront.status === "SUSPENDED"
          ? "Your storefront has been suspended by administration. Contact support to resolve."
          : "Storefront is not active."
      );
    }

    const input = storefrontStatusToggleSchema.parse(await request.json());

    const updated = await prisma.storefront.update({
      where: { id: storefront.id },
      data: { isActive: input.isActive },
    });

    return NextResponse.json({
      success: true,
      isActive: updated.isActive,
      storefront: updated,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
