import { requireUser } from "@/lib/auth";
import { requireActiveStorefront } from "@/lib/storefront";
import { StorefrontSettingsForm } from "./settings-form";

export default async function StorefrontSettingsPage() {
  const user = await requireUser();
  const storefront = await requireActiveStorefront(user.id);
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Storefront Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Public store profile and mobile money payout account. Your store address is{" "}
          <span className="font-semibold text-violet-600 dark:text-violet-400">/store/{storefront.slug}</span>.
        </p>
      </header>
      <StorefrontSettingsForm
        initial={{
          name: storefront.name,
          description: storefront.description ?? "",
          whatsapp: storefront.whatsapp ?? "",
          phone: storefront.phone ?? "",
          whatsappGroupLink: storefront.whatsappGroupLink ?? "",
          location: storefront.location ?? "",
          contactText: storefront.contactText ?? "",
          whatsappLabel: storefront.whatsappLabel ?? "",
          payoutNetwork: storefront.payoutNetwork ?? "MTN",
          payoutNumber: storefront.payoutNumber ?? "",
          payoutAccountName: storefront.payoutAccountName ?? "",
        }}
      />
    </div>
  );
}
