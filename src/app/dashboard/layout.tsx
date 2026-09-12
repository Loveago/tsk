import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isOrderProcessingHalted } from "@/lib/orders";
import { getStorefrontForUser } from "@/lib/storefront";
import { AppShell } from "@/components/app-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const halted = await isOrderProcessingHalted();
  // Gated nav items (server-side check — hiding alone is never the enforcement, §2):
  // - owners with a live store get "My Storefront"
  // - everyone else gets "Open a Store" to submit an application
  const storefront = await getStorefrontForUser(user.id);
  const extraNavItems = storefront &&
    (storefront.status === "ENABLED" || storefront.status === "SUSPENDED")
    ? [{ href: "/dashboard/storefront", label: "My Storefront", icon: "store" as const }]
    : [{ href: "/dashboard/storefront/apply", label: "Open a Store", icon: "store" as const }];
  return (
    <AppShell
      user={user}
      extraNavItems={extraNavItems}
      announcement={
        halted
          ? "WE ARE CURRENTLY UNAVAILABLE — ORDER PROCESSING IS PAUSED. PLEASE CHECK BACK SOON."
          : null
      }
    >
      {children}
    </AppShell>
  );
}
