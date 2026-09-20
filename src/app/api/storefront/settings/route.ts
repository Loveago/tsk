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

    let newSlug: string | undefined = undefined;
    if (input.slug && input.slug.trim() !== storefront.slug) {
      const candidate = slugify(input.slug);
      if (!isValidSlug(candidate) || RESERVED_SLUGS.has(candidate)) {
        return NextResponse.json(
          { error: "Store address must be 3-32 lowercase letters, numbers, and hyphens, and not a reserved word" },
          { status: 400 }
        );
      }
      const taken = await prisma.storefront.findFirst({
        where: { slug: candidate, NOT: { id: storefront.id } },
      });
      if (taken) {
        return NextResponse.json({ error: "That store address is already taken" }, { status: 409 });
      }
      newSlug = candidate;
    }

    const updated = await prisma.storefront.update({
      where: { id: storefront.id },
      data: {
        name: input.storeName,
        ...(newSlug ? { slug: newSlug } : {}),
        description: input.description || null,
        phone: input.phone || null,
        whatsappGroupLink: input.whatsappGroupLink || null,
        whatsapp: input.supportPhone || null,
        contactText: input.contactText || null,
        whatsappLabel: input.whatsappLabel || null,
        notice: input.notice !== undefined ? (input.notice?.trim() || null) : undefined,
        ...(input.isActive !== undefined && storefront.status === "ENABLED"
          ? { isActive: input.isActive }
          : {}),
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
        { error: "Store address must be 3-32 lowercase letters, numbers, and hyphens, and not a reserved word" },
        { status: 400 }
      );
    }
    const taken = await prisma.storefront.findFirst({ where: { slug, NOT: { id: storefront.id } } });
    if (taken) return NextResponse.json({ error: "That store address is already taken" }, { status: 409 });

    const updated = await prisma.storefront.update({ where: { id: storefront.id }, data: { slug } });
    return NextResponse.json({ storefront: updated, message: "Store address updated successfully" });
  } catch (err) {
    return handleRouteError(err);
  }
}
