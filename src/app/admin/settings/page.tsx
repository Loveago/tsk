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
  Wallet,
  Wrench,
  Lock,
  MessageSquare,
  FileText,
  Mail,
  Eye,
  EyeOff,
  Send,
  Megaphone,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Check,
} from "lucide-react";

type Category =
  | "orders"
  | "users"
  | "announcements"
  | "mtn"
  | "storefront"
  | "billing"
  | "email"
  | "api"
  | "general"
  | "momo"
  | "wallet"
  | "maintenance"
  | "security"
  | "notifications"
  | "reports";

const CATEGORIES: Array<{ id: Category; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "orders", label: "Orders & Submission", icon: Layers },
  { id: "users", label: "Users & Roles", icon: Users },
  { id: "announcements", label: "Announcement Banner", icon: Megaphone },
  { id: "mtn", label: "MTN Verification", icon: ShieldCheck },
  { id: "storefront", label: "Storefront & Markup", icon: Store },
  { id: "billing", label: "Billing & Payments", icon: Globe },
  { id: "email", label: "Email & Brevo", icon: Mail },
  { id: "api", label: "API Access", icon: Layers },
  { id: "general", label: "General & Branding", icon: Globe },
  { id: "momo", label: "Send Claim / MoMo", icon: Wallet },
  { id: "wallet", label: "Wallet & Withdrawals", icon: Wallet },
  { id: "maintenance", label: "Maintenance", icon: Wrench },
  { id: "security", label: "Security", icon: Lock },
  { id: "notifications", label: "Notifications & Contact", icon: MessageSquare },
  { id: "reports", label: "Reports", icon: FileText },
];

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [activeCat, setActiveCat] = React.useState<Category>("orders");
  const [showPaystackKey, setShowPaystackKey] = React.useState(false);
  const [showBrevoKey, setShowBrevoKey] = React.useState(false);
  const [testEmailTo, setTestEmailTo] = React.useState("");
  const [sendingTestEmail, setSendingTestEmail] = React.useState(false);
  const [newTemplateText, setNewTemplateText] = React.useState("");
  const [newCategoryText, setNewCategoryText] = React.useState("");

  const DEFAULT_ANNOUNCEMENT_TEMPLATES = React.useMemo(
    () => [
      "⚠️ MTN network downtime currently affecting orders. Processing will resume shortly.",
      "🛠️ Scheduled maintenance tonight at 11:00 PM GMT. Service will be briefly unavailable.",
      "🎉 Promo Alert! Enjoy special reseller data bundle rates this weekend.",
      "⏳ Telecel bundle deliveries are experiencing slight delays. We are actively monitoring.",
      "✅ System updates completed. All services are running at normal capacity.",
    ],
    []
  );

  const ADMIN_PAGE_OPTIONS = React.useMemo(
    () => [
      { href: "/admin", label: "Dashboard Overview" },
      { href: "/admin/orders", label: "Orders" },
      { href: "/admin/exports", label: "Exports" },
      { href: "/admin/delivery-reports", label: "Not Received (Reports)" },
      { href: "/admin/mtn-verification", label: "MTN Verification" },
      { href: "/admin/storefronts", label: "Storefronts" },
      { href: "/admin/packages", label: "Package Catalogue" },
      { href: "/admin/pricing", label: "Pricing Matrix" },
      { href: "/admin/billing", label: "Billing & Payments" },
      { href: "/admin/reports", label: "Reports & Analytics" },
      { href: "/admin/users", label: "Users & Accounts" },
      { href: "/admin/users/signup-codes", label: "Signup Codes" },
      { href: "/admin/api", label: "Developer API" },
      { href: "/admin/settings", label: "Platform Settings" },
      { href: "/admin/audit-logs", label: "Audit Logs" },
    ],
    []
  );

  const SYSTEM_DEFAULT_CATEGORIES = React.useMemo(() => ["MTN", "TELECEL", "AIRTELTIGO"], []);

  const customAnnouncementTemplates: string[] = React.useMemo(() => {
    try {
      return settings.announcement_templates ? JSON.parse(settings.announcement_templates) : [];
    } catch {
      return [];
    }
  }, [settings.announcement_templates]);

  const secretaryAllowedPages: string[] = React.useMemo(() => {
    try {
      return settings.secretary_allowed_pages
        ? JSON.parse(settings.secretary_allowed_pages)
        : ["/admin", "/admin/orders", "/admin/exports", "/admin/delivery-reports"];
    } catch {
      return ["/admin", "/admin/orders", "/admin/exports", "/admin/delivery-reports"];
    }
  }, [settings.secretary_allowed_pages]);

  const customCategories: string[] = React.useMemo(() => {
    try {
      return settings.custom_package_categories
        ? JSON.parse(settings.custom_package_categories)
        : [];
    } catch {
      return [];
    }
  }, [settings.custom_package_categories]);

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

  const handleSendTestEmail = async () => {
    setSendingTestEmail(true);
    try {
      const res = await fetch("/api/admin/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toEmail: testEmailTo.trim() || undefined,
          apiKey: settings.brevo_api_key?.trim() || undefined,
          senderEmail: settings.brevo_sender_email?.trim() || undefined,
          senderName: settings.brevo_sender_name?.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast(json.error || "Failed to send test email", "error");
        return;
      }
      toast(`Test email sent successfully to ${json.recipient}!`, "success");
    } catch {
      toast("Failed to trigger test email", "error");
    } finally {
      setSendingTestEmail(false);
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
  const storefrontApplyEnabled = settings.storefront_apply_enabled !== "false";
  const paystackTopupEnabled = settings.paystack_topup_enabled === "true";
  const loginOtpEnabled = settings.login_otp_enabled === "true";
  const apiFeatureEnabled = settings.api_feature_enabled === "true";
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

            {/* Package & Order Categories (Custom Categories) */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Package &amp; Order Categories
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Manage network bundle categories beyond the default 3 (MTN, Telecel, AirtelTigo).
                  Custom categories appear in the package manager, pricing matrix, and ordering filters.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Active Categories</Label>
                <div className="flex flex-wrap gap-2">
                  {SYSTEM_DEFAULT_CATEGORIES.map((cat) => (
                    <span
                      key={cat}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      {cat}
                      <span className="text-[10px] text-slate-400 font-normal">(System)</span>
                    </span>
                  ))}
                  {customCategories.map((cat) => (
                    <span
                      key={cat}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50/60 px-3 py-1.5 text-xs font-semibold text-brand-800 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
                      {cat}
                      <button
                        type="button"
                        onClick={() => {
                          const next = customCategories.filter((c) => c !== cat);
                          setSettings((s) => ({ ...s, custom_package_categories: JSON.stringify(next) }));
                          toast(`Category "${cat}" removed`, "info");
                        }}
                        className="ml-1 rounded-full p-0.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                        title="Remove category"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <Label>Add Custom Category</Label>
                <div className="mt-1.5 flex gap-2">
                  <Input
                    value={newCategoryText}
                    onChange={(e) => setNewCategoryText(e.target.value.toUpperCase())}
                    placeholder="e.g. SURFLINE or SPECTRANET"
                    className="uppercase font-mono text-xs max-w-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const trimmed = newCategoryText.trim().toUpperCase();
                      if (!trimmed) return;
                      if (SYSTEM_DEFAULT_CATEGORIES.includes(trimmed) || customCategories.includes(trimmed)) {
                        toast("Category already exists", "error");
                        return;
                      }
                      const next = [...customCategories, trimmed];
                      setSettings((s) => ({ ...s, custom_package_categories: JSON.stringify(next) }));
                      setNewCategoryText("");
                      toast(`Category "${trimmed}" added`, "success");
                    }}
                    className="gap-1"
                  >
                    <Plus className="h-4 w-4" /> Add Category
                  </Button>
                </div>
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

            {/* Secretary Role & Permissions */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Secretary Role &amp; Permissions
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Configure access control and authentication behavior for staff members assigned the SECRETARY role.
                </p>
              </div>

              {/* Secretary OTP Bypass */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                    Secretary Login Without OTP
                  </h4>
                  <p className="text-xs text-slate-500">
                    When enabled, accounts with the SECRETARY role bypass email OTP verification on login for faster operational access.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.secretary_login_without_otp === "true"}
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      secretary_login_without_otp: s.secretary_login_without_otp === "true" ? "false" : "true",
                    }))
                  }
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    settings.secretary_login_without_otp === "true" ? "bg-emerald-600" : "bg-slate-300 dark:bg-slate-700"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      settings.secretary_login_without_otp === "true" ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>

              {/* Secretary Allowed Pages Checklist */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                      Secretary Page Access Permissions
                    </h4>
                    <p className="text-xs text-slate-500">
                      Select which admin dashboard sections Secretaries are permitted to view and manage.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setSettings((s) => ({
                          ...s,
                          secretary_allowed_pages: JSON.stringify(ADMIN_PAGE_OPTIONS.map((o) => o.href)),
                        }))
                      }
                      className="text-[11px] font-semibold text-brand-600 hover:underline dark:text-brand-400"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300 dark:text-slate-700">|</span>
                    <button
                      type="button"
                      onClick={() =>
                        setSettings((s) => ({
                          ...s,
                          secretary_allowed_pages: JSON.stringify(["/admin"]),
                        }))
                      }
                      className="text-[11px] font-semibold text-slate-500 hover:underline dark:text-slate-400"
                    >
                      Reset to Minimal
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 pt-1">
                  {ADMIN_PAGE_OPTIONS.map((page) => {
                    const isChecked = secretaryAllowedPages.includes(page.href);
                    return (
                      <label
                        key={page.href}
                        className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-xs transition-colors cursor-pointer ${
                          isChecked
                            ? "border-brand-500/40 bg-brand-50/40 text-slate-900 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-white"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            const next = isChecked
                              ? secretaryAllowedPages.filter((p) => p !== page.href)
                              : [...secretaryAllowedPages, page.href];
                            setSettings((s) => ({ ...s, secretary_allowed_pages: JSON.stringify(next) }));
                          }}
                          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{page.label}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{page.href}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Category: Announcement Banner */}
        {activeCat === "announcements" && (
          <div className="space-y-4">
            {/* Live Preview Card */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <Megaphone className="h-4 w-4 text-brand-600" />
                    Global Announcement Banner
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Displays continuously across the top of all user dashboard pages with right-to-left continuous slide-and-fade animation.
                  </p>
                </div>
                {settings.site_announcement?.trim() ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    Inactive (Empty)
                  </span>
                )}
              </div>

              {/* Active Text Input */}
              <div className="space-y-1.5 pt-2">
                <div className="flex items-center justify-between">
                  <Label>Current Active Announcement</Label>
                  {settings.site_announcement && (
                    <button
                      type="button"
                      onClick={() => setSettings((s) => ({ ...s, site_announcement: "" }))}
                      className="text-[11px] font-medium text-red-500 hover:underline"
                    >
                      Clear Banner
                    </button>
                  )}
                </div>
                <Textarea
                  rows={2}
                  value={settings.site_announcement ?? ""}
                  onChange={(e) => setSettings((s) => ({ ...s, site_announcement: e.target.value }))}
                  placeholder="Enter global announcement text (or choose from pre-typed templates below)..."
                />
              </div>

              {/* Live Animated Preview */}
              <div className="pt-2">
                <Label className="text-xs text-slate-400 uppercase tracking-wider">Live User Preview</Label>
                <div className="mt-1.5 overflow-hidden rounded-xl border border-amber-300/60 bg-amber-400/15 py-2.5 px-3 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 shadow-inner">
                  {settings.site_announcement?.trim() ? (
                    <div className="overflow-hidden whitespace-nowrap">
                      <p className="inline-block text-xs font-semibold animate-banner-slide">
                        📢 {settings.site_announcement} &nbsp;&nbsp;&nbsp; • &nbsp;&nbsp;&nbsp; 📢 {settings.site_announcement}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-center italic text-slate-400 py-1">
                      No announcement active. Enter text above or click "Use Template" below to preview.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Pre-typed Templates Management */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500" /> Pre-typed Announcement Templates
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Select a pre-typed message for instant activation, or save your own custom announcements for reuse.
                </p>
              </div>

              {/* Add Custom Template */}
              <div className="flex gap-2">
                <Input
                  value={newTemplateText}
                  onChange={(e) => setNewTemplateText(e.target.value)}
                  placeholder="Create a new reusable announcement template..."
                  className="text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const trimmed = newTemplateText.trim();
                    if (!trimmed) return;
                    const next = [...customAnnouncementTemplates, trimmed];
                    setSettings((s) => ({ ...s, announcement_templates: JSON.stringify(next) }));
                    setNewTemplateText("");
                    toast("New template saved", "success");
                  }}
                  className="gap-1 shrink-0"
                >
                  <Plus className="h-4 w-4" /> Save Template
                </Button>
              </div>

              {/* Templates List */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Ready-to-Use Templates
                </p>
                <div className="space-y-2">
                  {DEFAULT_ANNOUNCEMENT_TEMPLATES.map((tmpl, idx) => {
                    const isCurrent = settings.site_announcement === tmpl;
                    return (
                      <div
                        key={`default-${idx}`}
                        className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-xs transition-colors ${
                          isCurrent
                            ? "border-emerald-500/40 bg-emerald-50/40 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                            : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            Preset
                          </span>
                          <p className="truncate font-medium text-slate-800 dark:text-slate-200">{tmpl}</p>
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          {isCurrent ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                              <Check className="h-3.5 w-3.5" /> Active
                            </span>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSettings((s) => ({ ...s, site_announcement: tmpl }));
                                toast("Applied template to active announcement", "info");
                              }}
                              className="h-7 text-xs"
                            >
                              Use Template
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {customAnnouncementTemplates.map((tmpl, idx) => {
                    const isCurrent = settings.site_announcement === tmpl;
                    return (
                      <div
                        key={`custom-${idx}`}
                        className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-xs transition-colors ${
                          isCurrent
                            ? "border-emerald-500/40 bg-emerald-50/40 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                            : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
                            Custom
                          </span>
                          <p className="truncate font-medium text-slate-800 dark:text-slate-200">{tmpl}</p>
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          {isCurrent ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                              <Check className="h-3.5 w-3.5" /> Active
                            </span>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSettings((s) => ({ ...s, site_announcement: tmpl }));
                                toast("Applied template to active announcement", "info");
                              }}
                              className="h-7 text-xs"
                            >
                              Use Template
                            </Button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              const next = customAnnouncementTemplates.filter((_, i) => i !== idx);
                              setSettings((s) => ({ ...s, announcement_templates: JSON.stringify(next) }));
                              toast("Template removed", "info");
                            }}
                            className="rounded p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                            title="Delete template"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
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
                    Bulk Storefront Feature Switch (Master Toggle)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Admin master switch to bulk disable/pause or re-enable all customer reseller storefronts.
                    When paused, all public storefront pages and store checkouts are immediately blocked.
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
                    storefrontEnabled ? "bg-emerald-600" : "bg-red-500"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      storefrontEnabled ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>

              <div
                className={`mt-3 rounded-xl px-3 py-2 text-xs font-medium flex items-center justify-between ${
                  storefrontEnabled
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                    : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                }`}
              >
                <span>
                  {storefrontEnabled
                    ? "✓ All storefronts are ACTIVE — Resellers can take orders and customers can purchase."
                    : "⚠ All storefronts are BULK DISABLED / PAUSED — Public store visitors see maintenance notice."}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      storefront_feature_enabled: storefrontEnabled ? "false" : "true",
                    }))
                  }
                  className="font-bold underline ml-2 shrink-0"
                >
                  {storefrontEnabled ? "Pause All Now" : "Re-Enable All"}
                </button>
              </div>

              <div className="flex items-center justify-between gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Storefront Apply Access
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    When enabled, users can submit new storefront applications.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={storefrontApplyEnabled}
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      storefront_apply_enabled: storefrontApplyEnabled ? "false" : "true",
                    }))
                  }
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    storefrontApplyEnabled ? "bg-emerald-600" : "bg-slate-300 dark:bg-slate-700"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      storefrontApplyEnabled ? "left-[22px]" : "left-0.5"
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
                  placeholder="Tskconnect"
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
                  placeholder="support@tskconnect.com"
                />
              </div>
            </div>
          </div>
        )}
        {/* Category 6: Billing & Payments */}
        {activeCat === "billing" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Paystack Top-up Enabled
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Enable or disable automatic Paystack top-ups for customers.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={paystackTopupEnabled}
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      paystack_topup_enabled: paystackTopupEnabled ? "false" : "true",
                    }))
                  }
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    paystackTopupEnabled ? "bg-emerald-600" : "bg-slate-300 dark:bg-slate-700"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      paystackTopupEnabled ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="space-y-1.5">
                  <Label>Min Paystack Top-up (GHS)</Label>
                  <Input
                    type="number"
                    value={settings.paystack_min_topup ?? "10"}
                    onChange={(e) => setSettings((s) => ({ ...s, paystack_min_topup: e.target.value }))}
                    placeholder="10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Max Paystack Top-up (GHS)</Label>
                  <Input
                    type="number"
                    value={settings.paystack_max_topup ?? "5000"}
                    onChange={(e) => setSettings((s) => ({ ...s, paystack_max_topup: e.target.value }))}
                    placeholder="5000"
                  />
                </div>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <Label>Paystack Secret Key</Label>
                  <button
                    type="button"
                    onClick={() => setShowPaystackKey(!showPaystackKey)}
                    className="text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 inline-flex items-center gap-1 font-medium"
                  >
                    {showPaystackKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {showPaystackKey ? "Hide" : "Show"}
                  </button>
                </div>
                <Input
                  type={showPaystackKey ? "text" : "password"}
                  value={settings.paystack_secret_key ?? ""}
                  onChange={(e) => setSettings((s) => ({ ...s, paystack_secret_key: e.target.value }))}
                  placeholder="sk_live_... or sk_test_..."
                  className="font-mono text-sm"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Stored securely in database settings. Overrides PAYSTACK_SECRET_KEY in environment variables when provided.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Category: Email & Brevo */}
        {activeCat === "email" && (
          <div className="space-y-4">
            {/* Brevo API Credentials */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Brevo Email API Configuration
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Configure Brevo (formerly Sendinblue) as your platform transactional email provider.
                </p>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Brevo API Key</Label>
                    <button
                      type="button"
                      onClick={() => setShowBrevoKey(!showBrevoKey)}
                      className="text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 inline-flex items-center gap-1 font-medium"
                    >
                      {showBrevoKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      {showBrevoKey ? "Hide" : "Show"}
                    </button>
                  </div>
                  <Input
                    type={showBrevoKey ? "text" : "password"}
                    value={settings.brevo_api_key ?? ""}
                    onChange={(e) => setSettings((s) => ({ ...s, brevo_api_key: e.target.value }))}
                    placeholder="xkeysib-..."
                    className="font-mono text-sm"
                  />
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Obtain your API key from Brevo dashboard &rarr; SMTP &amp; API &rarr; API Keys.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Brevo Sender Email</Label>
                    <Input
                      type="email"
                      value={settings.brevo_sender_email ?? ""}
                      onChange={(e) => setSettings((s) => ({ ...s, brevo_sender_email: e.target.value }))}
                      placeholder="support@yourdomain.com"
                    />
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Must be a verified sender in your Brevo account.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Brevo Sender Name</Label>
                    <Input
                      value={settings.brevo_sender_name ?? ""}
                      onChange={(e) => setSettings((s) => ({ ...s, brevo_sender_name: e.target.value }))}
                      placeholder="Tskconnect"
                    />
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Friendly display name shown on outgoing emails.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Login OTP Toggle */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Require Email OTP on Login
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    When enabled, users must enter a 6-digit one-time verification code sent to their email to sign in. Admins are exempt and never require OTP.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={loginOtpEnabled}
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      login_otp_enabled: loginOtpEnabled ? "false" : "true",
                    }))
                  }
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    loginOtpEnabled ? "bg-emerald-600" : "bg-slate-300 dark:bg-slate-700"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      loginOtpEnabled ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Test Email Verification */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Test Email Dispatch
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Verify that your Brevo credentials work properly. Note: Make sure to click &quot;Save Changes&quot; above first.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5 items-end">
                <div className="space-y-1.5 flex-1 w-full">
                  <Label>Recipient Email</Label>
                  <Input
                    type="email"
                    value={testEmailTo}
                    onChange={(e) => setTestEmailTo(e.target.value)}
                    placeholder="Leave empty to send to your admin email"
                  />
                </div>
                <Button
                  type="button"
                  onClick={handleSendTestEmail}
                  disabled={sendingTestEmail}
                  variant="outline"
                  className="gap-1.5 shrink-0"
                >
                  {sendingTestEmail ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                  Send Test Email
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Category 7: API Access */}
        {activeCat === "api" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    API Feature Enabled
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Enable or disable developer API access and application submissions.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={apiFeatureEnabled}
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      api_feature_enabled: apiFeatureEnabled ? "false" : "true",
                    }))
                  }
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    apiFeatureEnabled ? "bg-brand-600" : "bg-slate-300 dark:bg-slate-700"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      apiFeatureEnabled ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Category 8: Send Claim / MoMo */}
        {activeCat === "momo" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Send Claim Enabled
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Master kill switch for send-claim feature.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.send_claim_enabled === "true"}
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      send_claim_enabled: s.send_claim_enabled === "true" ? "false" : "true",
                    }))
                  }
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    settings.send_claim_enabled === "true" ? "bg-brand-600" : "bg-slate-300 dark:bg-slate-700"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      settings.send_claim_enabled === "true" ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="space-y-1.5">
                  <Label>Min Claim Amount (GHS)</Label>
                  <Input
                    type="number"
                    value={settings.send_claim_min_amount ?? "1"}
                    onChange={(e) => setSettings((s) => ({ ...s, send_claim_min_amount: e.target.value }))}
                    placeholder="1"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Max Claim Amount (GHS)</Label>
                  <Input
                    type="number"
                    value={settings.send_claim_max_amount ?? "5000"}
                    onChange={(e) => setSettings((s) => ({ ...s, send_claim_max_amount: e.target.value }))}
                    placeholder="5000"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Expiry Hours</Label>
                  <Input
                    type="number"
                    value={settings.send_claim_expiry_hours ?? "168"}
                    onChange={(e) => setSettings((s) => ({ ...s, send_claim_expiry_hours: e.target.value }))}
                    placeholder="168"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Max Active Claims Per User</Label>
                  <Input
                    type="number"
                    value={settings.send_claim_max_active_per_user ?? "5"}
                    onChange={(e) => setSettings((s) => ({ ...s, send_claim_max_active_per_user: e.target.value }))}
                    placeholder="5"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Category 9: Wallet & Withdrawals */}
        {activeCat === "wallet" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Withdrawal Feature Enabled
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Allow or block user withdrawals.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.storefront_withdrawal_enabled === "true"}
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      storefront_withdrawal_enabled: s.storefront_withdrawal_enabled === "true" ? "false" : "true",
                    }))
                  }
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    settings.storefront_withdrawal_enabled === "true" ? "bg-brand-600" : "bg-slate-300 dark:bg-slate-700"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      settings.storefront_withdrawal_enabled === "true" ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Auto-Approve Withdrawals
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Auto-approve withdrawals without admin action.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.storefront_auto_approve_withdrawal === "true"}
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      storefront_auto_approve_withdrawal: s.storefront_auto_approve_withdrawal === "true" ? "false" : "true",
                    }))
                  }
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    settings.storefront_auto_approve_withdrawal === "true" ? "bg-emerald-600" : "bg-slate-300 dark:bg-slate-700"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      settings.storefront_auto_approve_withdrawal === "true" ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="space-y-1.5">
                  <Label>Withdrawal Fee Percent (%)</Label>
                  <Input
                    type="number"
                    value={settings.storefront_withdrawal_fee_percent ?? "0"}
                    onChange={(e) => setSettings((s) => ({ ...s, storefront_withdrawal_fee_percent: e.target.value }))}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Max Single Withdrawal (GHS)</Label>
                  <Input
                    type="number"
                    value={settings.storefront_max_withdrawal ?? "10000"}
                    onChange={(e) => setSettings((s) => ({ ...s, storefront_max_withdrawal: e.target.value }))}
                    placeholder="10000"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Category 10: Maintenance */}
        {activeCat === "maintenance" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Maintenance Mode
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    When ON, non-admin users accessing /dashboard/* see a maintenance page instead.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.maintenance_mode_enabled === "true"}
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      maintenance_mode_enabled: s.maintenance_mode_enabled === "true" ? "false" : "true",
                    }))
                  }
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    settings.maintenance_mode_enabled === "true" ? "bg-red-500" : "bg-slate-300 dark:bg-slate-700"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      settings.maintenance_mode_enabled === "true" ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Category 11: Security */}
        {activeCat === "security" && (
          <div className="space-y-4">
            {/* Login OTP Requirement Toggle */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      Require Email OTP on Login
                    </h3>
                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                      Admin Exempt
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    When enabled, users must enter a 6-digit one-time verification code sent to their email to sign in. Admins log in directly without OTP.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={loginOtpEnabled}
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      login_otp_enabled: loginOtpEnabled ? "false" : "true",
                    }))
                  }
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    loginOtpEnabled ? "bg-emerald-600" : "bg-slate-300 dark:bg-slate-700"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      loginOtpEnabled ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Platform Security Rules
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-2">
                <div className="space-y-1.5">
                  <Label>Max Login Attempts</Label>
                  <Input
                    type="number"
                    value={settings.max_login_attempts ?? "5"}
                    onChange={(e) => setSettings((s) => ({ ...s, max_login_attempts: e.target.value }))}
                    placeholder="5"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Login Lockout Duration (Minutes)</Label>
                  <Input
                    type="number"
                    value={settings.login_lockout_minutes ?? "15"}
                    onChange={(e) => setSettings((s) => ({ ...s, login_lockout_minutes: e.target.value }))}
                    placeholder="15"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Password Reset Expiry (Minutes)</Label>
                  <Input
                    type="number"
                    value={settings.password_reset_expiry_minutes ?? "60"}
                    onChange={(e) => setSettings((s) => ({ ...s, password_reset_expiry_minutes: e.target.value }))}
                    placeholder="60"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>API Rate Limit (per minute)</Label>
                  <Input
                    type="number"
                    value={settings.api_rate_limit_per_minute ?? "60"}
                    onChange={(e) => setSettings((s) => ({ ...s, api_rate_limit_per_minute: e.target.value }))}
                    placeholder="60"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Category 12: Notifications & Contact */}
        {activeCat === "notifications" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Support & Communications
              </h3>
              <div className="space-y-1.5">
                <Label>Support Phone Number</Label>
                <Input
                  value={settings.support_phone ?? ""}
                  onChange={(e) => setSettings((s) => ({ ...s, support_phone: e.target.value }))}
                  placeholder="233XXXXXXXXX"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Support Telegram</Label>
                <Input
                  value={settings.support_telegram ?? ""}
                  onChange={(e) => setSettings((s) => ({ ...s, support_telegram: e.target.value }))}
                  placeholder="@tskconnect"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Support Email</Label>
                <Input
                  value={settings.support_email ?? ""}
                  onChange={(e) => setSettings((s) => ({ ...s, support_email: e.target.value }))}
                  placeholder="support@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Footer Text</Label>
                <Input
                  value={settings.footer_text ?? ""}
                  onChange={(e) => setSettings((s) => ({ ...s, footer_text: e.target.value }))}
                  placeholder="Powered by Tskconnect"
                />
              </div>
            </div>
          </div>
        )}

        {/* Category 13: Reports */}
        {activeCat === "reports" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    User Reports Enabled
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Allow users to submit "not received" reports.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.reports_enabled === "true"}
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      reports_enabled: s.reports_enabled === "true" ? "false" : "true",
                    }))
                  }
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    settings.reports_enabled === "true" ? "bg-brand-600" : "bg-slate-300 dark:bg-slate-700"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      settings.reports_enabled === "true" ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="space-y-1.5">
                  <Label>Not Received Window (Hours)</Label>
                  <Input
                    type="number"
                    value={settings.report_not_received_window_hours ?? "24"}
                    onChange={(e) => setSettings((s) => ({ ...s, report_not_received_window_hours: e.target.value }))}
                    placeholder="24"
                  />
                  <p className="text-[11px] text-slate-400">Hours after order completes that user can report</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Max Date Range for Admin Queries (Days)</Label>
                  <Input
                    type="number"
                    value={settings.reports_max_date_range_days ?? "90"}
                    onChange={(e) => setSettings((s) => ({ ...s, reports_max_date_range_days: e.target.value }))}
                    placeholder="90"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Auto-close Unresolved Reports After (Days)</Label>
                  <Input
                    type="number"
                    value={settings.report_auto_close_days ?? "7"}
                    onChange={(e) => setSettings((s) => ({ ...s, report_auto_close_days: e.target.value }))}
                    placeholder="7"
                  />
                </div>
              </div>
            </div>
          </div>
        )}


      </div>
    </div>
  );
}
