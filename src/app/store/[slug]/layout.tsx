import { prisma } from "@/lib/prisma";
import { StoreChrome } from "@/components/store/store-chrome";
import { NETWORK_ORDER } from "@/components/store/brands";
import type { NetworkProvider } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function StoreLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [storefront, supportSetting] = await Promise.all([
    prisma.storefront.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        logoUrl: true,
        whatsapp: true,
        whatsappGroupLink: true,
        email: true,
        location: true,
        contactText: true,
        whatsappLabel: true,
        notice: true,
        status: true,
        isActive: true,
      },
    }),
    prisma.systemSetting.findUnique({ where: { key: "support_whatsapp" } }),
  ]);

  // Disabled/unknown stores: skip chrome; the page itself renders notFound().
  if (!storefront || storefront.status !== "ENABLED") {
    return <div className="min-h-screen bg-[#e9ebf5] dark:bg-[#0a101e]">{children}</div>;
  }

  const rows = storefront.isActive
    ? await prisma.dataPackage.findMany({
        where: {
          active: true,
          storefrontProducts: { some: { storefrontId: storefront.id, isActive: true } },
        },
        select: { network: true },
        distinct: ["network"],
      })
    : [];
  const networks = rows
    .map((r) => r.network as NetworkProvider)
    .sort((a, b) => NETWORK_ORDER.indexOf(a) - NETWORK_ORDER.indexOf(b));

  return (
    <StoreChrome
      name={storefront.name}
      slug={storefront.slug}
      description={storefront.description}
      logoUrl={storefront.logoUrl}
      whatsapp={storefront.whatsapp || supportSetting?.value || null}
      whatsappGroupLink={storefront.whatsappGroupLink}
      email={storefront.email}
      location={storefront.location}
      contactText={storefront.contactText}
      whatsappLabel={storefront.whatsappLabel}
      notice={storefront.notice}
      networks={networks}
    >
      {children}
    </StoreChrome>
  );
}
