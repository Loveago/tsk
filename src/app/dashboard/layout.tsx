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

  const [
    announcementSetting,
    supportWhatsappSetting,
    storefrontEnabledSetting,
    maintenanceModeSetting,
    supportPhoneSetting,
    supportTelegramSetting,
    supportEmailSetting,
    footerTextSetting,
    lowBalanceSetting,
  ] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { key: "site_announcement" } }),
    prisma.systemSetting.findUnique({ where: { key: "support_whatsapp" } }),
    prisma.systemSetting.findUnique({ where: { key: "storefront_feature_enabled" } }),
    prisma.systemSetting.findUnique({ where: { key: "maintenance_mode_enabled" } }),
    prisma.systemSetting.findUnique({ where: { key: "support_phone" } }),
    prisma.systemSetting.findUnique({ where: { key: "support_telegram" } }),
    prisma.systemSetting.findUnique({ where: { key: "support_email" } }),
    prisma.systemSetting.findUnique({ where: { key: "footer_text" } }),
    prisma.systemSetting.findUnique({ where: { key: "low_balance_warning_threshold" } }),
  ]);

  if (maintenanceModeSetting?.value === "true" && user.role !== "ADMIN") {
    redirect("/maintenance");
  }

  const storefront = await getStorefrontForUser(user.id);
  const storefrontFeatureEnabled = storefrontEnabledSetting?.value !== "false";

  const extraNavItems = !storefrontFeatureEnabled
    ? []
    : storefront &&
      (storefront.status === "ENABLED" || storefront.status === "SUSPENDED")
    ? [{ href: "/dashboard/storefront", label: "My Storefront", icon: "store" as const }]
    : [{ href: "/dashboard/storefront/apply", label: "Open Storefront", icon: "store" as const }];

  let announcement = halted
    ? "WE ARE CURRENTLY UNAVAILABLE — ORDER PROCESSING IS PAUSED. PLEASE CHECK BACK SOON."
    : announcementSetting?.value?.trim() || null;

  const lowBalanceThreshold = lowBalanceSetting?.value ? parseFloat(lowBalanceSetting.value) : 5;
  if (user.balance < lowBalanceThreshold) {
    const warning = `WARNING: Your balance is low (GHS ${user.balance.toFixed(2)}). Please top up.`;
    announcement = announcement ? `${warning} | ${announcement}` : warning;
  }

  return (
    <AppShell
      user={user}
      extraNavItems={extraNavItems}
      announcement={announcement}
      supportWhatsapp={supportWhatsappSetting?.value || undefined}
      supportPhone={supportPhoneSetting?.value || undefined}
      supportTelegram={supportTelegramSetting?.value || undefined}
      supportEmail={supportEmailSetting?.value || undefined}
      footerText={footerTextSetting?.value || undefined}
    >
      {children}
    </AppShell>
  );
}
