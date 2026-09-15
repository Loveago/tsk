"use client";

import * as React from "react";
import { Play, Send, Check, Copy, Clock, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/shared";
import { useToast } from "@/components/toast";

interface CredentialOption {
  id: string;
  name: string;
  keyPrefix: string;
  environment: string;
}

const PLAYGROUND_ENDPOINTS = [
  {
    id: "get-networks",
    name: "GET /v1/networks",
    method: "GET",
    path: "/v1/networks",
    hasBody: false,
    defaultBody: "",
  },
  {
    id: "get-networks-status",
    name: "GET /v1/networks/status",
    method: "GET",
    path: "/v1/networks/status",
    hasBody: false,
    defaultBody: "",
  },
  {
    id: "get-packages",
    name: "GET /v1/packages",
    method: "GET",
    path: "/v1/packages?available=true",
    hasBody: false,
    defaultBody: "",
  },
  {
    id: "post-order",
    name: "POST /v1/orders",
    method: "POST",
    path: "/v1/orders",
    hasBody: true,
    defaultBody: JSON.stringify(
      {
        network: "MTN",
        packageId: "mtn-1gb",
        recipient: "0241234567",
        reference: `PLAYGROUND-${Math.floor(100000 + Math.random() * 900000)}`,
      },
      null,
      2
    ),
  },
  {
    id: "get-order",
    name: "GET /v1/orders/:id",
    method: "GET",
    path: "/v1/orders/1",
    hasBody: false,
    defaultBody: "",
  },
  {
    id: "get-order-ref",
    name: "GET /v1/orders/reference/:reference",
    method: "GET",
    path: "/v1/orders/reference/PLAYGROUND-10001",
    hasBody: false,
    defaultBody: "",
  },
  {
    id: "bulk-status",
    name: "POST /v1/orders/status",
    method: "POST",
    path: "/v1/orders/status",
    hasBody: true,
    defaultBody: JSON.stringify(
      {
        orderIds: ["CLK-1", "CLK-2"],
      },
      null,
      2
    ),
  },
  {
    id: "get-orders",
    name: "GET /v1/orders",
    method: "GET",
    path: "/v1/orders?limit=10",
    hasBody: false,
    defaultBody: "",
  },
  {
    id: "get-balance",
    name: "GET /v1/balance",
    method: "GET",
    path: "/v1/balance",
    hasBody: false,
    defaultBody: "",
  },
  {
    id: "get-webhooks",
    name: "GET /v1/webhooks",
    method: "GET",
    path: "/v1/webhooks",
    hasBody: false,
    defaultBody: "",
  },
  {
    id: "test-webhook",
    name: "POST /v1/webhooks/test",
    method: "POST",
    path: "/v1/webhooks/test",
    hasBody: false,
    defaultBody: "",
  },
  {
    id: "get-status",
    name: "GET /v1/status",
    method: "GET",
    path: "/v1/status",
    hasBody: false,
    defaultBody: "",
  },
];

export function DeveloperPlayground({
  credentials,
}: {
  credentials?: CredentialOption[];
}) {
  const { toast } = useToast();
  const [selectedEndpointId, setSelectedEndpointId] = React.useState("get-packages");
  const [customPath, setCustomPath] = React.useState("/v1/packages?available=true");
  const [requestBody, setRequestBody] = React.useState("");
  const [customKey, setCustomKey] = React.useState("");
  const [idempotencyKey, setIdempotencyKey] = React.useState(`IDEM-${Date.now()}`);
  const [loading, setLoading] = React.useState(false);
  const [responseStatus, setResponseStatus] = React.useState<number | null>(null);
  const [responseHeaders, setResponseHeaders] = React.useState<Record<string, string>>({});
  const [responseJson, setResponseJson] = React.useState<string | null>(null);
  const [durationMs, setDurationMs] = React.useState<number | null>(null);
  const [copied, setCopied] = React.useState(false);

  const activeEndpoint = PLAYGROUND_ENDPOINTS.find((e) => e.id === selectedEndpointId) || PLAYGROUND_ENDPOINTS[0];

  const handleEndpointSelect = (endpointId: string) => {
    setSelectedEndpointId(endpointId);
    const ep = PLAYGROUND_ENDPOINTS.find((e) => e.id === endpointId);
    if (ep) {
      setCustomPath(ep.path);
      setRequestBody(ep.defaultBody);
      if (ep.method === "POST" && ep.id === "post-order") {
        setIdempotencyKey(`IDEM-${Date.now()}`);
      }
    }
  };

  const handleExecute = async () => {
    setLoading(true);
    setResponseStatus(null);
    setResponseJson(null);
    setResponseHeaders({});
    const startTime = Date.now();

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (customKey.trim()) {
        headers["Authorization"] = `Bearer ${customKey.trim()}`;
      }

      if (activeEndpoint.method === "POST" && idempotencyKey.trim()) {
        headers["Idempotency-Key"] = idempotencyKey.trim();
      }

      const options: RequestInit = {
        method: activeEndpoint.method,
        headers,
      };

      if (activeEndpoint.hasBody && requestBody.trim()) {
        options.body = requestBody.trim();
      }

      const res = await fetch(customPath, options);
      const latency = Date.now() - startTime;
      setDurationMs(latency);
      setResponseStatus(res.status);

      const headerObj: Record<string, string> = {};
      res.headers.forEach((val, key) => {
        headerObj[key] = val;
      });
      setResponseHeaders(headerObj);

      let text = "";
      try {
        const json = await res.json();
        text = JSON.stringify(json, null, 2);
      } catch {
        text = await res.text();
      }
      setResponseJson(text);
    } catch (err: any) {
      setDurationMs(Date.now() - startTime);
      setResponseStatus(500);
      setResponseJson(JSON.stringify({ error: err.message || "Failed to fetch" }, null, 2));
    } finally {
      setLoading(false);
    }
  };

  const copyResponse = () => {
    if (responseJson) {
      navigator.clipboard.writeText(responseJson);
      setCopied(true);
      toast("Response copied", "success");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold tracking-tight">API Playground</h2>
            <p className="text-xs text-slate-500">
              Test endpoints directly with live requests and inspect responses in real time.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleExecute}
              disabled={loading}
              className="gap-2 bg-gradient-to-r from-blue-600 to-violet-600 text-white"
            >
              {loading ? <Spinner className="h-4 w-4" /> : <Play className="h-4 w-4 fill-white" />}
              Send Request
            </Button>
          </div>
        </div>

        {/* Configuration Row */}
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Endpoint select */}
          <div className="space-y-1.5 lg:col-span-1">
            <label className="text-xs font-semibold text-slate-500">Preset Endpoint</label>
            <select
              value={selectedEndpointId}
              onChange={(e) => handleEndpointSelect(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {PLAYGROUND_ENDPOINTS.map((ep) => (
                <option key={ep.id} value={ep.id}>
                  {ep.name}
                </option>
              ))}
            </select>
          </div>

          {/* Request Path */}
          <div className="space-y-1.5 lg:col-span-2">
            <label className="text-xs font-semibold text-slate-500">Request URL Path</label>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold ${
                  activeEndpoint.method === "POST"
                    ? "bg-blue-600 text-white"
                    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                }`}
              >
                {activeEndpoint.method}
              </span>
              <input
                type="text"
                value={customPath}
                onChange={(e) => setCustomPath(e.target.value)}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          </div>
        </div>

        {/* Auth key input */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500">API Key (Bearer Token)</label>
            <input
              type="password"
              placeholder="Paste your ck_live_... or ck_test_... key"
              value={customKey}
              onChange={(e) => setCustomKey(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            {credentials && credentials.length > 0 && (
              <p className="text-[11px] text-slate-400">
                Tip: Copy a key from the <strong>Credentials</strong> tab to test live calls.
              </p>
            )}
          </div>

          {activeEndpoint.method === "POST" && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-500">Idempotency-Key Header</label>
                <button
                  type="button"
                  onClick={() => setIdempotencyKey(`IDEM-${Date.now()}`)}
                  className="text-[11px] text-blue-600 hover:underline"
                >
                  Regenerate
                </button>
              </div>
              <input
                type="text"
                value={idempotencyKey}
                onChange={(e) => setIdempotencyKey(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          )}
        </div>

        {/* Request Body Editor */}
        {activeEndpoint.hasBody && (
          <div className="mt-4 space-y-1.5">
            <label className="text-xs font-semibold text-slate-500">Request Body (JSON)</label>
            <textarea
              rows={6}
              value={requestBody}
              onChange={(e) => setRequestBody(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-950 p-3 font-mono text-xs text-slate-200 caret-brand-400 dark:border-slate-800"
            />
          </div>
        )}
      </div>

      {/* Response Panel */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-bold">Response</h3>
            {responseStatus !== null && (
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  responseStatus >= 200 && responseStatus < 300
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : responseStatus === 429
                    ? "bg-purple-500/10 text-purple-600"
                    : "bg-red-500/10 text-red-600"
                }`}
              >
                HTTP {responseStatus}
              </span>
            )}
            {durationMs !== null && (
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <Clock className="h-3.5 w-3.5" /> {durationMs}ms
              </span>
            )}
          </div>

          {responseJson && (
            <Button variant="outline" size="sm" onClick={copyResponse} className="gap-1.5">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy Response"}
            </Button>
          )}
        </div>

        <div className="mt-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Spinner className="h-6 w-6 text-blue-600" />
              <p className="mt-2 text-xs">Sending request to API...</p>
            </div>
          ) : responseJson ? (
            <div className="space-y-3">
              {responseHeaders["x-request-id"] && (
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 font-mono">
                  <span>X-Request-ID: {responseHeaders["x-request-id"]}</span>
                  {responseHeaders["x-ratelimit-remaining"] && (
                    <span>RateLimit Remaining: {responseHeaders["x-ratelimit-remaining"]}</span>
                  )}
                </div>
              )}
              <pre className="max-h-[400px] overflow-auto rounded-xl bg-slate-950 p-4 font-mono text-xs text-emerald-400">
                {responseJson}
              </pre>
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-slate-400">
              Select an endpoint and click <strong>Send Request</strong> to test live responses.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
