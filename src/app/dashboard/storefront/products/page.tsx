import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { requireActiveStorefront, getMarkupBounds } from "@/lib/storefront";
import { PricingEditor } from "./pricing-editor";

export default async function StorefrontProductsPage() {
  const user = await requireUser();
  const storefront = await requireActiveStorefront(user.id);
  const [packages, products, bounds] = await Promise.all([
    prisma.dataPackage.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }] }),
    prisma.storefrontProduct.findMany({ where: { storefrontId: storefront.id } }),
    getMarkupBounds(),
  ]);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Products &amp; Pricing</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Set your retail price per bundle. Commission = your price − cost, credited to your wallet automatically.
        </p>
      </header>
      <PricingEditor
        packages={packages.map((p) => ({
          id: p.id,
          network: p.network,
          gbAmount: p.gbAmount,
          name: p.name,
          cost: p.retailPriceGHS ?? 0,
        }))}
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
