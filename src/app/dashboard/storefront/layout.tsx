import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

/**
 * Auth gate for every /dashboard/storefront page (§2). Fine-grained status
 * gating (apply / pending / active) happens per page via
 * requireActiveStorefront so the apply + pending routes stay reachable.
 */
export default async function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <>{children}</>;
}
