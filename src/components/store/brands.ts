import type { NetworkProvider } from "@/lib/types";

/** Public-facing network metadata for the storefront (Clequa-style tiles). */
export const NETWORK_BRANDS: Record<
  NetworkProvider,
  { label: string; slug: string; tile: string; dim: string }
> = {
  MTN: { label: "MTN", slug: "mtn", tile: "bg-[#FFCB05]", dim: "bg-[#a5830b]" },
  TELECEL: { label: "Telecel", slug: "telecel", tile: "bg-[#E4002B]", dim: "bg-[#9c0020]" },
  AIRTELTIGO: { label: "AirtelTigo", slug: "airteltigo", tile: "bg-white ring-1 ring-slate-200", dim: "bg-slate-300" },
};

export const NETWORK_ORDER: NetworkProvider[] = ["MTN", "TELECEL", "AIRTELTIGO"];

export function networkBySlug(slug: string): NetworkProvider | null {
  const entry = (Object.entries(NETWORK_BRANDS) as [NetworkProvider, { slug: string }][]).find(
    ([, brand]) => brand.slug === slug
  );
  return entry?.[0] ?? null;
}

export function networkHref(storeSlug: string, network: NetworkProvider): string {
  return `/${storeSlug}/${NETWORK_BRANDS[network].slug}`;
}

export function storeHref(storeSlug: string, subpath: string = ""): string {
  const cleanSub = subpath ? (subpath.startsWith("/") ? subpath : `/${subpath}`) : "";
  return `/${storeSlug}${cleanSub}`;
}

export function ghs(amount: number): string {
  return `₵${amount.toFixed(2)}`;
}
