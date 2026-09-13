import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { storefrontApplySchema } from "@/lib/validation";
import {
  isValidSlug,
  slugify,
  RESERVED_SLUGS,
} from "@/lib/storefront";

/** Generates a unique, valid public address for a new application. */
async function generateUniqueSlug(storeName: string): Promise<string> {
  const base = slugify(storeName) || "store";
  const candidates = [base, `${base}-store`, `${base}-gh`];
  for (let i = 2; candidates.length < 12; i++) candidates.push(`${base}-${i}`);
  for (const candidate of candidates) {
    if (!isValidSlug(candidate) || RESERVED_SLUGS.has(candidate)) continue;
    const taken = await prisma.storefront.findUnique({ where: { slug: candidate } });
    if (!taken) return candidate;
  }
  // Extremely unlikely fallback: timestamp suffix always fits the 32-char cap
  return `${base.slice(0, 19)}-${Date.now().toString(36)}`;
}

/**
 * User-side store application (§4): the user submits their store name and the
 * application enters PENDING review. Admins approve (assigning the final slug)
 * or reject with a note. Rejected users may re-apply with a new name.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();

    const storefrontEnabledSetting = await prisma.systemSetting.findUnique({
      where: { key: "storefront_feature_enabled" },
    });
    if (storefrontEnabledSetting?.value === "false") {
      return apiError(503, "Storefront applications are currently disabled by administrator.");
    }

    const input = storefrontApplySchema.parse(await request.json());

    const existing = await prisma.storefront.findUnique({ where: { userId: user.id } });
    if (existing) {
      if (existing.status === "PENDING") {
        return apiError(409, "Your application is already awaiting review");
      }
      if (existing.status === "ENABLED" || existing.status === "SUSPENDED") {
        return apiError(409, "You already have an active storefront");
      }
    }

    const slug = await generateUniqueSlug(input.storeName);
    const storefront = existing
      ? // REJECTED (or revoked) — re-apply refreshes the application
        await prisma.storefront.update({
          where: { id: existing.id },
          data: {
            name: input.storeName,
            phone: input.contactNumber,
            whatsappGroupLink: input.whatsappGroupLink,
            description: input.description || null,
            status: "PENDING",
            rejectionNote: null,
          },
        })
      : await prisma.storefront.create({
          data: {
            userId: user.id,
            slug,
            name: input.storeName,
            phone: input.contactNumber,
            whatsappGroupLink: input.whatsappGroupLink,
            description: input.description || null,
            status: "PENDING",
          },
        });

    return NextResponse.json({ storefront }, { status: existing ? 200 : 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
