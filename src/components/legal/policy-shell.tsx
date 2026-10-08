"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import {
  FileText,
  ShieldCheck,
  RotateCcw,
  ChevronLeft,
  Mail,
  Phone,
  Clock,
  ExternalLink,
} from "lucide-react";

interface PolicyShellProps {
  title: string;
  subtitle: string;
  lastUpdated?: string;
  children: React.ReactNode;
}

const POLICY_TABS = [
  { href: "/terms", label: "Terms of Service", icon: FileText },
  { href: "/privacy", label: "Privacy Policy", icon: ShieldCheck },
  { href: "/refund", label: "Refund Policy", icon: RotateCcw },
];

export function PolicyShell({
  title,
  subtitle,
  lastUpdated = "1st October, 2026",
  children,
}: PolicyShellProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/85">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition">
              <BrandLogo size="sm" />
            </Link>
            <span className="hidden sm:inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300">
              Legal & Compliance
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Back to Login</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Banner */}
      <div className="border-b border-slate-200 bg-gradient-to-b from-white to-slate-50 py-10 dark:border-white/10 dark:from-slate-900 dark:to-slate-950">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-yellow-400/30 bg-yellow-400/10 px-3 py-1 text-xs font-bold text-yellow-800 dark:border-yellow-400/20 dark:bg-yellow-400/5 dark:text-yellow-300">
                <span>Tskconnect Official Policies</span>
                <span className="opacity-50">·</span>
                <span>Last Updated: {lastUpdated}</span>
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-slate-950 dark:text-white">
                {title}
              </h1>
              <p className="max-w-2xl text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {subtitle}
              </p>
            </div>
          </div>

          {/* Policy Navigation Tabs */}
          <div className="mt-8 flex flex-wrap gap-2 border-b border-slate-200/80 pb-px dark:border-white/10">
            {POLICY_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive =
                pathname === tab.href ||
                (tab.href === "/refund" && pathname === "/refund-policy");

              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`inline-flex items-center gap-2 rounded-t-xl px-4 py-2.5 text-xs sm:text-sm font-semibold transition border-b-2 -mb-px ${
                    isActive
                      ? "border-yellow-500 bg-white text-yellow-700 shadow-sm dark:border-yellow-400 dark:bg-slate-900 dark:text-yellow-300"
                      : "border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-100/60 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-white/5"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{tab.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Body */}
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 flex-1 w-full">
        <article className="prose prose-slate max-w-none dark:prose-invert prose-headings:font-bold prose-headings:tracking-tight prose-a:text-yellow-600 hover:prose-a:text-yellow-500 dark:prose-a:text-yellow-400">
          {children}
        </article>

        {/* Contact & Dispute Resolution Card */}
        <section className="mt-14 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900 sm:p-8">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
            Questions, Reports, or Complaints?
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
            If you need assistance regarding an uncredited bundle, report escalation, refund request, or privacy inquiry, our team is readily available during operating hours.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-white/5 dark:bg-white/[0.02]">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                <Mail className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                <span>Support Email</span>
              </div>
              <a
                href="mailto:support@tskconnect.com"
                className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white hover:underline break-all"
              >
                support@tskconnect.com
              </a>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-white/5 dark:bg-white/[0.02]">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                <Phone className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                <span>WhatsApp / Phone</span>
              </div>
              <a
                href="https://wa.me/233243721334"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white hover:underline"
              >
                +233 24 372 1334
              </a>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-white/5 dark:bg-white/[0.02]">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                <span>Operating Hours</span>
              </div>
              <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                5:00 AM – 11:59 PM GMT
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Monday – Sunday</p>
            </div>
          </div>
        </section>
      </main>

      {/* Global Legal Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500 dark:border-white/10 dark:bg-slate-900 dark:text-slate-400">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6">
          <p>
            © {new Date().getFullYear()} Tskconnect. All rights reserved. Republic of Ghana.
          </p>
          <div className="flex items-center gap-4 text-xs font-medium">
            <Link href="/terms" className="hover:underline">Terms of Service</Link>
            <span>·</span>
            <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
            <span>·</span>
            <Link href="/refund" className="hover:underline">Refund Policy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
