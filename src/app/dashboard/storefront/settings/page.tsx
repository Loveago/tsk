import { requireUser } from "@/lib/auth";
import { requireActiveStorefront, getStorefrontDnsConfig, getStorefrontUrls } from "@/lib/storefront";
import { StorefrontSettingsForm } from "./settings-form";
import { StoreStatusToggle } from "@/components/storefront/store-status-toggle";

export const dynamic = "force-dynamic";

export default async function StorefrontSettingsPage() {
  const user = await requireUser();
  const storefront = await requireActiveStorefront(user.id);
  const dnsConfig = getStorefrontDnsConfig();
  const urls = getStorefrontUrls(storefront);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Storefront Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Configure your store web address (default domain or custom domain), public store profile, availability, and mobile money payout account. Primary address:{" "}
          <span className="font-semibold text-violet-600 dark:text-violet-400">{urls.primaryDisplay}</span>.
        </p>
      </header>
      <StoreStatusToggle
        initialActive={storefront.isActive}
        storeStatus={storefront.status}
        variant="card"
      />
      <StorefrontSettingsForm
        storefrontDomain={dnsConfig.storefrontDomain}
        cnameTarget={dnsConfig.cnameTarget}
        vpsIp={dnsConfig.vpsIp}
        initial={{
          slug: storefront.slug,
          customDomain: storefront.customDomain ?? "",
          customDomainStatus: storefront.customDomainStatus ?? "NONE",
          customDomainVerifiedAt: storefront.customDomainVerifiedAt
            ? storefront.customDomainVerifiedAt.toISOString()
            : null,
          customDomainError: storefront.customDomainError ?? null,
          preferredDomainMode: (storefront.preferredDomainMode === "CUSTOM" ? "CUSTOM" : "DEFAULT"),
          name: storefront.name,
          description: storefront.description ?? "",
          whatsapp: storefront.whatsapp ?? "",
          phone: storefront.phone ?? "",
          whatsappGroupLink: storefront.whatsappGroupLink ?? "",
          location: storefront.location ?? "",
          contactText: storefront.contactText ?? "",
          whatsappLabel: storefront.whatsappLabel ?? "",
          notice: storefront.notice ?? "",
          payoutNetwork: storefront.payoutNetwork ?? "MTN",
          payoutNumber: storefront.payoutNumber ?? "",
          payoutAccountName: storefront.payoutAccountName ?? "",
        }}
      />
    </div>
  );
}
