"use client";

import Link from "next/link";
import { NetworkLogo } from "./network-logo";
import { NETWORK_BRANDS, networkHref, storeHref } from "./brands";
import type { NetworkProvider } from "@/lib/types";

/**
 * Spinning circular network logo carousel. The whole orbit rotates slowly via
 * CSS while each logo counter-rotates to stay upright; logos are clickable
 * links into each network's bundle page. Pauses on hover and respects
 * prefers-reduced-motion (see .wheel-* rules in globals.css).
 */
export function NetworkWheel({
  slug,
  storeName,
  networks,
}: {
  slug: string;
  storeName: string;
  networks: NetworkProvider[];
}) {
  const count = networks.length;
  if (count === 0) return null;

  return (
    <div className="wheel-wrap relative mx-auto aspect-square w-[88%] max-w-[320px] md:w-full md:max-w-md">
      {/* Decorative rings */}
      <div className="pointer-events-none absolute inset-0 rounded-full border-2 border-yellow-400/80" />
      <div className="pointer-events-none absolute inset-10 rounded-full border-2 border-emerald-600/60" />
      <div className="pointer-events-none absolute inset-20 rounded-full border border-slate-300/70 dark:border-white/10" />

      {/* Rotating orbit of clickable logos */}
      <div className="wheel-spin pointer-events-none absolute inset-5 md:inset-6">
        {networks.map((network, i) => {
          const angle = (360 / count) * i;
          return (
            <div
              key={network}
              className="pointer-events-none absolute inset-0"
              style={{ transform: `rotate(${angle}deg)` }}
            >
              <Link
                href={networkHref(slug, network)}
                aria-label={`Shop ${NETWORK_BRANDS[network].label} bundles`}
                className="pointer-events-auto absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2"
              >
                <span
                  className="block"
                  style={{ transform: `rotate(${-angle}deg)` }}
                >
                  <span className="wheel-counter block">
                    <span
                      className={`block h-12 w-12 overflow-hidden rounded-full shadow-lg transition-transform hover:scale-110 md:h-14 md:w-14 ${NETWORK_BRANDS[network].tile}`}
                    >
                      <NetworkLogo network={network} className="h-full w-full" />
                    </span>
                  </span>
                </span>
              </Link>
            </div>
          );
        })}
      </div>

      {/* Center card */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <Link
          href={storeHref(slug)}
          className="pointer-events-auto flex flex-col items-center gap-1 rounded-3xl bg-white px-8 py-6 text-center shadow-2xl shadow-slate-900/10 transition-transform hover:scale-105 dark:bg-[#111a2c] md:px-10 md:py-8"
        >
          <span className="font-serif text-xl font-bold text-slate-900 dark:text-white md:text-2xl">
            {storeName}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-yellow-500 md:text-xs">
            Tap a network to shop
          </span>
        </Link>
      </div>
    </div>
  );
}
