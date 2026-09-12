import { prisma } from "@/lib/prisma";
import { TrackForm } from "./track-form";

export const dynamic = "force-dynamic";

export default async function TrackPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const storefront = await prisma.storefront.findUnique({
    where: { slug },
    select: { name: true, status: true },
  });
  const enabled = storefront?.status === "ENABLED";

  return (
    <div className="mx-auto max-w-6xl px-4 pb-6">
      <section className="pt-10 text-center lg:pt-14">
        <p className="text-sm font-semibold text-yellow-500">Order tracking</p>
        <h1 className="mt-2 font-serif text-3xl font-bold text-slate-900 sm:text-4xl dark:text-white">
          Track your order
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-slate-600 dark:text-slate-300">
          Enter your order ID, phone number, or email to see delivery status.
        </p>

        {enabled ? (
          <div className="mx-auto mt-8 max-w-lg rounded-3xl bg-white p-6 text-left shadow-sm ring-1 ring-slate-900/5 sm:p-8 dark:bg-[#111a2c] dark:ring-white/10">
            <TrackForm slug={slug} />
          </div>
        ) : (
          <p className="mx-auto mt-8 max-w-lg rounded-2xl border border-dashed border-slate-300 bg-white/60 p-8 text-sm text-slate-500 dark:border-slate-700 dark:bg-white/5">
            This store is not accepting orders right now.
          </p>
        )}
      </section>
    </div>
  );
}
