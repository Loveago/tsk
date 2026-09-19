"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/shared";
import { Copy, Check, Terminal, Smartphone, Key, Globe, ShieldCheck } from "lucide-react";

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
  const [serverWebhookUrl, setServerWebhookUrl] = React.useState("");
  const [origin, setOrigin] = React.useState(() => {
    if (typeof window !== "undefined") return window.location.origin;
    return "";
  });

  const [copiedWebhook, setCopiedWebhook] = React.useState(false);
  const [forwarderSecret, setForwarderSecret] = React.useState("tskconnect_forwarder_secret_2026");
  const [copiedSecret, setCopiedSecret] = React.useState(false);
  const [copiedFullUrl, setCopiedFullUrl] = React.useState(false);
  const [copiedHeader, setCopiedHeader] = React.useState(false);
  const [copiedCustomHeader, setCopiedCustomHeader] = React.useState(false);
  const [copiedCurl, setCopiedCurl] = React.useState(false);
  const [copiedTemplate, setCopiedTemplate] = React.useState(false);

  const [activeMethod, setActiveMethod] = React.useState<"query" | "bearer" | "header">("query");
  const [activeApp, setActiveApp] = React.useState<"macrodroid" | "smsforwarder">("macrodroid");

  React.useEffect(() => {
    if (typeof window !== "undefined" && !origin) {
      setOrigin(window.location.origin);
    }
  }, [origin]);

  const webhookUrl =
    serverWebhookUrl ||
    (origin ? `${origin}/api/webhooks/momo/sms` : "/api/webhooks/momo/sms");

  const fullUrlWithSecret = webhookUrl.includes("?")
    ? `${webhookUrl}&secret=${forwarderSecret}`
    : `${webhookUrl}?secret=${forwarderSecret}`;

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/momo/settings");
      const json = await res.json();
      setSettings(json.settings ?? null);
      if (json.webhookUrl) setServerWebhookUrl(json.webhookUrl);
      if (json.forwarderSecret) setForwarderSecret(json.forwarderSecret);
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

  const copyToClipboard = (text: string, setter: (val: boolean) => void, msg: string) => {
    navigator.clipboard.writeText(text);
    setter(true);
    toast(msg, "success");
    setTimeout(() => setter(false), 2000);
  };

  const curlTestCommand = `curl -X POST "${fullUrlWithSecret}" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Payment received for GHS 10.00 from 0241234567. Transaction ID: TEST${Date.now()}."}'`;

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
      {/* Settings Form */}
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
              placeholder="Tskconnect"
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

      {/* SMS Forwarder Integration Guide & Methods */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-white/5 dark:bg-[#0d1526] space-y-5">
        <div>
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-brand-600 dark:text-brand-400" />
            <h4 className="text-base font-bold text-slate-900 dark:text-white">
              SMS Forwarder Integration &amp; Methods
            </h4>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Configure your Android phone (with your MoMo SIM) to push incoming transaction SMS to your server. Choose whichever configuration method works best for your app:
          </p>
        </div>

        {/* Method Selector Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-3 dark:border-white/5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveMethod("query")}
            className={`rounded-lg px-3 py-1.5 transition-colors ${
              activeMethod === "query"
                ? "bg-brand-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
            }`}
          >
            Method 1: URL Query (Easiest — No Headers)
          </button>
          <button
            type="button"
            onClick={() => setActiveMethod("bearer")}
            className={`rounded-lg px-3 py-1.5 transition-colors ${
              activeMethod === "bearer"
                ? "bg-brand-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
            }`}
          >
            Method 2: Authorization Header (Standard)
          </button>
          <button
            type="button"
            onClick={() => setActiveMethod("header")}
            className={`rounded-lg px-3 py-1.5 transition-colors ${
              activeMethod === "header"
                ? "bg-brand-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
            }`}
          >
            Method 3: Custom Header (x-forwarder-secret)
          </button>
        </div>

        {/* Method 1 Content */}
        {activeMethod === "query" && (
          <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-4 dark:border-brand-500/20 dark:bg-brand-950/20 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-brand-900 dark:text-brand-200 uppercase tracking-wider">
                  Recommended: URL Query Parameter
                </span>
                <p className="text-[11px] text-brand-700 dark:text-brand-300 mt-0.5">
                  The simplest setup. Paste this single URL into your forwarder app. No custom headers needed!
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => copyToClipboard(fullUrlWithSecret, setCopiedFullUrl, "Full Webhook URL copied!")}
                className="shrink-0 bg-white dark:bg-slate-900 text-xs border-brand-300 dark:border-brand-500/40"
              >
                {copiedFullUrl ? <Check className="h-3.5 w-3.5 text-emerald-600 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                {copiedFullUrl ? "Copied!" : "Copy Full URL"}
              </Button>
            </div>
            <div className="rounded-lg bg-white p-2.5 font-mono text-xs text-brand-900 dark:bg-[#080d19] dark:text-brand-300 break-all select-all border border-brand-200 dark:border-white/5">
              {fullUrlWithSecret}
            </div>
          </div>
        )}

        {/* Method 2 Content */}
        {activeMethod === "bearer" && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/5 space-y-3">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider block">
              Standard Bearer Authorization Header
            </span>

            <div className="space-y-2 text-xs">
              <div className="rounded-lg bg-white p-3 dark:bg-[#080d19] border border-slate-200/80 dark:border-white/5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Webhook URL:</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(webhookUrl, setCopiedWebhook, "Webhook URL copied!")}
                    className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
                  >
                    {copiedWebhook ? "Copied!" : "Copy URL"}
                  </button>
                </div>
                <span className="font-mono block mt-1 select-all break-all text-slate-800 dark:text-slate-200">
                  {webhookUrl}
                </span>
              </div>

              <div className="rounded-lg bg-white p-3 dark:bg-[#080d19] border border-slate-200/80 dark:border-white/5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Header Name / Value:</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(`Bearer ${forwarderSecret}`, setCopiedHeader, "Header value copied!")}
                    className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
                  >
                    {copiedHeader ? "Copied!" : "Copy Value"}
                  </button>
                </div>
                <div className="font-mono mt-1 space-y-1">
                  <div><span className="text-slate-400">Header:</span> <span className="font-semibold text-slate-800 dark:text-slate-200">Authorization</span></div>
                  <div><span className="text-slate-400">Value:</span> <span className="font-semibold text-brand-600 dark:text-brand-400 select-all">Bearer {forwarderSecret}</span></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Method 3 Content */}
        {activeMethod === "header" && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/5 space-y-3">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider block">
              Custom Header (x-forwarder-secret)
            </span>

            <div className="space-y-2 text-xs">
              <div className="rounded-lg bg-white p-3 dark:bg-[#080d19] border border-slate-200/80 dark:border-white/5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Webhook URL:</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(webhookUrl, setCopiedWebhook, "Webhook URL copied!")}
                    className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
                  >
                    {copiedWebhook ? "Copied!" : "Copy URL"}
                  </button>
                </div>
                <span className="font-mono block mt-1 select-all break-all text-slate-800 dark:text-slate-200">
                  {webhookUrl}
                </span>
              </div>

              <div className="rounded-lg bg-white p-3 dark:bg-[#080d19] border border-slate-200/80 dark:border-white/5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Header Name / Value:</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(forwarderSecret, setCopiedCustomHeader, "Secret token copied!")}
                    className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
                  >
                    {copiedCustomHeader ? "Copied!" : "Copy Secret"}
                  </button>
                </div>
                <div className="font-mono mt-1 space-y-1">
                  <div><span className="text-slate-400">Header:</span> <span className="font-semibold text-slate-800 dark:text-slate-200">x-forwarder-secret</span></div>
                  <div><span className="text-slate-400">Value:</span> <span className="font-semibold text-brand-600 dark:text-brand-400 select-all">{forwarderSecret}</span></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Android App Setup Templates */}
        <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-4 dark:border-white/5 dark:bg-white/5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Android App JSON Payload Template
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveApp("macrodroid")}
                className={`text-[11px] font-medium px-2 py-0.5 rounded ${
                  activeApp === "macrodroid"
                    ? "bg-brand-600 text-white"
                    : "text-slate-500 hover:bg-slate-200 dark:hover:bg-white/10"
                }`}
              >
                MacroDroid
              </button>
              <button
                type="button"
                onClick={() => setActiveApp("smsforwarder")}
                className={`text-[11px] font-medium px-2 py-0.5 rounded ${
                  activeApp === "smsforwarder"
                    ? "bg-brand-600 text-white"
                    : "text-slate-500 hover:bg-slate-200 dark:hover:bg-white/10"
                }`}
              >
                SMS Forwarder
              </button>
            </div>
          </div>

          <div className="relative">
            <pre className="rounded-lg bg-white p-3 font-mono text-xs text-slate-800 dark:bg-[#080d19] dark:text-slate-200 border border-slate-200/80 dark:border-white/5">
              {activeApp === "macrodroid"
                ? `{\n  "message": "{sms_message}",\n  "from": "{sms_number}"\n}`
                : `{\n  "message": "[msg]",\n  "from": "[from]"\n}`}
            </pre>
            <button
              type="button"
              onClick={() => {
                const text =
                  activeApp === "macrodroid"
                    ? `{\n  "message": "{sms_message}",\n  "from": "{sms_number}"\n}`
                    : `{\n  "message": "[msg]",\n  "from": "[from]"\n}`;
                copyToClipboard(text, setCopiedTemplate, "Payload template copied!");
              }}
              className="absolute top-2.5 right-2.5 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
            >
              {copiedTemplate ? "Copied!" : "Copy Template"}
            </button>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            HTTP Method: <strong>POST</strong> · Content-Type: <strong>application/json</strong>
          </p>
        </div>

        {/* Live Terminal Test cURL */}
        <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-4 dark:border-white/5 dark:bg-white/5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Terminal className="h-4 w-4 text-slate-500" />
              <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Instant Verification (cURL Terminal Command)
              </span>
            </div>
            <button
              type="button"
              onClick={() => copyToClipboard(curlTestCommand, setCopiedCurl, "cURL test command copied!")}
              className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
            >
              {copiedCurl ? "Copied!" : "Copy Command"}
            </button>
          </div>
          <pre className="rounded-lg bg-slate-900 p-3 font-mono text-[11px] text-slate-200 overflow-x-auto select-all">
            {curlTestCommand}
          </pre>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Run this command in your computer or VPS terminal to simulate an incoming payment SMS and verify your endpoint responds with <code>&#123;&quot;received&quot;: true&#125;</code>.
          </p>
        </div>
      </div>
    </div>
  );
}
