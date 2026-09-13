"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeader, Spinner } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import {
  Globe,
  Layers,
  Save,
  ShieldCheck,
  Store,
  Users,
} from "lucide-react";

type Category = "orders" | "users" | "mtn" | "storefront" | "general";

const CATEGORIES: Array<{ id: Category; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "orders", label: "Orders & Submission", icon: Layers },
  { id: "users", label: "Users & Roles", icon: Users },
  { id: "mtn", label: "MTN Verification", icon: ShieldCheck },
  { id: "storefront", label: "Storefront & Markup", icon: Store },
  { id: "general", label: "General & Branding", icon: Globe },
];

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [activeCat, setActiveCat] = React.useState<Category>("orders");

  React.useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => setSettings(d.settings ?? {}))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const json = await res.json();
      if (!res.ok) return toast(json.error ?? "Save failed", "error");
      setSettings(json.settings ?? {});
      toast("Settings saved successfully", "success");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-6 w-6 text-brand-600" />
      </div>
    );
  }

  const isHalted = settings.order_processing_halted === "true";
  const submissionKillSwitchOn = settings.number_submission_page_enabled !== "false";
  const mtnSingleOrderDaily = settings.mtn_single_order_per_day_enabled === "true";
  const allowRegistration = settings.allow_user_registration !== "false";
  const mtnVerificationEnabled = settings.mtn_number_verification_enabled === "true";
  const storefrontEnabled = settings.storefront_feature_enabled !== "false";
  const defaultRole = settings.default_register_role || "USER";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform Settings"
        description="Configure system operations, ordering rules, registration, and storefronts"
        actions={
          <Button onClick={save} disabled={saving} className="gap-1.5">
            {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />} Save Changes
          </Button>
        }
      />

      {/* Categories Bar */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const active = activeCat === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCat(cat.id)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                active
                  ? "bg-brand-600 text-white shadow-sm"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-white/20"
              }`}
            >
              <Icon className="h-4 w-4" />
              {cat.label}
            </button>
          );
        })}
      </div>

      <div className="max-w-3xl space-y-5">
        {/* Category 1: Orders & Submission */}
        {activeCat === "orders" && (
          <div className="space-y-4">
            {/* Number submission kill switch */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Number Submission Page Kill Switch
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Turn on or off the Send Orders submission page (`/dashboard/send`). When turned off,
                    customers cannot submit new recipient numbers.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={submissionKillSwitchOn}
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      number_submission_page_enabled: submissionKillSwitchOn ? "false" : "true",
                    }))
                  }
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    submissionKillSwitchOn ? "bg-emerald-600" : "bg-red-500"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      submissionKillSwitchOn ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
              <p
                className={`mt-3 rounded-xl px-3 py-2 text-xs font-medium ${
                  submissionKillSwitchOn
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                    : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                }`}
              >
                {submissionKillSwitchOn
                  ? "✓ Number submission page is ACTIVE (users can submit orders)"
                  : "✕ Number submission page is KILLED/OFF (submission disabled)"}
              </p>
            </div>

            {/* MTN single order per day */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    MTN Number Single Order Per Day
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    When enabled, an MTN phone number can only receive a single bundle order per day.
                    Subsequent orders to the same MTN number on the same day are rejected.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={mtnSingleOrderDaily}
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      mtn_single_order_per_day_enabled: mtnSingleOrderDaily ? "false" : "true",
                    }))
                  }
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    mtnSingleOrderDaily ? "bg-brand-600" : "bg-slate-300 dark:bg-slate-700"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      mtnSingleOrderDaily ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
              <p
                className={`mt-3 rounded-xl px-3 py-2 text-xs font-medium ${
                  mtnSingleOrderDaily
                    ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {mtnSingleOrderDaily
                  ? "✓ Enabled: Strictly 1 order per MTN number each day"
                  : "○ Disabled: MTN numbers can receive multiple orders per day"}
              </p>
            </div>

            {/* Global order processing halted switch */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Global Order Processing Switch
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Emergency system pause. When halted, all order endpoints return a 503 service unavailable message.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isHalted}
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      order_processing_halted: isHalted ? "false" : "true",
                    }))
                  }
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    isHalted ? "bg-red-500" : "bg-slate-300 dark:bg-slate-700"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      isHalted ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
              <p
                className={`mt-3 rounded-xl px-3 py-2 text-xs font-medium ${
                  isHalted
                    ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                    : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                }`}
              >
                {isHalted ? "⚠ Order processing is currently HALTED" : "✓ Order processing is running normally"}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Batch Submission Limits
              </h3>
              <div className="space-y-1.5">
                <Label>Max orders per batch upload/paste</Label>
                <Input
                  type="number"
                  value={settings.max_orders_per_submission ?? "500"}
                  onChange={(e) => setSettings((s) => ({ ...s, max_orders_per_submission: e.target.value }))}
                  placeholder="500"
                />
                <p className="text-[11px] text-slate-400">
                  Caps the maximum number of lines processed in a single Send Order batch.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Category 2: Users & Roles */}
        {activeCat === "users" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Registration & Default Role
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Choose the default role assigned to new customers upon account creation.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Default role customer gets when they first register</Label>
                <select
                  value={defaultRole}
                  onChange={(e) => setSettings((s) => ({ ...s, default_register_role: e.target.value }))}
                  className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  <option value="USER">USER (Regular data customer)</option>
                  <option value="RESELLER">RESELLER (Wholesale / Reseller account)</option>
                </select>
                <p className="text-[11px] text-slate-400">
                  New registrations will automatically receive this system role.
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                    Allow New Registrations
                  </h4>
                  <p className="text-xs text-slate-500">
                    When disabled, the register page blocks new account submissions.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={allowRegistration}
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      allow_user_registration: allowRegistration ? "false" : "true",
                    }))
                  }
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    allowRegistration ? "bg-emerald-600" : "bg-red-500"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      allowRegistration ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Category 3: MTN Number Verification */}
        {activeCat === "mtn" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    MTN Number Verification Enforcement
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {mtnVerificationEnabled
                      ? "Enforced: Only whitelisted MTN numbers can purchase MTN data bundles."
                      : "Relaxed: Any valid MTN number can order; unverified numbers are logged for admin review."}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={mtnVerificationEnabled}
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      mtn_number_verification_enabled: mtnVerificationEnabled ? "false" : "true",
                    }))
                  }
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    mtnVerificationEnabled ? "bg-brand-600" : "bg-slate-300 dark:bg-slate-700"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      mtnVerificationEnabled ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>

              <div className="space-y-1.5 pt-2">
                <Label>User Verification Instructions</Label>
                <Textarea
                  rows={3}
                  value={settings.mtn_verification_instructions ?? ""}
                  onChange={(e) => setSettings((s) => ({ ...s, mtn_verification_instructions: e.target.value }))}
                  placeholder="Submit your MTN number for verification before purchasing MTN packages."
                  className="text-xs"
                />
              </div>

              <div className="flex items-center gap-3 pt-2 text-xs border-t border-slate-100 dark:border-slate-800">
                <Link href="/admin/mtn-verification?tab=accepted" className="text-brand-600 hover:underline dark:text-brand-400 font-medium">
                  Manage Accepted Numbers →
                </Link>
                <Link href="/admin/mtn-verification?tab=batches" className="text-brand-600 hover:underline dark:text-brand-400 font-medium">
                  Verification Batches →
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Category 4: Storefront & Markup */}
        {activeCat === "storefront" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Storefront Feature Switch
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Enable or pause the public customer reseller stores and store applications.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={storefrontEnabled}
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      storefront_feature_enabled: storefrontEnabled ? "false" : "true",
                    }))
                  }
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    storefrontEnabled ? "bg-emerald-600" : "bg-slate-300 dark:bg-slate-700"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      storefrontEnabled ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 pt-2">
                <div className="space-y-1.5">
                  <Label>Min markup (GHS)</Label>
                  <Input
                    value={settings.storefront_min_markup ?? "0.50"}
                    onChange={(e) => setSettings((s) => ({ ...s, storefront_min_markup: e.target.value }))}
                    placeholder="0.50"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Max markup (GHS)</Label>
                  <Input
                    value={settings.storefront_max_markup ?? "10.00"}
                    onChange={(e) => setSettings((s) => ({ ...s, storefront_max_markup: e.target.value }))}
                    placeholder="10.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Min MoMo withdrawal (GHS)</Label>
                  <Input
                    value={settings.storefront_min_withdrawal ?? "50.00"}
                    onChange={(e) => setSettings((s) => ({ ...s, storefront_min_withdrawal: e.target.value }))}
                    placeholder="50.00"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <Link href="/admin/storefronts" className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400">
                  Manage Storefront Applications &amp; Withdrawals →
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Category 5: General & Branding */}
        {activeCat === "general" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Branding & Support Contacts
              </h3>
              <div className="space-y-1.5">
                <Label>Platform / Site Name</Label>
                <Input
                  value={settings.site_name ?? ""}
                  onChange={(e) => setSettings((s) => ({ ...s, site_name: e.target.value }))}
                  placeholder="Clickyfied"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Global User Announcement Banner</Label>
                <Input
                  value={settings.site_announcement ?? ""}
                  onChange={(e) => setSettings((s) => ({ ...s, site_announcement: e.target.value }))}
                  placeholder="e.g. Scheduled maintenance tonight at 11 PM GMT."
                />
                <p className="text-[11px] text-slate-400">
                  Displays as an announcement strip across the user dashboard when set.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Support WhatsApp Number</Label>
                <Input
                  value={settings.support_whatsapp ?? ""}
                  onChange={(e) => setSettings((s) => ({ ...s, support_whatsapp: e.target.value }))}
                  placeholder="233XXXXXXXXX"
                />
                <p className="text-[11px] text-slate-400">
                  Target for the floating support WhatsApp bubble on the bottom right.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Default MoMo Payment Number</Label>
                <Input
                  value={settings.default_momo_number ?? ""}
                  onChange={(e) => setSettings((s) => ({ ...s, default_momo_number: e.target.value }))}
                  placeholder="024XXXXXXX"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Support Contact Email</Label>
                <Input
                  type="email"
                  value={settings.contact_email ?? ""}
                  onChange={(e) => setSettings((s) => ({ ...s, contact_email: e.target.value }))}
                  placeholder="support@topshanka.com"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
