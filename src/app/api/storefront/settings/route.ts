import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";
import { storefrontSettingsSchema } from "@/lib/validation";
import { requireStorefront, isValidSlug, slugify, RESERVED_SLUGS } from "@/lib/storefront";

/** Returns (and lazily fixes) the owner's storefront settings. */
export async function GET() {
  try {
    const user = await requireUser();
    const storefront = await requireStorefront(user.id);
    return NextResponse.json({ storefront });
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * Updates the store profile. The storeName may also seed a slug change —
 * the slug is normalized and validated for collisions (§5).
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser();
    const storefront = await requireStorefront(user.id);
    const input = storefrontSettingsSchema.parse(await request.json());

    const updated = await prisma.storefront.update({
      where: { id: storefront.id },
      data: {
        name: input.storeName,
        description: input.description || null,
        whatsapp: input.supportPhone || null,
        contactText: input.contactText || null,
        whatsappLabel: input.whatsappLabel || null,
      },
    });
    return NextResponse.json({ storefront: updated });
  } catch (err) {
    return handleRouteError(err);
  }
}

/** Slug availability check + change (admin assigns initial slug on enable). */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const storefront = await requireStorefront(user.id);
    const body = (await request.json()) as { slug?: string };
    const slug = slugify(body.slug ?? "");
    if (!isValidSlug(slug) || RESERVED_SLUGS.has(slug)) {
      return NextResponse.json(
        { error: "Slug must be 3-32 letters/numbers/dashes and not a reserved word" },
        { status: 400 }
      );
    }
    const taken = await prisma.storefront.findFirst({ where: { slug, NOT: { id: storefront.id } } });
    if (taken) return NextResponse.json({ error: "That store address is taken" }, { status: 409 });

    const updated = await prisma.storefront.update({ where: { id: storefront.id }, data: { slug } });
    return NextResponse.json({ storefront: updated });
  } catch (err) {
    return handleRouteError(err);
  }
}
