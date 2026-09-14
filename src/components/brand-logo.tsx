"use client";

import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface BrandProps {
  className?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  showTagline?: boolean;
  href?: string;
}

/**
 * Compact Icon / Mark alone (Wifi arc + tsk05 monogram)
 */
export function BrandMark({
  className,
  size = "md",
}: {
  className?: string;
  size?: "xs" | "sm" | "md" | "lg";
}) {
  const sizeMap = {
    xs: "h-6 w-6",
    sm: "h-8 w-8",
    md: "h-9 w-9",
    lg: "h-11 w-11",
  };

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-900 shadow-sm ring-1 ring-white/10 dark:bg-slate-900 dark:ring-white/15",
        sizeMap[size],
        className
      )}
      aria-label="Tskconnect"
    >
      <svg
        viewBox="0 0 128 128"
        className="h-full w-full p-1"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="bmOrange" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFA033" />
            <stop offset="60%" stopColor="#FF6A00" />
            <stop offset="100%" stopColor="#E54F00" />
          </linearGradient>
          <radialGradient id="bmSphere" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#FFCA80" />
            <stop offset="60%" stopColor="#FF6A00" />
            <stop offset="100%" stopColor="#C43800" />
          </radialGradient>
        </defs>

        {/* WiFi & Arrow Mark */}
        <g transform="translate(48, 14) scale(0.48)">
          <circle cx="28" cy="74" r="8" fill="url(#bmSphere)" />
          <path
            d="M 18 56 A 26 26 0 0 1 58 24"
            fill="none"
            stroke="url(#bmOrange)"
            strokeWidth="10"
            strokeLinecap="round"
          />
          <path
            d="M 4 40 A 46 46 0 0 1 76 0"
            fill="none"
            stroke="url(#bmOrange)"
            strokeWidth="12"
            strokeLinecap="round"
          />
          <path
            d="M 16 78 C 38 48 85 36 142 36 L 138 20 L 180 40 L 144 70 L 142 52 C 96 52 56 64 30 88 Z"
            fill="url(#bmOrange)"
          />
        </g>

        {/* Lettermark 'tsk05' */}
        <g transform="translate(64, 82)">
          <text
            textAnchor="middle"
            fontFamily="system-ui, -apple-system, sans-serif"
            fontSize="34"
            fontWeight="900"
            letterSpacing="-0.5"
          >
            <tspan fill="#FFFFFF">tsk</tspan>
            <tspan fill="#FFFFFF">0</tspan>
            <tspan fill="url(#bmOrange)">5</tspan>
          </text>
          <circle cx="21" cy="-10" r="4.2" fill="url(#bmSphere)" />
        </g>

        {/* Subtitle Accent */}
        <text
          x="64"
          y="106"
          textAnchor="middle"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontSize="12"
          fontStyle="italic"
          fontWeight="800"
          letterSpacing="1.2"
          fill="url(#bmOrange)"
        >
          CONNECT
        </text>
      </svg>
    </div>
  );
}

/**
 * Full Horizontal Brand Logo (Mark + Typography)
 */
export function BrandLogo({
  className,
  size = "md",
  showTagline = true,
  href,
}: BrandProps) {
  const content = (
    <div
      className={cn(
        "inline-flex shrink-0 items-center gap-2.5 select-none",
        className
      )}
    >
      <BrandMark size={size === "xl" || size === "lg" ? "lg" : size === "xs" ? "xs" : "sm"} />
      <div className="flex flex-col justify-center">
        <div className="flex items-baseline leading-none">
          <span className="text-base font-black tracking-tight text-slate-900 dark:text-white sm:text-lg">
            tsk05
          </span>
          <span className="ml-1 text-base font-black italic tracking-tight text-[#FF6500] sm:text-lg">
            connect
          </span>
        </div>
        {showTagline && (
          <span className="mt-0.5 text-[8.5px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            bundle solutions
          </span>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex transition-opacity hover:opacity-90">
        {content}
      </Link>
    );
  }

  return content;
}
