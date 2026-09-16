"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import {
  Server,
  Zap,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Copy,
  Eye,
  EyeOff,
  ShieldCheck,
  Send,
  FileSpreadsheet,
  Globe,
  Sliders,
  Check,
} from "lucide-react";
import {
  DEFAULT_BIGWINDATA_API_KEY,
  DEFAULT_BIGWINDATA_BASE_URL,
} from "@/lib/provider-apis/bigwindata";
import {
  DEFAULT_CLICKYFIED_API_KEY,
  DEFAULT_CLICKYFIED_CLIENT_ID,
  DEFAULT_CLICKYFIED_SANDBOX_URL,
  DEFAULT_CLICKYFIED_PROD_URL,
} from "@/lib/provider-apis/clickyfied";
import { SUPPORTED_ROUTING_NETWORKS } from "@/lib/provider-apis/router";

interface Props {
  settings: Record<string, string>;
  setSettings: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSave?: () => Promise<void>;
  saving?: boolean;
}

export function ProviderApisSettings({ settings, setSettings, onSave, saving }: Props) {
  const { toast } = useToast();

  const [showBigwinKey, setShowBigwinKey] = React.useState(false);
  const [showClickyfiedKey, setShowClickyfiedKey] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [testingBigwin, setTestingBigwin] = React.useState(false);
  const [testingClickyfied, setTestingClickyfied] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{
    provider: string;
    message: string;
    success: boolean;
  } | null>(null);

  const isRoutingEnabled = settings.provider_routing_enabled === "true";
  const appBaseUrl =
    settings.app_base_url || (typeof window !== "undefined" ? window.location.origin : "");

  const bigwinWebhookUrl = `${appBaseUrl}/api/webhooks/providers/bigwindata`;
  const clickyfiedCallbackUrl = `${appBaseUrl}/api/webhooks/providers/clickyfied`;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast(`${label} copied to clipboard!`, "success");
  };

  // Preset helper matching user's requested configuration
  const applyPreset = () => {
    setSettings((s) => ({
      ...s,
      provider_routing_enabled: "true",
      provider_route_MTN: "BIGWINDATA",
      provider_route_MTN_XPRESS: "BIGWINDATA",
      provider_route_TELECEL: "CLICKYFIED",
      provider_route_AIRTELTIGO_ISHARE: "CLICKYFIED",
      provider_route_AIRTELTIGO_BIGTIME: "CLICKYFIED",
      bigwindata_enabled: "true",
      clickyfied_enabled: "true",
      clickyfied_client_id: s.clickyfied_client_id || DEFAULT_CLICKYFIED_CLIENT_ID,
      clickyfied_mtn_verification_enabled: "true",
      clickyfied_not_received_enabled: "true",
    }));
    toast("Preset applied: MTN → Bigwindata | Telecel & AirtelTigo → Clickyfied", "success");
  };

  const applyClickyfiedAllPreset = () => {
    setSettings((s) => ({
      ...s,
      provider_routing_enabled: "true",
      provider_routing_default: "CLICKYFIED",
      provider_route_MTN: "CLICKYFIED",
      provider_route_MTN_XPRESS: "CLICKYFIED",
      provider_route_TELECEL: "CLICKYFIED",
      provider_route_AIRTELTIGO_ISHARE: "CLICKYFIED",
      provider_route_AIRTELTIGO_BIGTIME: "CLICKYFIED",
      clickyfied_enabled: "true",
      clickyfied_client_id: s.clickyfied_client_id || DEFAULT_CLICKYFIED_CLIENT_ID,
      clickyfied_mtn_verification_enabled: "true",
      clickyfied_not_received_enabled: "true",
    }));
    toast("Preset applied: All Networks → Clickyfied (Sandbox/Live)", "success");
  };

  const syncInFlight = async () => {
    setSyncing(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/provider-apis/sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Sync failed");
      toast(`Sync complete: ${json.checked} checked, ${json.updated} updated.`, "success");
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setSyncing(false);
    }
  };

  const testBigwindata = async () => {
    setTestingBigwin(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/provider-apis/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test_bigwindata_balance" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Bigwindata check failed");
      setTestResult({
        provider: "Bigwindata",
        success: true,
        message: `Connected successfully! Balance: ${json.balance?.balance || "GHS " + json.balance?.rawBalance} (${json.balance?.currency || "GHS"})`,
      });
      toast("Bigwindata connection verified!", "success");
    } catch (err: any) {
      setTestResult({
        provider: "Bigwindata",
        success: false,
        message: err.message,
      });
      toast(`Bigwindata error: ${err.message}`, "error");
    } finally {
      setTestingBigwin(false);
    }
  };

  const testClickyfied = async () => {
    setTestingClickyfied(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/provider-apis/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test_clickyfied_billing" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Clickyfied check failed");
      setTestResult({
        provider: "Clickyfied",
        success: true,
        message: `Connected successfully! Status HTTP 200 from ${settings.clickyfied_base_url || DEFAULT_CLICKYFIED_SANDBOX_URL}`,
      });
      toast("Clickyfied connection verified!", "success");
    } catch (err: any) {
      setTestResult({
        provider: "Clickyfied",
        success: false,
        message: err.message,
      });
      toast(`Clickyfied error: ${err.message}`, "error");
    } finally {
      setTestingClickyfied(false);
    }
  };

  const testSingleOrder = async (provider: "BIGWINDATA" | "CLICKYFIED") => {
    const isBigwin = provider === "BIGWINDATA";
    const msg = isBigwin
      ? "Place a LIVE test 1GB MTN order to 0257467983 on Bigwindata? Balance will be deducted from Bigwindata."
      : "Place a SANDBOX test 1GB MTN order to 0257467983 on Clickyfied sandbox?";

    if (!confirm(msg)) return;

    try {
      const res = await fetch("/api/admin/provider-apis/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test_order",
          provider,
          network: "MTN",
          recipient: "0257467983",
          gbAmount: 1,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Test order failed");
      toast(`Test order placed successfully on ${provider}!`, "success");
      setTestResult({
        provider,
        success: true,
        message: `Order submitted: ${JSON.stringify(json.purchase || json.order || json)}`,
      });
    } catch (err: any) {
      toast(`Test order failed: ${err.message}`, "error");
      setTestResult({
        provider,
        success: false,
        message: err.message,
      });
    }
  };

  // Collect all network rows to display
  const networkRows = React.useMemo(() => {
    const list: Array<{ key: string; label: string; network: string }> = [
      { key: "MTN", label: "MTN (Regular)", network: "MTN" },
      { key: "MTN_XPRESS", label: "MTN Xpress", network: "MTN" },
      { key: "TELECEL", label: "Telecel", network: "TELECEL" },
      { key: "AIRTELTIGO_ISHARE", label: "AirtelTigo iShare", network: "AIRTELTIGO" },
      { key: "AIRTELTIGO_BIGTIME", label: "AirtelTigo Big Time", network: "AIRTELTIGO" },
    ];

    // Add any custom package categories configured in admin
    if (settings.custom_package_categories) {
      try {
        const parsed = JSON.parse(settings.custom_package_categories);
        if (Array.isArray(parsed)) {
          for (const cat of parsed) {
            const up = String(cat).trim().toUpperCase();
            if (up && !list.some((item) => item.key === up)) {
              list.push({ key: up, label: up, network: up });
            }
          }
        }
      } catch {}
    }
    return list;
  }, [settings.custom_package_categories]);

  return (
    <div className="space-y-6">
      {/* 1. Master Switch Card */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex h-2.5 w-2.5 rounded-full ${
                  isRoutingEnabled ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
                }`}
              />
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Automated Order Processing (Provider APIs)
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
              When <strong>ON</strong>, orders placed for assigned networks are immediately dispatched
              to Bigwindata or Clickyfied and status updates are tracked automatically.
              When <strong>OFF</strong>, orders remain in PENDING status for manual file export.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={isRoutingEnabled}
              onClick={() =>
                setSettings((s) => ({
                  ...s,
                  provider_routing_enabled: isRoutingEnabled ? "false" : "true",
                }))
              }
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                isRoutingEnabled ? "bg-brand-600" : "bg-slate-300 dark:bg-slate-700"
              }`}
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  isRoutingEnabled ? "left-[25px]" : "left-1"
                }`}
              />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="space-y-1.5">
            <Label>Public App Base URL (for Webhooks & Callbacks)</Label>
            <Input
              type="url"
              placeholder="https://tskconnect.com"
              value={settings.app_base_url ?? ""}
              onChange={(e) => setSettings((s) => ({ ...s, app_base_url: e.target.value }))}
            />
            <p className="text-[11px] text-slate-400">
              Used as the base domain when notifying Bigwindata and Clickyfied where to deliver status webhooks.
            </p>
          </div>

          <div className="flex flex-col justify-end gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={applyPreset}
                className="text-xs text-brand-600 dark:text-brand-400 border-brand-200 dark:border-brand-800 hover:bg-brand-50"
              >
                <Zap className="h-3.5 w-3.5 mr-1 text-brand-600" /> Apply Split Preset
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={applyClickyfiedAllPreset}
                className="text-xs text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50"
              >
                <Zap className="h-3.5 w-3.5 mr-1 text-indigo-600" /> Route All → Clickyfied
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={syncInFlight}
                disabled={syncing}
                className="text-xs"
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${syncing ? "animate-spin" : ""}`} /> Sync Active Orders
              </Button>
            </div>
            <p className="text-[11px] text-slate-400">
              Presets: <strong>Split</strong> (MTN → Bigwin, Telecel/AirtelTigo → Clickyfied) or <strong>Route All</strong> (All networks → Clickyfied).
            </p>
          </div>
        </div>
      </div>

      {/* Test Feedback Banner */}
      {testResult && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 text-xs ${
            testResult.success
              ? "bg-emerald-50/80 border-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200"
              : "bg-rose-50/80 border-rose-200 text-rose-900 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-200"
          }`}
        >
          {testResult.success ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 overflow-hidden break-all">
            <strong>{testResult.provider}:</strong> {testResult.message}
          </div>
          <button
            onClick={() => setTestResult(null)}
            className="text-slate-400 hover:text-slate-600 font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. Network Routing Matrix */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Sliders className="h-4 w-4 text-brand-600" /> Network Provider Routing Matrix
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Choose which API provider automatically serves orders for each network. Select &quot;Manual Export&quot; to keep orders in pending queue.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase tracking-wider">
                <th className="py-2.5 px-3 font-medium">Network / Bundle Type</th>
                <th className="py-2.5 px-3 font-medium text-center">Manual File Export</th>
                <th className="py-2.5 px-3 font-medium text-center">Bigwindata API</th>
                <th className="py-2.5 px-3 font-medium text-center">Clickyfied API</th>
                <th className="py-2.5 px-3 font-medium text-right">Active Mode</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {networkRows.map((row) => {
                const settingKey = `provider_route_${row.key}`;
                const currentVal = settings[settingKey] || "MANUAL";

                return (
                  <tr key={row.key} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="py-3 px-3 font-medium text-slate-800 dark:text-slate-200">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{row.label}</span>
                        <span className="text-[10px] text-slate-400 font-mono">({row.key})</span>
                      </div>
                    </td>

                    <td className="py-3 px-3 text-center">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name={settingKey}
                          value="MANUAL"
                          checked={currentVal === "MANUAL"}
                          onChange={() => setSettings((s) => ({ ...s, [settingKey]: "MANUAL" }))}
                          className="text-brand-600 focus:ring-brand-500"
                        />
                        <span className="text-slate-600 dark:text-slate-400 text-xs">Manual</span>
                      </label>
                    </td>

                    <td className="py-3 px-3 text-center">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name={settingKey}
                          value="BIGWINDATA"
                          checked={currentVal === "BIGWINDATA"}
                          onChange={() =>
                            setSettings((s) => ({ ...s, [settingKey]: "BIGWINDATA" }))
                          }
                          className="text-amber-600 focus:ring-amber-500"
                        />
                        <span className="text-amber-700 dark:text-amber-400 font-medium text-xs">
                          Bigwindata
                        </span>
                      </label>
                    </td>

                    <td className="py-3 px-3 text-center">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name={settingKey}
                          value="CLICKYFIED"
                          checked={currentVal === "CLICKYFIED"}
                          onChange={() =>
                            setSettings((s) => ({ ...s, [settingKey]: "CLICKYFIED" }))
                          }
                          className="text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-indigo-700 dark:text-indigo-400 font-medium text-xs">
                          Clickyfied
                        </span>
                      </label>
                    </td>

                    <td className="py-3 px-3 text-right">
                      {!isRoutingEnabled ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                          Export Manual (Routing Off)
                        </span>
                      ) : currentVal === "BIGWINDATA" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                          ⚡ Bigwindata
                        </span>
                      ) : currentVal === "CLICKYFIED" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300">
                          🚀 Clickyfied
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                          📁 Manual Export
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Bigwindata Configuration */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-amber-50 dark:bg-amber-950/60 flex items-center justify-center text-amber-600">
              ⚡
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Bigwindata API Configuration
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Supports MTN, MTN Xpress, Telecel, AirtelTigo iShare & Big Time.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={testBigwindata}
              disabled={testingBigwin}
              className="text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${testingBigwin ? "animate-spin" : ""}`} />
              Check Balance
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => testSingleOrder("BIGWINDATA")}
              className="text-xs border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300 hover:bg-amber-50"
            >
              Test 1GB MTN
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="space-y-1.5">
            <Label>API Base URL</Label>
            <Input
              type="text"
              value={settings.bigwindata_base_url ?? DEFAULT_BIGWINDATA_BASE_URL}
              onChange={(e) => setSettings((s) => ({ ...s, bigwindata_base_url: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label>API Key (X-API-Key)</Label>
            <div className="relative">
              <Input
                type={showBigwinKey ? "text" : "password"}
                value={settings.bigwindata_api_key ?? DEFAULT_BIGWINDATA_API_KEY}
                onChange={(e) => setSettings((s) => ({ ...s, bigwindata_api_key: e.target.value }))}
                className="pr-10 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowBigwinKey(!showBigwinKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showBigwinKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Webhook Secret (HMAC-SHA256)</Label>
            <Input
              type="text"
              placeholder="Optional webhook secret for signature verification"
              value={settings.bigwindata_webhook_secret ?? ""}
              onChange={(e) =>
                setSettings((s) => ({ ...s, bigwindata_webhook_secret: e.target.value }))
              }
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Inbound Webhook URL (Give to Bigwindata)</Label>
            <div className="flex items-center gap-1.5">
              <Input
                readOnly
                value={bigwinWebhookUrl}
                className="bg-slate-50 dark:bg-slate-800 text-xs font-mono"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(bigwinWebhookUrl, "Bigwindata Webhook URL")}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Clickyfied Configuration */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600">
              🚀
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Clickyfied API Configuration
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Supports automated orders, MTN number verification, and Not Received reporting flow.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={testClickyfied}
              disabled={testingClickyfied}
              className="text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${testingClickyfied ? "animate-spin" : ""}`} />
              Check Status
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => testSingleOrder("CLICKYFIED")}
              className="text-xs border-indigo-300 text-indigo-700 dark:border-indigo-700 dark:text-indigo-300 hover:bg-indigo-50"
            >
              Test Sandbox Order
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="space-y-1.5">
            <Label>Environment / Base URL</Label>
            <div className="space-y-2">
              <Input
                type="text"
                value={settings.clickyfied_base_url ?? DEFAULT_CLICKYFIED_SANDBOX_URL}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, clickyfied_base_url: e.target.value }))
                }
              />
              <div className="flex items-center gap-4 text-xs">
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="clickyfied_env"
                    checked={
                      (settings.clickyfied_base_url || DEFAULT_CLICKYFIED_SANDBOX_URL) ===
                      DEFAULT_CLICKYFIED_SANDBOX_URL
                    }
                    onChange={() =>
                      setSettings((s) => ({
                        ...s,
                        clickyfied_base_url: DEFAULT_CLICKYFIED_SANDBOX_URL,
                      }))
                    }
                  />
                  <span className="text-emerald-600 font-medium">Sandbox (Testing)</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="clickyfied_env"
                    checked={settings.clickyfied_base_url === DEFAULT_CLICKYFIED_PROD_URL}
                    onChange={() =>
                      setSettings((s) => ({
                        ...s,
                        clickyfied_base_url: DEFAULT_CLICKYFIED_PROD_URL,
                      }))
                    }
                  />
                  <span className="text-slate-600 font-medium">Production (Live)</span>
                </label>
              </div>

              {(settings.clickyfied_base_url || DEFAULT_CLICKYFIED_SANDBOX_URL).toLowerCase().includes("sandbox") ? (
                <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/30 p-2.5 text-[11px] text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 mt-1 shrink-0 animate-pulse" />
                  <span>
                    <strong>Sandbox Mode Active:</strong> All orders placed on Dashboard (Send Orders), Storefront, and Developer API automatically route to Clickyfied Sandbox for testing without touching live funds.
                  </span>
                </div>
              ) : (
                <div className="rounded-lg border border-blue-200/80 bg-blue-50/70 dark:border-blue-900/60 dark:bg-blue-950/30 p-2.5 text-[11px] text-blue-800 dark:text-blue-300 flex items-start gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-blue-500 mt-1 shrink-0" />
                  <span>
                    <strong>Production Mode Active:</strong> Orders will route through Clickyfied Live API using your live production credentials.
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>API Secret / Key (Authorization: Bearer)</Label>
            <div className="relative">
              <Input
                type={showClickyfiedKey ? "text" : "password"}
                value={settings.clickyfied_api_key ?? DEFAULT_CLICKYFIED_API_KEY}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, clickyfied_api_key: e.target.value }))
                }
                className="pr-10 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowClickyfiedKey(!showClickyfiedKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showClickyfiedKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Client ID (X-Client-Id header)</Label>
            <Input
              type="text"
              placeholder={DEFAULT_CLICKYFIED_CLIENT_ID}
              value={settings.clickyfied_client_id ?? DEFAULT_CLICKYFIED_CLIENT_ID}
              onChange={(e) =>
                setSettings((s) => ({ ...s, clickyfied_client_id: e.target.value }))
              }
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Inbound Callback URL (Give to Clickyfied)</Label>
            <div className="flex items-center gap-1.5">
              <Input
                readOnly
                value={clickyfiedCallbackUrl}
                className="bg-slate-50 dark:bg-slate-800 text-xs font-mono"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(clickyfiedCallbackUrl, "Clickyfied Callback URL")}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Callback Signing Secret</Label>
            <Input
              type="text"
              placeholder="e.g. secret_key_123456 (required by Clickify to enable instant callbacks)"
              value={settings.clickyfied_callback_signing_secret ?? ""}
              onChange={(e) =>
                setSettings((s) => ({ ...s, clickyfied_callback_signing_secret: e.target.value }))
              }
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Clickify strictly requires a signing secret to activate real-time callbacks. When set, orders automatically include your callback endpoint.
            </p>
          </div>
        </div>

        {/* Feature Switches specific to Clickyfied Context */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40">
            <div className="space-y-0.5">
              <div className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-brand-600" />
                MTN Number Verification via Clickyfied Endpoint
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                When enabled, unverified MTN numbers are checked directly against Clickyfied&apos;s
                <code className="mx-1 px-1 bg-slate-200 dark:bg-slate-700 rounded">POST /api/public/v1/numbers/verify</code>
                endpoint.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.clickyfied_mtn_verification_enabled === "true"}
              onClick={() =>
                setSettings((s) => ({
                  ...s,
                  clickyfied_mtn_verification_enabled:
                    s.clickyfied_mtn_verification_enabled === "true" ? "false" : "true",
                }))
              }
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                settings.clickyfied_mtn_verification_enabled === "true"
                  ? "bg-brand-600"
                  : "bg-slate-300 dark:bg-slate-700"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  settings.clickyfied_mtn_verification_enabled === "true"
                    ? "left-[22px]"
                    : "left-0.5"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40">
            <div className="space-y-0.5">
              <div className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Send className="h-4 w-4 text-brand-600" />
                Forward &quot;Not Received&quot; Reports to Clickyfied
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                When a user reports an order as not received, automatically notify Clickyfied&apos;s
                <code className="mx-1 px-1 bg-slate-200 dark:bg-slate-700 rounded">POST /api/public/v1/orders/&#123;orderId&#125;/not-received</code>
                endpoint.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.clickyfied_not_received_enabled !== "false"}
              onClick={() =>
                setSettings((s) => ({
                  ...s,
                  clickyfied_not_received_enabled:
                    s.clickyfied_not_received_enabled === "false" ? "true" : "false",
                }))
              }
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                settings.clickyfied_not_received_enabled !== "false"
                  ? "bg-brand-600"
                  : "bg-slate-300 dark:bg-slate-700"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  settings.clickyfied_not_received_enabled !== "false"
                    ? "left-[22px]"
                    : "left-0.5"
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
