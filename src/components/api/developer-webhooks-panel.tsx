"use client";

import * as React from "react";
import { Send, RefreshCw, Key, ShieldCheck, CheckCircle2, XCircle, Clock, AlertTriangle, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner, EmptyState } from "@/components/shared";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/components/toast";
import { formatDateTime } from "@/lib/types";

export function DeveloperWebhooksPanel() {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [webhook, setWebhook] = React.useState<any>(null);
  const [url, setUrl] = React.useState("");
  const [active, setActive] = React.useState(true);
  const [selectedEvents, setSelectedEvents] = React.useState<string[]>([
    "order.created",
    "order.processing",
    "order.completed",
    "order.failed",
    "order.cancelled",
  ]);
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [retryingId, setRetryingId] = React.useState<string | null>(null);
  const [newSecretAlert, setNewSecretAlert] = React.useState<string | null>(null);

  const ALL_EVENTS = [
    { id: "order.created", label: "order.created", desc: "Triggered when an order is first accepted" },
    { id: "order.processing", label: "order.processing", desc: "Triggered when fulfillment begins" },
    { id: "order.completed", label: "order.completed", desc: "Triggered when data bundle is delivered" },
    { id: "order.failed", label: "order.failed", desc: "Triggered if carrier rejects or delivery fails" },
    { id: "order.cancelled", label: "order.cancelled", desc: "Triggered if order is cancelled or refunded" },
  ];

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/developer/webhooks");
      const json = await res.json();
      if (json.webhook) {
        setWebhook(json.webhook);
        setUrl(json.webhook.url || "");
        setActive(json.webhook.active);
        setSelectedEvents(json.webhook.events || []);
      }
    } catch {
      toast("Failed to load webhook settings", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (rotateSecret = false) => {
    if (!url.trim() || (!url.startsWith("http://") && !url.startsWith("https://"))) {
      toast("Please enter a valid http:// or https:// URL", "error");
      return;
    }

    if (rotateSecret && !confirm("Rotating your secret will invalidate your current webhook secret immediately. Continue?")) {
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/developer/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          events: selectedEvents,
          active,
          rotateSecret,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? "Failed to save webhook", "error");
        return;
      }

      if (json.newSecret) {
        setNewSecretAlert(json.newSecret);
      }

      toast("Webhook configuration saved", "success");
      load();
    } catch {
      toast("Error saving webhook configuration", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/developer/webhooks/test", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? "Test delivery failed", "error");
        return;
      }

      if (json.success) {
        toast("Test webhook delivered successfully!", "success");
      } else {
        toast(`Test delivery returned HTTP ${json.delivery?.statusCode || "error"}: ${json.delivery?.error || "failed"}`, "error");
      }
      load();
    } catch {
      toast("Error sending test webhook", "error");
    } finally {
      setTesting(false);
    }
  };

  const handleRetry = async (deliveryId: string) => {
    setRetryingId(deliveryId);
    try {
      const res = await fetch("/api/developer/webhooks/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryId }),
      });
      const json = await res.json();
      if (json.success) {
        toast("Webhook delivery succeeded on retry!", "success");
      } else {
        toast(`Retry failed: ${json.delivery?.error || "HTTP error"}`, "error");
      }
      load();
    } catch {
      toast("Failed to retry webhook", "error");
    } finally {
      setRetryingId(null);
    }
  };

  const toggleEvent = (eventId: string) => {
    if (selectedEvents.includes(eventId)) {
      setSelectedEvents(selectedEvents.filter((e) => e !== eventId));
    } else {
      setSelectedEvents([...selectedEvents, eventId]);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="h-6 w-6 text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Secret notice banner if just generated */}
      {newSecretAlert && (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 dark:border-emerald-800 dark:bg-emerald-950/20">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                New Webhook Secret Generated
              </p>
              <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">
                Use this secret to verify <code className="font-mono">X-Tskconnect-Signature</code> headers on incoming webhooks:
              </p>
              <code className="mt-2 block rounded-xl bg-slate-950 p-3 font-mono text-xs font-bold text-emerald-400 select-all">
                {newSecretAlert}
              </code>
            </div>
            <Button size="sm" variant="outline" onClick={() => setNewSecretAlert(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* Configuration Card */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold tracking-tight">Webhook Configuration</h2>
            <p className="text-xs text-slate-500">
              Receive real-time HTTP POST notifications whenever an order status changes.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {webhook?.url && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleTest}
                disabled={testing}
                className="gap-1.5"
              >
                {testing ? <Spinner className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 text-blue-600" />}
                Test Endpoint
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => handleSave(false)}
              disabled={saving}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              {saving ? <Spinner className="h-4 w-4" /> : "Save Changes"}
            </Button>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Endpoint URL (HTTPS recommended)
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600"
                />
                Enabled
              </label>
            </div>
            <input
              type="url"
              placeholder="https://yourwebsite.com/api/webhooks/tskconnect"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono dark:border-slate-700 dark:bg-slate-800"
            />
          </div>

          {/* Subscribed events */}
          <div className="space-y-2 pt-2">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Subscribed Event Types
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ALL_EVENTS.map((ev) => {
                const checked = selectedEvents.includes(ev.id);
                return (
                  <label
                    key={ev.id}
                    onClick={() => toggleEvent(ev.id)}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition ${
                      checked
                        ? "border-blue-500 bg-blue-50/40 dark:border-blue-500/30 dark:bg-blue-950/20"
                        : "border-slate-200 dark:border-slate-800"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {}}
                      className="mt-0.5 rounded border-slate-300 text-blue-600"
                    />
                    <div>
                      <p className="font-mono text-xs font-bold">{ev.label}</p>
                      <p className="text-[11px] text-slate-400">{ev.desc}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Secret & Rotation */}
          {webhook && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/60 text-xs">
              <div>
                <p className="font-semibold text-slate-700 dark:text-slate-300">Signing Secret</p>
                <p className="mt-0.5 font-mono text-slate-500">{webhook.secretMasked || "Configured"}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSave(true)}
                disabled={saving}
                className="text-xs"
              >
                Regenerate Secret
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Deliveries Table */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 p-5 dark:border-slate-800">
          <h3 className="text-sm font-bold">Recent Webhook Deliveries</h3>
          <p className="text-xs text-slate-500">History of HTTP dispatches and response statuses.</p>
        </div>

        {!webhook?.deliveries || webhook.deliveries.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            No webhook deliveries recorded yet. Trigger a test above to verify.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 dark:border-slate-800">
                  <th className="px-4 py-3 font-semibold">Event</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">HTTP Code</th>
                  <th className="px-4 py-3 font-semibold">Duration</th>
                  <th className="px-4 py-3 font-semibold">Attempt</th>
                  <th className="px-4 py-3 font-semibold">Timestamp</th>
                  <th className="px-4 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono dark:divide-slate-800">
                {webhook.deliveries.map((d: any) => (
                  <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 font-sans">
                    <td className="px-4 py-3 font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {d.event}
                      {d.orderId && <span className="ml-2 text-[11px] text-slate-400">({d.orderId})</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          d.status === "SUCCESS"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-red-500/10 text-red-600 dark:text-red-400"
                        }`}
                      >
                        {d.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300">
                      {d.statusCode ? `HTTP ${d.statusCode}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {d.responseTimeMs ? `${d.responseTimeMs}ms` : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono">
                      {d.attempt} / {d.maxAttempts}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-[11px]">
                      {formatDateTime(d.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {d.status !== "SUCCESS" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRetry(d.id)}
                          disabled={retryingId === d.id}
                          className="h-7 px-2 text-[11px] gap-1"
                        >
                          {retryingId === d.id ? <Spinner className="h-3 w-3" /> : <RefreshCw className="h-3 w-3" />}
                          Retry
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
