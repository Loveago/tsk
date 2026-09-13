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
  if (user.role !== "ADMIN" && user.role !== "MANAGER") redirect("/dashboard");

  const supportWhatsappSetting = await prisma.systemSetting.findUnique({
    where: { key: "support_whatsapp" },
  });

  return (
    <AppShell
      user={user}
      admin
      supportWhatsapp={supportWhatsappSetting?.value || undefined}
    >
      {children}
    </AppShell>
  );
}
