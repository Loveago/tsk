import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock, XCircle, Store } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getStorefrontForUser } from "@/lib/storefront";

/** Application status page while a store is PENDING or REJECTED. */
export default async function StorePendingPage() {
  const user = await requireUser();
  const storefront = await getStorefrontForUser(user.id);
  if (!storefront || storefront.status === "NOT_ENABLED") {
    redirect("/dashboard/storefront/apply");
  }
  if (storefront.status === "ENABLED" || storefront.status === "SUSPENDED") {
    redirect("/dashboard/storefront");
  }

  const pending = storefront.status === "PENDING";

  return (
    <div className="mx-auto max-w-lg p-4 sm:p-6">
      <div
        className={`rounded-2xl border p-6 text-center ${
          pending
            ? "border-sky-200 bg-sky-50 dark:border-sky-500/30 dark:bg-sky-500/10"
            : "border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10"
        }`}
      >
        <span
          className={`mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl ${
            pending
              ? "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300"
              : "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300"
          }`}
        >
          {pending ? <Clock className="h-7 w-7" /> : <XCircle className="h-7 w-7" />}
        </span>
        <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">
          {pending ? "Application under review" : "Application not approved"}
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          {pending
            ? `We're reviewing “${storefront.name}”. You'll be able to manage your store here as soon as it's approved.`
            : storefront.rejectionNote
              ? `“${storefront.name}” was not approved. Reason: ${storefront.rejectionNote}`
              : `“${storefront.name}” was not approved.`}
        </p>
        {pending && (
          <div className="mx-auto mt-5 flex max-w-xs items-center justify-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-500 shadow-sm dark:bg-white/10 dark:text-slate-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-500" />
            </span>
            Status: {storefront.status}
          </div>
        )}
      </div>

      {pending ? (
        <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
          Want to change your store name before approval? Contact support.
        </p>
      ) : (
        <Link
          href="/dashboard/storefront/apply"
          className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-sm font-bold text-white hover:bg-violet-500"
        >
          <Store className="h-4 w-4" /> Submit a new application
        </Link>
      )}
    </div>
  );
}
