"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

export function StoreApplyForm({
  rejected,
  rejectionNote,
  previousName,
  previousPhone,
  previousWhatsappGroupLink,
  previousDescription,
}: {
  rejected: boolean;
  rejectionNote: string | null;
  previousName: string;
  previousPhone?: string;
  previousWhatsappGroupLink?: string;
  previousDescription: string;
}) {
  const router = useRouter();
  const [storeName, setStoreName] = React.useState(rejected ? "" : previousName);
  const [contactNumber, setContactNumber] = React.useState(rejected ? "" : (previousPhone ?? ""));
  const [whatsappGroupLink, setWhatsappGroupLink] = React.useState(
    rejected ? "" : (previousWhatsappGroupLink ?? "")
  );
  const [description, setDescription] = React.useState(previousDescription);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const cleanLink = whatsappGroupLink.trim();
      const normalizedLink = cleanLink.startsWith("http://") || cleanLink.startsWith("https://")
        ? cleanLink
        : `https://${cleanLink}`;

      const res = await fetch("/api/storefront/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeName: storeName.trim(),
          contactNumber: contactNumber.trim(),
          whatsappGroupLink: normalizedLink,
          description,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not submit your application");
      setDone(true);
      router.refresh();
      setTimeout(() => router.push("/dashboard/storefront/pending"), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit your application");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "h-11 w-full rounded-xl border border-slate-300 px-3 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-transparent dark:text-slate-100 dark:placeholder:text-slate-500";

  if (done) {
    return (
      <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-500/30 dark:bg-emerald-500/10">
        <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600 dark:text-emerald-400" />
        <p className="mt-2 font-semibold text-emerald-800 dark:text-emerald-200">
          Application submitted!
        </p>
        <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">
          Taking you to your application status…
        </p>
      </div>
    );
  }

  const isValid =
    storeName.trim().length >= 2 &&
    contactNumber.trim().length >= 9 &&
    whatsappGroupLink.trim().length >= 5;

  return (
    <form onSubmit={submit} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#0d1526]">
      {rejected && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          <p className="flex items-center gap-2 font-semibold">
            <AlertCircle className="h-4 w-4" /> Your previous application was not approved
          </p>
          {rejectionNote && <p className="mt-1 text-xs">Reason: {rejectionNote}</p>}
          <p className="mt-1 text-xs">You can submit a new application below.</p>
        </div>
      )}
      <div>
        <label htmlFor="storeName" className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">
          Storefront name <span className="text-red-500">*</span>
        </label>
        <input
          id="storeName"
          value={storeName}
          onChange={(e) => setStoreName(e.target.value)}
          placeholder="e.g. Kofi Data Hub"
          required
          minLength={2}
          maxLength={60}
          className={inputCls}
        />
        <p className="mt-1 text-xs text-slate-400">
          Shown to buyers. Your public address is assigned when the store is approved.
        </p>
      </div>

      <div>
        <label htmlFor="contactNumber" className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">
          Contact number <span className="text-red-500">*</span>
        </label>
        <input
          id="contactNumber"
          type="tel"
          value={contactNumber}
          onChange={(e) => setContactNumber(e.target.value)}
          placeholder="e.g. 0241234567"
          required
          minLength={9}
          maxLength={20}
          className={inputCls}
        />
        <p className="mt-1 text-xs text-slate-400">
          Primary phone number for administrative contact and customer queries.
        </p>
      </div>

      <div>
        <label htmlFor="whatsappGroupLink" className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">
          WhatsApp group link <span className="text-red-500">*</span>
        </label>
        <input
          id="whatsappGroupLink"
          type="text"
          value={whatsappGroupLink}
          onChange={(e) => setWhatsappGroupLink(e.target.value)}
          placeholder="https://chat.whatsapp.com/..."
          required
          minLength={5}
          maxLength={255}
          className={inputCls}
        />
        <p className="mt-1 text-xs text-slate-400">
          Your customer community or announcement WhatsApp group invite link.
        </p>
      </div>

      <div>
        <label htmlFor="storeDesc" className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">
          Short description <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <textarea
          id="storeDesc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Tell buyers what makes your store great"
          rows={3}
          maxLength={600}
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-transparent dark:text-slate-100 dark:placeholder:text-slate-500"
        />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !isValid}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 text-sm font-bold text-white hover:bg-violet-500 disabled:opacity-50"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {busy ? "Submitting…" : "Submit application"}
      </button>
      <p className="text-center text-xs text-slate-400">
        Review usually takes a short while. You&apos;ll see the status here on your dashboard.
      </p>
    </form>
  );
}
