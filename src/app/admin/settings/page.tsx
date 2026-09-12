"use client";

import * as React from "react";
import { PageHeader, Spinner } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/toast";

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

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
      toast("Settings saved", "success");
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

  const halted = settings.order_processing_halted === "true";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Platform-wide configuration"
        actions={
          <Button onClick={save} disabled={saving}>
            {saving && <Spinner />} Save
          </Button>
        }
      />

      <div className="space-y-4 max-w-2xl">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Order processing</h3>
              <p className="text-xs text-slate-500">
                When halted, new orders are rejected with a friendly message.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={halted}
              onClick={() =>
                setSettings((s) => ({
                  ...s,
                  order_processing_halted: halted ? "false" : "true",
                }))
              }
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                halted ? "bg-red-500" : "bg-slate-300 dark:bg-slate-600"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  halted ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
          </div>
          <p
            className={`mt-3 rounded-xl px-3 py-2 text-xs font-medium ${
              halted
                ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
            }`}
          >
            {halted ? "Processing is currently HALTED" : "Processing is running normally"}
          </p>
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-sm font-semibold">General</h3>
          <div className="space-y-1.5">
            <Label>Site name</Label>
            <Input
              value={settings.site_name ?? ""}
              onChange={(e) => setSettings((s) => ({ ...s, site_name: e.target.value }))}
              placeholder="Clickyfied"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Support WhatsApp number</Label>
            <Input
              value={settings.support_whatsapp ?? ""}
              onChange={(e) => setSettings((s) => ({ ...s, support_whatsapp: e.target.value }))}
              placeholder="233XXXXXXXXX"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Default MoMo payment number</Label>
            <Input
              value={settings.default_momo_number ?? ""}
              onChange={(e) => setSettings((s) => ({ ...s, default_momo_number: e.target.value }))}
              placeholder="024XXXXXXX"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
