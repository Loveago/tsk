import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AuthError } from "@/lib/auth";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { adminStorefrontSchema } from "@/lib/validation";
import {
  ensureWallet,
  isValidSlug,
  slugify,
  RESERVED_SLUGS,
} from "@/lib/storefront";

/** Admin: list all storefronts with owner + wallet summary. */
export async function GET() {
  try {
    await requireAdmin();
    const storefronts = await prisma.storefront.findMany({
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    const wallets = await prisma.storefrontWallet.findMany();
    const balanceByUser = new Map(wallets.map((w) => [w.userId, w]));
    return NextResponse.json({
      storefronts: storefronts.map((s) => ({
        ...s,
        balance: balanceByUser.get(s.userId)?.balance ?? 0,
        pendingBalance: balanceByUser.get(s.userId)?.pendingBalance ?? 0,
      })),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

/** Admin: enable a storefront (with slug), suspend it, or revoke access. */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const input = adminStorefrontSchema.parse(await request.json());

    if (input.action === "APPROVE") {
      // Approve a PENDING application — optionally finalizing the public slug.
      const pending = await prisma.storefront.findUnique({ where: { userId: input.userId } });
      if (!pending || pending.status !== "PENDING") {
        return apiError(404, "No pending application for this user");
      }
      const slug = slugify(input.slug ?? pending.slug);
      if (!isValidSlug(slug) || RESERVED_SLUGS.has(slug)) {
        return apiError(400, "Provide a valid public store address (slug), e.g. kofi-data");
      }
      const taken = await prisma.storefront.findFirst({ where: { slug, NOT: { id: pending.id } } });
      if (taken) return apiError(409, "That store address is already taken");

      const storefront = await prisma.storefront.update({
        where: { id: pending.id },
        data: { status: "ENABLED", slug, rejectionNote: null },
      });
      await ensureWallet(input.userId);
      return NextResponse.json({ storefront });
    }

    if (input.action === "REJECT") {
      const pending = await prisma.storefront.findUnique({ where: { userId: input.userId } });
      if (!pending || pending.status !== "PENDING") {
        return apiError(404, "No pending application for this user");
      }
      const storefront = await prisma.storefront.update({
        where: { id: pending.id },
        data: { status: "REJECTED", rejectionNote: input.note || null },
      });
      return NextResponse.json({ storefront });
    }

    if (input.action === "ENABLE") {
      const slug = slugify(input.slug ?? "");
      if (!isValidSlug(slug) || RESERVED_SLUGS.has(slug)) {
        return apiError(400, "Provide a valid public store address (slug), e.g. kofi-data");
      }
      const taken = await prisma.storefront.findUnique({ where: { slug } });
      if (taken) return apiError(409, "That store address is already taken");

      const target = await prisma.user.findUnique({ where: { id: input.userId } });
      if (!target) return apiError(404, "User not found");

      // Default the public store name to the owner's name; the owner can
      // change it later in Storefront Settings (§11).
      const storefront = await prisma.storefront.upsert({
        where: { userId: input.userId },
        update: { status: "ENABLED", slug },
        create: { userId: input.userId, slug, name: target.name, status: "ENABLED" },
      });
      await ensureWallet(input.userId);
      return NextResponse.json({ storefront });
    }

    const existing = await prisma.storefront.findUnique({ where: { userId: input.userId } });
    if (!existing) return apiError(404, "This user has no storefront");

    if (input.action === "SUSPEND") {
      const storefront = await prisma.storefront.update({
        where: { id: existing.id },
        data: { status: "SUSPENDED" },
      });
      return NextResponse.json({ storefront });
    }

    // REVOKE — store stays visible to its owner but the public page closes
    // and new sales stop (§6). Wallet + history are preserved.
    const storefront = await prisma.storefront.update({
      where: { id: existing.id },
      data: { status: "NOT_ENABLED" },
    });
    return NextResponse.json({ storefront });
  } catch (err) {
    return handleRouteError(err);
  }
}
