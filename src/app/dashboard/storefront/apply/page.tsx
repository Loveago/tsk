import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getStorefrontForUser, isOwnedStorefrontStatus } from "@/lib/storefront";
import { StoreApplyForm } from "./apply-form";

/**
 * User-side store application (§4): the user only enters their store name —
 * an admin reviews and approves before the store goes live.
 */
export default async function StoreApplyPage() {
  const user = await requireUser();
  const storefront = await getStorefrontForUser(user.id);
  if (storefront && isOwnedStorefrontStatus(storefront.status)) {
    redirect("/dashboard/storefront");
  }
  if (storefront?.status === "PENDING") {
    redirect("/dashboard/storefront/pending");
  }

  return (
    <div className="mx-auto max-w-lg p-4 sm:p-6">
      <header className="text-center">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7">
            <path d="M3 9l1.5-5h15L21 9M3 9v11a1 1 0 001 1h16a1 1 0 001-1V9M3 9h18M9 21v-6h6v6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h1 className="mt-4 text-2xl font-bold text-slate-900 dark:text-white">Open your own store</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Sell data bundles under your own brand, set your own prices, and earn commission on
          every sale. Just pick a store name — our team reviews new stores before they go live.
        </p>
      </header>
      <StoreApplyForm
        rejected={storefront?.status === "REJECTED"}
        rejectionNote={storefront?.rejectionNote ?? null}
        previousName={storefront?.name ?? ""}
        previousDescription={storefront?.description ?? ""}
      />
    </div>
  );
}
