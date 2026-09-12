"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

interface Initial {
  name: string;
  description: string;
  whatsapp: string;
  phone: string;
  location: string;
  contactText: string;
  whatsappLabel: string;
  payoutNetwork: string;
  payoutNumber: string;
  payoutAccountName: string;
}

export function StorefrontSettingsForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [form, setForm] = React.useState(initial);
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);

  const set = (k: keyof Initial) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

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

  const inputCls = "h-10 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-transparent";

  return (
    <div className="space-y-4">
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
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-transparent"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <input value={form.whatsapp} onChange={set("whatsapp")} placeholder="WhatsApp number e.g. 0241234567" inputMode="tel" className={inputCls} />
          <input value={form.location} onChange={set("location")} placeholder="Location (optional)" className={inputCls} />
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
