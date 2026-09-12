import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { storefrontProductUpsertSchema, storefrontBulkPricingSchema } from "@/lib/validation";
import { requireStorefront, getMarkupBounds, toPesewas, fromPesewas } from "@/lib/storefront";

function validateMarkup(price: number, cost: number, minP: number, maxP: number) {
  const markupP = price - cost;
  return markupP >= minP && (maxP === Number.MAX_SAFE_INTEGER || markupP <= maxP);
}

/** Owner product list with computed markup for the pricing screen. */
export async function GET() {
  try {
    const user = await requireUser();
    const storefront = await requireStorefront(user.id);
    const products = await prisma.storefrontProduct.findMany({
      where: { storefrontId: storefront.id },
      include: { dataPackage: true },
      orderBy: [{ dataPackage: { sortOrder: "asc" } }],
    });
    return NextResponse.json({ products });
  } catch (err) {
    return handleRouteError(err);
  }
}

/** Create or update one product's retail price (validated against bounds). */
export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser();
    const storefront = await requireStorefront(user.id);
    if (storefront.status !== "ENABLED") return apiError(403, "Storefront is not active");
    const input = storefrontProductUpsertSchema.parse(await request.json());

    const pkg = await prisma.dataPackage.findUnique({ where: { id: input.packageId } });
    if (!pkg) return apiError(404, "Package not found");

    const bounds = await getMarkupBounds();
    const sellingPrice = toPesewas(input.sellingPrice);
    const cost = toPesewas(pkg.retailPriceGHS ?? 0);
    if (sellingPrice < cost) {
      return apiError(400, `Price must be at least GHS ${fromPesewas(cost).toFixed(2)} (cost)`);
    }
    if (!validateMarkup(sellingPrice, cost, bounds.minMarkupP, bounds.maxMarkupP)) {
      return apiError(
        400,
        `Markup must be between GHS ${fromPesewas(bounds.minMarkupP).toFixed(2)} and ${
          bounds.maxMarkupP === Number.MAX_SAFE_INTEGER
            ? "unlimited"
            : `GHS ${fromPesewas(bounds.maxMarkupP).toFixed(2)}`
        }`
      );
    }

    const product = await prisma.storefrontProduct.upsert({
      where: { storefrontId_packageId: { storefrontId: storefront.id, packageId: input.packageId } },
      update: { sellingPrice, isActive: input.isActive },
      create: {
        storefrontId: storefront.id,
        packageId: input.packageId,
        sellingPrice,
        isActive: input.isActive,
      },
    });
    return NextResponse.json({ product });
  } catch (err) {
    return handleRouteError(err);
  }
}

/** Bulk markup: apply one markup % on top of cost for the selected packages. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const storefront = await requireStorefront(user.id);
    if (storefront.status !== "ENABLED") return apiError(403, "Storefront is not active");
    const input = storefrontBulkPricingSchema.parse(await request.json());

    const bounds = await getMarkupBounds();
    const packages = await prisma.dataPackage.findMany({
      where: { id: { in: input.packageIds } },
    });
    const markupP = toPesewas(input.markupPercent);

    await prisma.$transaction(
      packages.map((pkg) => {
        const cost = toPesewas(pkg.retailPriceGHS ?? 0);
        let price = cost + markupP;
        if (price < cost + bounds.minMarkupP) price = cost + bounds.minMarkupP;
        if (bounds.maxMarkupP !== Number.MAX_SAFE_INTEGER && price > cost + bounds.maxMarkupP) {
          price = cost + bounds.maxMarkupP;
        }
        return prisma.storefrontProduct.upsert({
          where: { storefrontId_packageId: { storefrontId: storefront.id, packageId: pkg.id } },
          update: { sellingPrice: price },
          create: {
            storefrontId: storefront.id,
            packageId: pkg.id,
            sellingPrice: price,
            isActive: true,
          },
        });
      })
    );
    return NextResponse.json({ updated: packages.length });
  } catch (err) {
    return handleRouteError(err);
  }
}

/** Deactivate a product (rows are kept for order history). */
export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUser();
    const storefront = await requireStorefront(user.id);
    const { packageId } = (await request.json()) as { packageId?: string };
    if (!packageId) return apiError(400, "packageId is required");

    await prisma.storefrontProduct.updateMany({
      where: { storefrontId: storefront.id, packageId },
      data: { isActive: false },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
