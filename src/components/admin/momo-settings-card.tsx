"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/shared";

interface Settings {
  id: string;
  enabled: boolean;
  network: string;
  momoNumber: string;
  accountName: string;
  instructions: string | null;
  minimumAmount: number;
  maximumAmount: number;
  claimExpiryHours: number;
}

export function MomoSettingsCard() {
  const { toast } = useToast();
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/momo/settings");
      const json = await res.json();
      setSettings(json.settings ?? null);
    } catch {
      toast("Failed to load settings", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    setSaving(true);
    try {
      const res = await fetch("/api/admin/momo/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: settings.enabled,
          network: settings.network,
          momoNumber: settings.momoNumber,
          accountName: settings.accountName,
          instructions: settings.instructions,
          minimumAmount: Number(settings.minimumAmount),
          maximumAmount: Number(settings.maximumAmount),
          claimExpiryHours: Number(settings.claimExpiryHours),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? "Failed to update settings", "error");
        return;
      }
      setSettings(json.settings);
      toast("Send & Claim settings updated successfully", "success");
    } catch {
      toast("Error saving settings", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="h-6 w-6 text-brand-600" />
      </div>
    );
  }

  if (!settings) return null;

  return (
    <div className="space-y-6 max-w-3xl">
      <form onSubmit={save} className="space-y-5 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-white/5 dark:bg-[#0d1526]">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-white/5">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Send &amp; Claim Service
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Configure the Mobile Money receiving number and claiming limits for users.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.enabled}
            onClick={() => setSettings({ ...settings, enabled: !settings.enabled })}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              settings.enabled ? "bg-emerald-600" : "bg-slate-300 dark:bg-slate-700"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                settings.enabled ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="momoNetwork">MoMo Network</Label>
            <Select
              id="momoNetwork"
              value={settings.network}
              onChange={(e) => setSettings({ ...settings, network: e.target.value })}
            >
              <option value="MTN">MTN</option>
              <option value="TELECEL">Telecel</option>
              <option value="AIRTELTIGO">AirtelTigo</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="momoNum">Admin MoMo Number</Label>
            <Input
              id="momoNum"
              value={settings.momoNumber}
              onChange={(e) => setSettings({ ...settings, momoNumber: e.target.value })}
              placeholder="024XXXXXXX"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="accountName">Account Name</Label>
            <Input
              id="accountName"
              value={settings.accountName}
              onChange={(e) => setSettings({ ...settings, accountName: e.target.value })}
              placeholder="Clickyfied"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="expiryHours">Claim Expiry (Hours)</Label>
            <Input
              id="expiryHours"
              type="number"
              min="1"
              max="720"
              value={settings.claimExpiryHours}
              onChange={(e) => setSettings({ ...settings, claimExpiryHours: Number(e.target.value) })}
              placeholder="168 (7 days)"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="minAmount">Minimum Claim Amount (GHS)</Label>
            <Input
              id="minAmount"
              type="number"
              step="0.01"
              min="0.10"
              value={settings.minimumAmount}
              onChange={(e) => setSettings({ ...settings, minimumAmount: Number(e.target.value) })}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="maxAmount">Maximum Claim Amount (GHS)</Label>
            <Input
              id="maxAmount"
              type="number"
              step="0.01"
              min="1"
              value={settings.maximumAmount}
              onChange={(e) => setSettings({ ...settings, maximumAmount: Number(e.target.value) })}
              required
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="instructions">User Instructions</Label>
          <Textarea
            id="instructions"
            rows={3}
            value={settings.instructions ?? ""}
            onChange={(e) => setSettings({ ...settings, instructions: e.target.value })}
            placeholder="Instructions shown to users on the Send & Claim page..."
          />
        </div>

        <div className="border-t border-slate-100 pt-4 dark:border-white/5">
          <Button type="submit" disabled={saving}>
            {saving && <Spinner />} Save Settings
          </Button>
        </div>
      </form>

      {/* SMS Forwarder Integration Guide */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-white/5 dark:bg-[#0d1526]">
        <h4 className="text-sm font-bold text-slate-900 dark:text-white">
          SMS Forwarder Integration Details
        </h4>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Configure your Android SMS Forwarder application to push Mobile Money transaction SMS messages to this endpoint.
        </p>

        <div className="mt-4 space-y-3 font-mono text-xs">
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
            <span className="text-slate-500 block">Webhook URL:</span>
            <span className="font-semibold text-brand-600 dark:text-brand-400 select-all">
              https://clickyfied.com/api/webhooks/momo/sms
            </span>
          </div>

          <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
            <span className="text-slate-500 block">HTTP Method:</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">POST</span>
          </div>

          <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
            <span className="text-slate-500 block">Authentication Header:</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              Authorization: Bearer [SMS_FORWARDER_SECRET]
            </span>
          </div>

          <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
            <span className="text-slate-500 block">JSON Body Format:</span>
            <pre className="mt-1 text-slate-700 dark:text-slate-300">
{`{
  "message": "Payment received for GHS 50.00 from 0241234567. Ref: Topup. Transaction ID: 123456789.",
  "from": "MTN MoMo",
  "timestamp": 1757698800000
}`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

