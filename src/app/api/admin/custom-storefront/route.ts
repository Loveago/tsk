import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { ensureAdminCustomStorefront } from "@/lib/storefront";
import { z } from "zod";

const updateSettingsSchema = z.object({
  name: z.string().min(2).max(64),
  description: z.string().max(250).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  whatsapp: z.string().max(20).optional().nullable(),
  whatsappGroupLink: z.string().url().max(200).optional().nullable().or(z.literal("")),
  location: z.string().max(100).optional().nullable(),
  contactText: z.string().max(100).optional().nullable(),
  whatsappLabel: z.string().max(30).optional().nullable(),
  notice: z.string().max(300).optional().nullable(),
  logoUrl: z.string().url().max(500).optional().nullable().or(z.literal("")),
  bannerUrl: z.string().url().max(500).optional().nullable().or(z.literal("")),
  isActive: z.boolean().optional(),
});

const updateProductSchema = z.object({
  packageId: z.string().min(1),
  sellingPrice: z.number().positive(), // GHS
  isActive: z.boolean().optional(),
});

const bulkProductSchema = z.object({
  packageIds: z.array(z.string().min(1)).min(1),
  markup: z.number(), // GHS to add on top of base cost
});

/**
 * GET: Fetch the custom storefront data (overview stats, settings, products, recent orders)
 */
export async function GET() {
  try {
    const staff = await requireStaff();
    const storefront = await ensureAdminCustomStorefront();
    const { resolveUserWholesalePrice } = await import("@/lib/orders");

    const [
      products,
      allPackages,
      totalOrders,
      completedOrders,
      pendingOrders,
      revenueAgg,
      pendingAgg,
      rawNetworkSettings,
    ] = await Promise.all([
      prisma.storefrontProduct.findMany({
        where: { storefrontId: storefront.id },
        include: { dataPackage: true },
        orderBy: [
          { dataPackage: { network: "asc" } },
          { dataPackage: { gbAmount: "asc" } },
        ],
      }),
      prisma.dataPackage.findMany({
        where: { active: true },
        orderBy: [{ network: "asc" }, { gbAmount: "asc" }, { sortOrder: "asc" }],
      }),
      prisma.storefrontOrder.count({
        where: { storefrontId: storefront.id },
      }),
      prisma.storefrontOrder.count({
        where: { storefrontId: storefront.id, status: "COMPLETED" },
      }),
      prisma.storefrontOrder.count({
        where: { storefrontId: storefront.id, status: "PENDING" },
      }),
      prisma.storefrontOrder.aggregate({
        where: { storefrontId: storefront.id, status: { in: ["COMPLETED", "PROCESSING"] } },
        _sum: { sellingPrice: true, commission: true },
      }),
      prisma.storefrontOrder.aggregate({
        where: { storefrontId: storefront.id, status: "PENDING" },
        _sum: { commission: true },
      }),
      prisma.systemSetting.findMany({
        where: {
          key: {
            in: ["network_mtn_enabled", "network_telecel_enabled", "network_airteltigo_enabled"],
          },
        },
      }),
    ]);

    const sysSettingsMap: Record<string, string> = {};
    for (const s of rawNetworkSettings) sysSettingsMap[s.key] = s.value;

    const networkSettings = {
      mtn: sysSettingsMap.network_mtn_enabled !== "false",
      telecel: sysSettingsMap.network_telecel_enabled !== "false",
      airteltigo: sysSettingsMap.network_airteltigo_enabled !== "false",
    };

    const formattedPackages = await Promise.all(
      allPackages.map(async (pkg) => ({
        id: pkg.id,
        network: pkg.network,
        gbAmount: pkg.gbAmount,
        name: pkg.name,
        cost: await resolveUserWholesalePrice(staff, pkg),
      }))
    );

    const costMap = new Map(formattedPackages.map((p) => [p.id, p.cost]));

    return NextResponse.json({
      storefront,
      products: products.map((p) => ({
        id: p.id,
        packageId: p.packageId,
        network: p.dataPackage.network,
        gbAmount: p.dataPackage.gbAmount,
        packageName: p.dataPackage.name,
        sellingPrice: p.sellingPrice / 100,
        cost: costMap.get(p.packageId) ?? (p.dataPackage.retailPriceGHS ?? 0),
        isActive: p.isActive,
      })),
      packages: formattedPackages,
      networkSettings,
      stats: {
        totalOrders,
        completedOrders,
        pendingOrders,
        totalRevenue: (revenueAgg._sum.sellingPrice ?? 0) / 100,
        totalCommission: (revenueAgg._sum.commission ?? 0) / 100,
        pendingCommission: (pendingAgg._sum.commission ?? 0) / 100,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * PATCH: Update store settings (name, branding, notices, contacts, active status)
 */
export async function PATCH(request: NextRequest) {
  try {
    await requireStaff();
    const storefront = await ensureAdminCustomStorefront();
    const body = await request.json();
    const input = updateSettingsSchema.parse(body);

    const updated = await prisma.storefront.update({
      where: { id: storefront.id },
      data: {
        name: input.name,
        description: input.description ?? null,
        phone: input.phone ?? null,
        whatsapp: input.whatsapp ?? null,
        whatsappGroupLink: input.whatsappGroupLink || null,
        location: input.location ?? null,
        contactText: input.contactText ?? null,
        whatsappLabel: input.whatsappLabel ?? null,
        notice: input.notice !== undefined ? (input.notice?.trim() || null) : undefined,
        logoUrl: input.logoUrl || null,
        bannerUrl: input.bannerUrl || null,
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });

    return NextResponse.json({ storefront: updated });
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * PUT: Update or upsert product pricing specifically for this storefront
 */
export async function PUT(request: NextRequest) {
  try {
    await requireStaff();
    const storefront = await ensureAdminCustomStorefront();
    const body = await request.json();

    if (body.bulk) {
      const input = bulkProductSchema.parse(body);
      const staff = await requireStaff();
      const { resolveUserWholesalePrice } = await import("@/lib/orders");
      const packages = await prisma.dataPackage.findMany({
        where: { id: { in: input.packageIds } },
      });

      await prisma.$transaction(async (tx) => {
        for (const pkg of packages) {
          const cost = await resolveUserWholesalePrice(staff, pkg);
          const sellingPrice = Math.max(100, Math.round((cost + input.markup) * 100));
          await tx.storefrontProduct.upsert({
            where: {
              storefrontId_packageId: {
                storefrontId: storefront.id,
                packageId: pkg.id,
              },
            },
            update: { sellingPrice, isActive: true },
            create: {
              storefrontId: storefront.id,
              packageId: pkg.id,
              sellingPrice,
              isActive: true,
            },
          });
        }
      });
      return NextResponse.json({ success: true, updatedCount: packages.length });
    }

    const input = updateProductSchema.parse(body);
    const sellingPrice = Math.round(input.sellingPrice * 100);

    const product = await prisma.storefrontProduct.upsert({
      where: {
        storefrontId_packageId: {
          storefrontId: storefront.id,
          packageId: input.packageId,
        },
      },
      update: {
        sellingPrice,
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      create: {
        storefrontId: storefront.id,
        packageId: input.packageId,
        sellingPrice,
        isActive: input.isActive ?? true,
      },
    });

    return NextResponse.json({ product });
  } catch (err) {
    return handleRouteError(err);
  }
}
