import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getGeminiProSettings } from "@/lib/gemini-pro";
import { GeminiBuyForm } from "./gemini-buy-form";
import { Sparkles, Clock, ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function GeminiStorePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [storefront, featureSetting, geminiSettings] = await Promise.all([
    prisma.storefront.findUnique({ where: { slug } }),
    prisma.systemSetting.findUnique({ where: { key: "storefront_feature_enabled" } }),
    getGeminiProSettings(),
  ]);

  if (!storefront || storefront.status !== "ENABLED") notFound();

  if (featureSetting?.value === "false" || !storefront.isActive) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 sm:p-12 shadow-sm dark:border-slate-800 dark:bg-[#111a2c]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-500/15">
            <Clock className="h-7 w-7 text-amber-600 dark:text-amber-400" />
          </div>
          <h2 className="mt-4 font-serif text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white">
            Storefront Temporarily Paused
          </h2>
          <p className="mt-3 text-sm text-slate-600 sm:text-base dark:text-slate-300">
            Storefront orders are currently paused for scheduled maintenance.
          </p>
          <div className="mt-6">
            <Link
              href={`/store/${slug}`}
              className="inline-flex h-10 items-center rounded-full bg-yellow-300 px-5 text-sm font-bold text-slate-900 transition-colors hover:bg-yellow-400"
            >
              Back to Store
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!geminiSettings.enabled) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 sm:p-12 shadow-sm dark:border-slate-800 dark:bg-[#111a2c]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-100 dark:bg-purple-500/15">
            <Sparkles className="h-7 w-7 text-purple-600 dark:text-purple-400" />
          </div>
          <h2 className="mt-4 font-serif text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white">
            Gemini Pro Currently Unavailable
          </h2>
          <p className="mt-3 text-sm text-slate-600 sm:text-base dark:text-slate-300">
            Google Gemini Pro 18-month activation links are temporarily paused. Please check back soon or browse our data bundle deals.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href={`/store/${slug}`}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-yellow-300 px-6 text-sm font-bold text-slate-900 transition-colors hover:bg-yellow-400"
            >
              <ArrowLeft className="h-4 w-4" />
              Browse Data Deals
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <GeminiBuyForm
      slug={slug}
      storeName={storefront.name}
      price={geminiSettings.price}
    />
  );
}
