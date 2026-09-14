import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN" && user.role !== "MANAGER" && user.role !== "SECRETARY") {
    redirect("/dashboard");
  }

  const [supportWhatsappSetting, secretaryPagesSetting] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { key: "support_whatsapp" } }),
    prisma.systemSetting.findUnique({ where: { key: "secretary_allowed_pages" } }),
  ]);

  let allowedNavHrefs: string[] | undefined;
  if (user.role === "SECRETARY") {
    try {
      allowedNavHrefs = secretaryPagesSetting?.value
        ? JSON.parse(secretaryPagesSetting.value)
        : ["/admin", "/admin/orders", "/admin/exports", "/admin/delivery-reports"];
    } catch {
      allowedNavHrefs = ["/admin", "/admin/orders", "/admin/exports", "/admin/delivery-reports"];
    }
  }

  return (
    <AppShell
      user={user}
      admin
      supportWhatsapp={supportWhatsappSetting?.value || undefined}
      allowedNavHrefs={allowedNavHrefs}
    >
      {children}
    </AppShell>
  );
}
