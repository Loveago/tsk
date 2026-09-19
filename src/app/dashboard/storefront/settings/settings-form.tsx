"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Globe, ExternalLink, Copy, Check, AlertTriangle, Loader2 } from "lucide-react";

interface Initial {
  slug: string;
  name: string;
  description: string;
  whatsapp: string;
  phone: string;
  whatsappGroupLink: string;
  location: string;
  contactText: string;
  whatsappLabel: string;
  payoutNetwork: string;
  payoutNumber: string;
  payoutAccountName: string;
}

export function StorefrontSettingsForm({
  initial,
  storefrontDomain = "tskdatastore.com",
}: {
  initial: Initial;
  storefrontDomain?: string;
}) {
  const router = useRouter();
  const [form, setForm] = React.useState(initial);
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Slug specific state
  const [currentSlug, setCurrentSlug] = React.useState(initial.slug);
  const [slugInput, setSlugInput] = React.useState(initial.slug);
  const [slugMsg, setSlugMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [slugBusy, setSlugBusy] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const cleanDomain = storefrontDomain.toLowerCase().replace(/^www\./, "");
  const liveStoreUrl = `https://${cleanDomain}/${currentSlug}`;
  const previewStoreUrl = `https://${cleanDomain}/${slugInput.trim() || currentSlug}`;

  const set = (k: keyof Initial) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function handleSlugChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Format input dynamically: lowercase, replace spaces with hyphens, filter characters
    const val = e.target.value
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    setSlugInput(val);
    if (slugMsg) setSlugMsg(null);
  }

  async function copyStoreLink() {
    try {
      await navigator.clipboard.writeText(liveStoreUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  async function saveSlug(e: React.FormEvent) {
    e.preventDefault();
    const cleanSlug = slugInput
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    if (cleanSlug.length < 3 || cleanSlug.length > 32) {
      setSlugMsg({ kind: "err", text: "Address slug must be between 3 and 32 characters." });
      return;
    }

    if (cleanSlug === currentSlug) {
      setSlugMsg({ kind: "ok", text: "Store address is already set to this." });
      return;
    }

    setSlugBusy(true);
    setSlugMsg(null);
    try {
      const res = await fetch("/api/storefront/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: cleanSlug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update store address");

      const savedSlug = data.storefront?.slug || cleanSlug;
      setCurrentSlug(savedSlug);
      setSlugInput(savedSlug);
      setSlugMsg({
        kind: "ok",
        text: `Store address updated successfully to ${cleanDomain}/${savedSlug}!`,
      });
      router.refresh();
    } catch (err) {
      setSlugMsg({ kind: "err", text: err instanceof Error ? err.message : "Failed to update store address" });
    } finally {
      setSlugBusy(false);
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/storefront/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeName: form.name,
          description: form.description,
          phone: form.phone,
          whatsappGroupLink: form.whatsappGroupLink,
          supportPhone: form.whatsapp,
          contactText: form.contactText,
          whatsappLabel: form.whatsappLabel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setMsg({ kind: "ok", text: "Store profile saved." });
      router.refresh();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Failed to save" });
    } finally {
      setBusy(false);
    }
  }

  async function savePayout(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/storefront/settings/payout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payoutNetwork: form.payoutNetwork,
          payoutNumber: form.payoutNumber,
          payoutAccountName: form.payoutAccountName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setMsg({ kind: "ok", text: "Payout account saved." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Failed to save" });
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 placeholder:text-slate-400 caret-brand-600 dark:border-slate-700 dark:bg-transparent dark:text-slate-100 dark:placeholder:text-slate-500 dark:caret-brand-400";

  return (
    <div className="space-y-6">
      {/* Dedicated Store Address / Slug Card */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/50 p-5 shadow-sm dark:border-slate-800 dark:from-[#0f172a] dark:to-[#0b1120]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600/10 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400">
              <Globe className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Store Web Address</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                The public link customers visit to browse and purchase data bundles from your store.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={liveStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Visit Store
            </a>
            <button
              type="button"
              onClick={copyStoreLink}
              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-100 dark:border-violet-800/60 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-900/50"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied!" : "Copy Link"}
            </button>
          </div>
        </div>

        {slugMsg && (
          <div
            className={`mt-4 rounded-xl p-3 text-xs font-medium ${
              slugMsg.kind === "ok"
                ? "border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-950/30 dark:text-emerald-300"
                : "border border-red-200 bg-red-50 text-red-800 dark:border-red-800/40 dark:bg-red-950/30 dark:text-red-300"
            }`}
          >
            {slugMsg.text}
          </div>
        )}

        <form onSubmit={saveSlug} className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Customize Store URL Slug
            </label>
            <div className="flex flex-col sm:flex-row sm:items-center">
              <div className="flex min-h-10 flex-1 items-stretch overflow-hidden rounded-lg border border-slate-300 focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-500 dark:border-slate-700">
                <span className="flex items-center bg-slate-100 px-3 text-xs font-medium text-slate-500 select-none dark:bg-slate-800 dark:text-slate-400">
                  https://{cleanDomain}/
                </span>
                <input
                  type="text"
                  value={slugInput}
                  onChange={handleSlugChange}
                  placeholder="e.g. kofi-bundles"
                  maxLength={32}
                  className="flex-1 bg-transparent px-3 py-2 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-white dark:placeholder:text-slate-500"
                />
              </div>
              <button
                type="submit"
                disabled={slugBusy || slugInput.trim() === currentSlug || slugInput.trim().length < 3}
                className="mt-2 sm:mt-0 sm:ml-3 inline-flex h-10 items-center justify-center rounded-lg bg-violet-600 px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {slugBusy ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Updating…
                  </>
                ) : (
                  "Update Address"
                )}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-500 dark:text-slate-400">
              <span>Allowed: 3–32 characters (lowercase letters, numbers, and hyphens).</span>
              <span className="font-mono text-slate-400 dark:text-slate-500">
                Preview: {previewStoreUrl}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-amber-200/70 bg-amber-50/70 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p>
              <strong>Notice:</strong> Changing your store address changes your public URL immediately. Any previous links or promotional materials using your old address will need to be updated.
            </p>
          </div>
        </form>
      </div>

      {msg && (
        <p className={`rounded-lg px-3 py-2 text-sm ${msg.kind === "ok" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"}`}>
          {msg.text}
        </p>
      )}

      <form onSubmit={saveProfile} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0d1526]">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Store profile</h2>
        <input value={form.name} onChange={set("name")} placeholder="Store name" required className={inputCls} />
        <textarea
          value={form.description}
          onChange={set("description")}
          placeholder="Short description shown on your public store"
          rows={3}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-transparent dark:text-slate-100 dark:placeholder:text-slate-500"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Contact Number</label>
            <input value={form.phone} onChange={set("phone")} placeholder="Primary contact e.g. 0241234567" inputMode="tel" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">WhatsApp Group Link</label>
            <input value={form.whatsappGroupLink} onChange={set("whatsappGroupLink")} placeholder="https://chat.whatsapp.com/..." className={inputCls} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Support WhatsApp Number</label>
            <input value={form.whatsapp} onChange={set("whatsapp")} placeholder="WhatsApp support e.g. 0241234567" inputMode="tel" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Location (optional)</label>
            <input value={form.location} onChange={set("location")} placeholder="e.g. Accra, Ghana" className={inputCls} />
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
            Contact bubble (shown on your store)
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Bubble message</label>
              <input
                value={form.contactText}
                onChange={set("contactText")}
                placeholder="Need help? Chat with us on WhatsApp"
                maxLength={120}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Button label</label>
              <input
                value={form.whatsappLabel}
                onChange={set("whatsappLabel")}
                placeholder="Need help?"
                maxLength={40}
                className={inputCls}
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            A floating WhatsApp button appears on your store using these texts. Leave empty for defaults.
          </p>
        </div>
        <button type="submit" disabled={busy} className="h-10 rounded-lg bg-violet-600 px-5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50">
          Save profile
        </button>
      </form>

      <form onSubmit={savePayout} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0d1526]">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Default MoMo payout account</h2>
        <p className="text-xs text-slate-500">Pre-filled when you request withdrawals.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <select value={form.payoutNetwork} onChange={set("payoutNetwork")} className={`${inputCls} dark:bg-[#0d1526]`}>
            <option value="MTN">MTN MoMo</option>
            <option value="TELECEL">Telecel Cash</option>
            <option value="AIRTELTIGO">AirtelTigo Money</option>
          </select>
          <input value={form.payoutNumber} onChange={set("payoutNumber")} placeholder="MoMo number e.g. 0241234567" inputMode="tel" className={inputCls} />
        </div>
        <input value={form.payoutAccountName} onChange={set("payoutAccountName")} placeholder="Account name" className={inputCls} />
        <button type="submit" disabled={busy} className="h-10 rounded-lg bg-violet-600 px-5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50">
          Save payout account
        </button>
      </form>
    </div>
  );
}
