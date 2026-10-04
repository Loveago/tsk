import { requireStaff } from "@/lib/auth";
import { ensureAdminCustomStorefront } from "@/lib/storefront";
import { CustomStorefrontView } from "./custom-storefront-view";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminCustomStorefrontPage() {
  await requireStaff();
  // Ensure the store is initialized on load
  const storefront = await ensureAdminCustomStorefront();

  return (
    <div className="space-y-6">
      <CustomStorefrontView initialStorefront={storefront} />
    </div>
  );
}
