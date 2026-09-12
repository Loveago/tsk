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

  const storefront = await prisma.storefront.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      logoUrl: true,
      whatsapp: true,
      email: true,
      location: true,
      contactText: true,
      whatsappLabel: true,
      status: true,
    },
  });

  // Disabled/unknown stores: skip chrome; the page itself renders notFound().
  if (!storefront || storefront.status !== "ENABLED") {
    return <div className="min-h-screen bg-[#e9ebf5] dark:bg-[#0a101e]">{children}</div>;
  }

  const rows = await prisma.dataPackage.findMany({
    where: {
      active: true,
      storefrontProducts: { some: { storefrontId: storefront.id, isActive: true } },
    },
    select: { network: true },
    distinct: ["network"],
  });
  const networks = rows
    .map((r) => r.network as NetworkProvider)
    .sort((a, b) => NETWORK_ORDER.indexOf(a) - NETWORK_ORDER.indexOf(b));

  return (
    <StoreChrome
      name={storefront.name}
      slug={storefront.slug}
      description={storefront.description}
      logoUrl={storefront.logoUrl}
      whatsapp={storefront.whatsapp}
      email={storefront.email}
      location={storefront.location}
      contactText={storefront.contactText}
      whatsappLabel={storefront.whatsappLabel}
      networks={networks}
    >
      {children}
    </StoreChrome>
  );
}
