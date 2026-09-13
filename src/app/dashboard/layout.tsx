import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isOrderProcessingHalted } from "@/lib/orders";
import { getStorefrontForUser } from "@/lib/storefront";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const halted = await isOrderProcessingHalted();

  const [announcementSetting, supportWhatsappSetting, storefrontEnabledSetting] =
    await Promise.all([
      prisma.systemSetting.findUnique({ where: { key: "site_announcement" } }),
      prisma.systemSetting.findUnique({ where: { key: "support_whatsapp" } }),
      prisma.systemSetting.findUnique({ where: { key: "storefront_feature_enabled" } }),
    ]);

  const storefront = await getStorefrontForUser(user.id);
  const storefrontFeatureEnabled = storefrontEnabledSetting?.value !== "false";

  const extraNavItems = !storefrontFeatureEnabled
    ? []
    : storefront &&
      (storefront.status === "ENABLED" || storefront.status === "SUSPENDED")
    ? [{ href: "/dashboard/storefront", label: "My Storefront", icon: "store" as const }]
    : [{ href: "/dashboard/storefront/apply", label: "Open a Store", icon: "store" as const }];

  const announcement = halted
    ? "WE ARE CURRENTLY UNAVAILABLE — ORDER PROCESSING IS PAUSED. PLEASE CHECK BACK SOON."
    : announcementSetting?.value?.trim() || null;

  return (
    <AppShell
      user={user}
      extraNavItems={extraNavItems}
      announcement={announcement}
      supportWhatsapp={supportWhatsappSetting?.value || undefined}
    >
      {children}
    </AppShell>
  );
}
