import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { requireActiveStorefront, getMarkupBounds } from "@/lib/storefront";
import { resolveUserWholesalePrice } from "@/lib/orders";
import { PricingEditor } from "./pricing-editor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function StorefrontProductsPage() {
  const user = await requireUser();
  const storefront = await requireActiveStorefront(user.id);
  const [packages, products, bounds] = await Promise.all([
    prisma.dataPackage.findMany({
      where: { active: true },
      orderBy: [{ network: "asc" }, { gbAmount: "asc" }, { sortOrder: "asc" }],
    }),
    prisma.storefrontProduct.findMany({
      where: { storefrontId: storefront.id },
      include: { dataPackage: true },
      orderBy: [{ dataPackage: { network: "asc" } }, { dataPackage: { gbAmount: "asc" } }],
    }),
    getMarkupBounds(),
  ]);

  const packagesWithCost = (
    await Promise.all(
      packages.map(async (p) => ({
        id: p.id,
        network: p.network,
        gbAmount: p.gbAmount,
        name: p.name,
        cost: await resolveUserWholesalePrice(user, p),
      }))
    )
  ).sort((a, b) => {
    if (a.network !== b.network) return a.network.localeCompare(b.network);
    return a.gbAmount - b.gbAmount;
  });

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Products &amp; Pricing</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Set your retail price per bundle. Commission = your price − cost, credited to your wallet automatically.
        </p>
      </header>
      <PricingEditor
        packages={packagesWithCost}
        products={products.map((p) => ({
          packageId: p.packageId,
          sellingPrice: p.sellingPrice / 100,
          isActive: p.isActive,
        }))}
        minMarkup={bounds.minMarkupP / 100}
        maxMarkup={bounds.maxMarkupP === Number.MAX_SAFE_INTEGER ? null : bounds.maxMarkupP / 100}
        disabled={storefront.status !== "ENABLED"}
      />
    </div>
  );
}
