"use client";

import * as React from "react";
import { Play, Check, Copy, Clock, Sparkles, Shield, KeyRound, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/shared";
import { useToast } from "@/components/toast";

interface CredentialOption {
  id: string;
  name: string;
  keyPrefix: string;
  environment: string;
}

interface PlaygroundSample {
  label: string;
  body?: string;
  path?: string;
}

interface PlaygroundEndpoint {
  id: string;
  name: string;
  category: string;
  method: "GET" | "POST";
  path: string;
  hasBody: boolean;
  defaultBody: string;
  scope?: string;
  description: string;
  samples?: PlaygroundSample[];
}

const PLAYGROUND_ENDPOINTS: PlaygroundEndpoint[] = [
  {
    id: "post-verify-numbers",
    name: "POST /v1/numbers/verify (Verify Phone Numbers)",
    category: "Number Verification",
    method: "POST",
    path: "/v1/numbers/verify",
    hasBody: true,
    scope: "numbers:verify",
    description:
      "Batch pre-check whether recipient phone numbers are verified before placing orders. Queries local verified database and automated verification system.",
    defaultBody: JSON.stringify(
      {
        numbers: ["0535308873", "0598427212", "0201234567"],
      },
      null,
      2
    ),
    samples: [
      {
        label: "Verified Number (0535308873)",
        body: JSON.stringify({ numbers: ["0535308873"] }, null, 2),
      },
      {
        label: "Unverified Number (0598427212)",
        body: JSON.stringify({ numbers: ["0598427212"] }, null, 2),
      },
      {
        label: "Batch Test (3 Numbers)",
        body: JSON.stringify({ numbers: ["0535308873", "0598427212", "0201234567"] }, null, 2),
      },
    ],
  },
  {
    id: "get-verify-number",
    name: "GET /v1/numbers/verify (Single Number Query)",
    category: "Number Verification",
    method: "GET",
    path: "/v1/numbers/verify?number=0535308873",
    hasBody: false,
    scope: "numbers:verify",
    description: "Query parameter pre-check for a single phone number (or comma-separated list via ?numbers=...).",
    defaultBody: "",
    samples: [
      {
        label: "Verified (?number=0535308873)",
        path: "/v1/numbers/verify?number=0535308873",
      },
      {
        label: "Unverified (?number=0598427212)",
        path: "/v1/numbers/verify?number=0598427212",
      },
      {
        label: "Batch Query (?numbers=...)",
        path: "/v1/numbers/verify?numbers=0535308873,0598427212",
      },
    ],
  },
  {
    id: "get-packages",
    name: "GET /v1/packages (List Data Packages)",
    category: "Catalog & Networks",
    method: "GET",
    path: "/v1/packages?available=true",
    hasBody: false,
    scope: "packages:read",
    description: "List all active bundle packages, network providers, validity, and price per bundle.",
    defaultBody: "",
  },
  {
    id: "get-networks",
    name: "GET /v1/networks (List Networks)",
    category: "Catalog & Networks",
    method: "GET",
    path: "/v1/networks",
    hasBody: false,
    scope: "networks:read",
    description: "Fetch list of supported telecommunication networks (MTN, Telecel, AT).",
    defaultBody: "",
  },
  {
    id: "get-networks-status",
    name: "GET /v1/networks/status (Network Status)",
    category: "Catalog & Networks",
    method: "GET",
    path: "/v1/networks/status",
    hasBody: false,
    scope: "networks:read",
    description: "Real-time operational status for each network provider.",
    defaultBody: "",
  },
  {
    id: "post-order",
    name: "POST /v1/orders (Create Order)",
    category: "Orders & Fulfillment",
    method: "POST",
    path: "/v1/orders",
    hasBody: true,
    scope: "orders:create",
    description: "Submit a new data bundle fulfillment order for a recipient phone number.",
    defaultBody: JSON.stringify(
      {
        network: "MTN",
        packageId: "mtn-1gb",
        recipient: "0535308873",
        reference: `PLAYGROUND-${Math.floor(100000 + Math.random() * 900000)}`,
      },
      null,
      2
    ),
  },
  {
    id: "get-order",
    name: "GET /v1/orders/:id (Get Order by ID)",
    category: "Orders & Fulfillment",
    method: "GET",
    path: "/v1/orders/1",
    hasBody: false,
    scope: "orders:read",
    description: "Retrieve order fulfillment status, payload, and audit info by internal Order ID.",
    defaultBody: "",
  },
  {
    id: "get-order-ref",
    name: "GET /v1/orders/reference/:reference (Get by Reference)",
    category: "Orders & Fulfillment",
    method: "GET",
    path: "/v1/orders/reference/PLAYGROUND-10001",
    hasBody: false,
    scope: "orders:read",
    description: "Retrieve order details using your own unique idempotency/merchant reference string.",
    defaultBody: "",
  },
  {
    id: "bulk-status",
    name: "POST /v1/orders/status (Bulk Status Check)",
    category: "Orders & Fulfillment",
    method: "POST",
    path: "/v1/orders/status",
    hasBody: true,
    scope: "orders:status",
    description: "Check status for multiple orders simultaneously (up to 100 IDs).",
    defaultBody: JSON.stringify(
      {
        orderIds: ["API-1", "API-2"],
      },
      null,
      2
    ),
  },
  {
    id: "get-orders",
    name: "GET /v1/orders (List Orders)",
    category: "Orders & Fulfillment",
    method: "GET",
    path: "/v1/orders?limit=10",
    hasBody: false,
    scope: "orders:read",
    description: "Paginated list of orders placed by your application.",
    defaultBody: "",
  },
  {
    id: "get-balance",
    name: "GET /v1/balance (Account Balance)",
    category: "Wallet & Balance",
    method: "GET",
    path: "/v1/balance",
    hasBody: false,
    scope: "balance:read",
    description: "Query your current account wallet balance in GHS.",
    defaultBody: "",
  },
  {
    id: "get-webhooks",
    name: "GET /v1/webhooks (List Webhooks)",
    category: "Webhooks & System",
    method: "GET",
    path: "/v1/webhooks",
    hasBody: false,
    scope: "webhooks:read",
    description: "List configured webhook URLs and subscribed events.",
    defaultBody: "",
  },
  {
    id: "test-webhook",
    name: "POST /v1/webhooks/test (Send Ping Test)",
    category: "Webhooks & System",
    method: "POST",
    path: "/v1/webhooks/test",
    hasBody: false,
    scope: "webhooks:manage",
    description: "Trigger a test webhook ping to verify your listener receives HMAC signed events.",
    defaultBody: "",
  },
  {
    id: "get-status",
    name: "GET /v1/status (System Health)",
    category: "Webhooks & System",
    method: "GET",
    path: "/v1/status",
    hasBody: false,
    description: "Public health check endpoint displaying status of database, telco APIs, and queues.",
    defaultBody: "",
  },
];

export function DeveloperPlayground({
  credentials,
  initialEndpointId,
}: {
  credentials?: CredentialOption[];
  initialEndpointId?: string;
}) {
  const { toast } = useToast();
  const [selectedEndpointId, setSelectedEndpointId] = React.useState(
    initialEndpointId || "post-verify-numbers"
  );
  const [customPath, setCustomPath] = React.useState("/v1/numbers/verify");
  const [requestBody, setRequestBody] = React.useState(
    JSON.stringify({ numbers: ["0535308873", "0598427212", "0201234567"] }, null, 2)
  );
  const [customKey, setCustomKey] = React.useState("");
  const [idempotencyKey, setIdempotencyKey] = React.useState(`IDEM-${Date.now()}`);
  const [loading, setLoading] = React.useState(false);
  const [responseStatus, setResponseStatus] = React.useState<number | null>(null);
  const [responseHeaders, setResponseHeaders] = React.useState<Record<string, string>>({});
  const [responseJson, setResponseJson] = React.useState<string | null>(null);
  const [durationMs, setDurationMs] = React.useState<number | null>(null);
  const [copied, setCopied] = React.useState(false);

  // Read stored playground key on mount
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("tsk_playground_api_key");
        if (stored) {
          setCustomKey(stored);
        }
      } catch {}
    }
  }, []);

  // Update selected endpoint when initialEndpointId prop changes
  React.useEffect(() => {
    if (initialEndpointId) {
      handleEndpointSelect(initialEndpointId);
    }
  }, [initialEndpointId]);

  const activeEndpoint =
    PLAYGROUND_ENDPOINTS.find((e) => e.id === selectedEndpointId) || PLAYGROUND_ENDPOINTS[0];

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

  const handleKeyChange = (val: string) => {
    setCustomKey(val);
    if (typeof window !== "undefined") {
      try {
        if (val.trim()) {
          localStorage.setItem("tsk_playground_api_key", val.trim());
        } else {
          localStorage.removeItem("tsk_playground_api_key");
        }
      } catch {}
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

  // Group endpoints by category
  const categories = Array.from(new Set(PLAYGROUND_ENDPOINTS.map((e) => e.category)));

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold tracking-tight">API Playground</h2>
              <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                Live Console
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Test endpoints directly with live requests and inspect responses in real time.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleExecute}
              disabled={loading}
              className="gap-2 bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-sm hover:from-blue-700 hover:to-violet-700"
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
              {categories.map((category) => (
                <optgroup key={category} label={category}>
                  {PLAYGROUND_ENDPOINTS.filter((e) => e.category === category).map((ep) => (
                    <option key={ep.id} value={ep.id}>
                      {ep.name}
                    </option>
                  ))}
                </optgroup>
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

        {/* Endpoint Info & Quick Samples Banner */}
        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-xs dark:border-slate-800/80 dark:bg-slate-800/40">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="rounded bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                {activeEndpoint.category}
              </span>
              {activeEndpoint.scope && (
                <span className="flex items-center gap-1 rounded bg-blue-100/70 px-2 py-0.5 font-mono text-[10px] font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                  <Shield className="h-3 w-3" />
                  scope: {activeEndpoint.scope}
                </span>
              )}
            </div>
            <p className="text-slate-600 dark:text-slate-400">{activeEndpoint.description}</p>
          </div>

          {activeEndpoint.samples && activeEndpoint.samples.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-slate-200/60 pt-2 dark:border-slate-700/60">
              <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                Quick Test Samples:
              </span>
              {activeEndpoint.samples.map((sample, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    if (sample.path) setCustomPath(sample.path);
                    if (sample.body !== undefined) setRequestBody(sample.body);
                    toast(`Loaded sample: ${sample.label}`, "info");
                  }}
                  className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700 transition hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-900/60"
                >
                  {sample.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Auth key input */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                <KeyRound className="h-3.5 w-3.5" />
                API Key (Bearer Token)
              </label>
              {customKey && (
                <button
                  type="button"
                  onClick={() => handleKeyChange("")}
                  className="text-[11px] text-slate-400 hover:text-red-500 flex items-center gap-0.5"
                >
                  <Trash2 className="h-3 w-3" /> Clear
                </button>
              )}
            </div>
            <input
              type="password"
              placeholder="Paste your ck_live_... or ck_test_... key"
              value={customKey}
              onChange={(e) => handleKeyChange(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            {customKey ? (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <Check className="h-3 w-3" /> API Key saved in local storage for quick testing.
              </p>
            ) : (
              <p className="text-[11px] text-slate-400">
                Tip: Generate a key in the <strong>Credentials</strong> tab or paste your key here.
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
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-500">Request Body (JSON)</label>
              <button
                type="button"
                onClick={() => setRequestBody(activeEndpoint.defaultBody)}
                className="text-[11px] text-blue-600 hover:underline"
              >
                Reset to Default
              </button>
            </div>
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
