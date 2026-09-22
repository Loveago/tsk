/**
 * Client-safe storefront money and formatting utilities.
 * Free of server-only imports (like next/headers, prisma, auth).
 */

export function toPesewas(ghs: number): number {
  return Math.round(ghs * 100);
}

export function fromPesewas(pesewas: number): number {
  return Math.round(pesewas) / 100;
}

export function formatGhs(pesewas: number): string {
  return `GHS ${fromPesewas(pesewas).toFixed(2)}`;
}

export function storefrontOrderCode(seq: number, reference?: string | null): string {
  if (reference && (reference.startsWith("GH-") || reference.startsWith("STF-"))) {
    return reference;
  }
  return `CF-ST-${String(seq).padStart(5, "0")}`;
}

export function withdrawalCode(seq: number): string {
  return `CF-WD-${String(seq).padStart(5, "0")}`;
}
