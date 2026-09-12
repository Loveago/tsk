"use client";

import * as React from "react";
import { Download, Copy, Check, Terminal, Code2, Globe, Shield, Zap, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";

export function DeveloperDocs() {
  const { toast } = useToast();
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [langTab, setLangTab] = React.useState<"curl" | "javascript" | "nodejs" | "python" | "php">("curl");

  const copy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast("Copied to clipboard", "success");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const curlOrderExample = `curl -X POST "https://api.clickyfied.com/v1/orders" \\
  -H "Authorization: Bearer ck_live_xxxxxxxxxxxxxxxxxxxxxxxx" \\
  -H "Idempotency-Key: SHOP-ORD-10001" \\
  -H "Content-Type: application/json" \\
  -d '{
    "network": "MTN",
    "packageId": "mtn-1gb",
    "recipient": "0241234567",
    "reference": "SHOP-ORD-10001"
  }'`;

  const jsOrderExample = `const response = await fetch("https://api.clickyfied.com/v1/orders", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ck_live_xxxxxxxxxxxxxxxxxxxxxxxx",
    "Idempotency-Key": "SHOP-ORD-10001",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    network: "MTN",
    packageId: "mtn-1gb",
    recipient: "0241234567",
    reference: "SHOP-ORD-10001"
  })
});

const data = await response.json();
console.log(data);`;

  const nodeOrderExample = `const axios = require("axios");

async function placeOrder() {
  const { data } = await axios.post(
    "https://api.clickyfied.com/v1/orders",
    {
      network: "MTN",
      packageId: "mtn-1gb",
      recipient: "0241234567",
      reference: "SHOP-ORD-10001"
    },
    {
      headers: {
        Authorization: "Bearer ck_live_xxxxxxxxxxxxxxxxxxxxxxxx",
        "Idempotency-Key": "SHOP-ORD-10001",
        "Content-Type": "application/json"
      }
    }
  );
  console.log("Order created:", data);
}

placeOrder();`;

  const pythonOrderExample = `import requests

url = "https://api.clickyfied.com/v1/orders"
headers = {
    "Authorization": "Bearer ck_live_xxxxxxxxxxxxxxxxxxxxxxxx",
    "Idempotency-Key": "SHOP-ORD-10001",
    "Content-Type": "application/json"
}
payload = {
    "network": "MTN",
    "packageId": "mtn-1gb",
    "recipient": "0241234567",
    "reference": "SHOP-ORD-10001"
}

response = requests.post(url, json=payload, headers=headers)
print(response.json())`;

  const phpOrderExample = `<?php
$ch = curl_init("https://api.clickyfied.com/v1/orders");
$payload = json_encode([
    "network" => "MTN",
    "packageId" => "mtn-1gb",
    "recipient" => "0241234567",
    "reference" => "SHOP-ORD-10001"
]);

curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        "Authorization: Bearer ck_live_xxxxxxxxxxxxxxxxxxxxxxxx",
        "Idempotency-Key: SHOP-ORD-10001",
        "Content-Type: application/json"
    ]
]);

$response = curl_exec($ch);
curl_close($ch);
echo $response;`;

  const webhookVerifyNode = `import crypto from "crypto";

function verifyClickyfiedWebhook(rawBody, signatureHeader, timestampHeader, secret) {
  const payloadToSign = \`\${timestampHeader}.\${rawBody}\`;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payloadToSign)
    .digest("hex");
  
  const cleanHeader = signatureHeader.replace(/^sha256=/, "");
  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(cleanHeader)
  );
}`;

  return (
    <div className="space-y-8 text-slate-800 dark:text-slate-100">
      {/* Intro Header */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Clickyfied Developer API Reference</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Complete reference for integrating automated mobile data fulfillment into your apps.
            </p>
          </div>
          <a href="/v1/openapi.json" target="_blank" download="openapi.json">
            <Button variant="outline" size="sm" className="gap-2">
              <Download className="h-4 w-4" /> Download OpenAPI Spec (JSON)
            </Button>
          </a>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/60">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Base URL</p>
            <p className="mt-1 font-mono text-sm font-semibold text-blue-600 dark:text-blue-400">
              https://api.clickyfied.com/v1
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/60">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Auth Header</p>
            <p className="mt-1 font-mono text-xs font-semibold">
              Authorization: Bearer ck_live_...
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/60">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Response Format</p>
            <p className="mt-1 font-mono text-sm font-semibold">application/json</p>
          </div>
        </div>
      </div>

      {/* Authentication & Idempotency */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-blue-500/10 p-2 text-blue-600 dark:text-blue-400">
              <Shield className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold">Authentication</h3>
          </div>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
            Authenticate all requests by passing your API key as a Bearer token in the{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-800">Authorization</code>{" "}
            header:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-950 p-3.5 font-mono text-xs text-slate-200">
            Authorization: Bearer ck_live_xxxxxxxxxxxxxxxxxxxx
          </pre>
          <p className="mt-3 text-xs text-slate-500">
            Production keys (<code className="font-mono">ck_live_...</code>) deduct from your live wallet balance and dispatch live orders.
            Test keys (<code className="font-mono">ck_test_...</code>) operate in sandbox mode.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
              <Zap className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold">Idempotency-Key</h3>
          </div>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
            To prevent duplicate orders when network timeouts or retries occur, provide an{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-800">Idempotency-Key</code>{" "}
            header on order creation:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-950 p-3.5 font-mono text-xs text-slate-200">
            Idempotency-Key: SHOP-ORD-10001
          </pre>
          <p className="mt-3 text-xs text-slate-500">
            If the same key is submitted again, the server returns the existing order safely without double-charging your account.
          </p>
        </div>
      </div>

      {/* Code Examples */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
          <div>
            <h3 className="text-base font-bold">Quickstart: Create Order</h3>
            <p className="text-xs text-slate-500">POST /v1/orders</p>
          </div>
          <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800 no-scrollbar">
            {(["curl", "javascript", "nodejs", "python", "php"] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => setLangTab(lang)}
                className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  langTab === lang
                    ? "bg-white text-blue-600 shadow-sm dark:bg-slate-900 dark:text-blue-400"
                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400"
                }`}
              >
                {lang === "nodejs" ? "NODE.JS" : lang.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="relative mt-4">
          <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 font-mono text-xs text-slate-200">
            {langTab === "curl" && curlOrderExample}
            {langTab === "javascript" && jsOrderExample}
            {langTab === "nodejs" && nodeOrderExample}
            {langTab === "python" && pythonOrderExample}
            {langTab === "php" && phpOrderExample}
          </pre>
          <button
            onClick={() =>
              copy(
                "code-quickstart",
                langTab === "curl"
                  ? curlOrderExample
                  : langTab === "javascript"
                  ? jsOrderExample
                  : langTab === "nodejs"
                  ? nodeOrderExample
                  : langTab === "python"
                  ? pythonOrderExample
                  : phpOrderExample
              )
            }
            className="absolute right-3 top-3 rounded-lg bg-white/10 p-2 text-slate-300 hover:bg-white/20"
            title="Copy code"
          >
            {copiedId === "code-quickstart" ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>

        <div className="mt-4">
          <p className="text-xs font-semibold text-slate-500">Example JSON Response (HTTP 201 Created):</p>
          <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-950 p-4 font-mono text-xs text-slate-200">
{`{
  "success": true,
  "data": {
    "orderId": "CLK-839201",
    "reference": "SHOP-ORD-10001",
    "network": "MTN",
    "package": "1GB",
    "recipient": "0241234567",
    "amount": 3.80,
    "status": "PENDING",
    "createdAt": "2026-09-12T13:45:00.000Z"
  },
  "requestId": "req_839201"
}`}
          </pre>
        </div>
      </div>

      {/* Endpoints Table */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-base font-bold">API Endpoints Summary</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 dark:border-slate-800">
                <th className="pb-3 font-semibold">Method</th>
                <th className="pb-3 font-semibold">Endpoint</th>
                <th className="pb-3 font-semibold">Scope Required</th>
                <th className="pb-3 font-semibold">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono dark:divide-slate-800">
              <tr>
                <td className="py-2.5 font-bold text-emerald-600">GET</td>
                <td className="py-2.5 font-semibold text-slate-800 dark:text-slate-200">/v1/networks</td>
                <td className="py-2.5 text-slate-500">networks:read</td>
                <td className="py-2.5 font-sans text-slate-600 dark:text-slate-400">List available mobile data networks</td>
              </tr>
              <tr>
                <td className="py-2.5 font-bold text-emerald-600">GET</td>
                <td className="py-2.5 font-semibold text-slate-800 dark:text-slate-200">/v1/networks/status</td>
                <td className="py-2.5 text-slate-500">networks:read</td>
                <td className="py-2.5 font-sans text-slate-600 dark:text-slate-400">Check operational & order availability status</td>
              </tr>
              <tr>
                <td className="py-2.5 font-bold text-emerald-600">GET</td>
                <td className="py-2.5 font-semibold text-slate-800 dark:text-slate-200">/v1/packages</td>
                <td className="py-2.5 text-slate-500">packages:read</td>
                <td className="py-2.5 font-sans text-slate-600 dark:text-slate-400">Get data bundles and tier pricing (?network=mtn)</td>
              </tr>
              <tr>
                <td className="py-2.5 font-bold text-blue-600">POST</td>
                <td className="py-2.5 font-semibold text-slate-800 dark:text-slate-200">/v1/orders</td>
                <td className="py-2.5 text-slate-500">orders:create</td>
                <td className="py-2.5 font-sans text-slate-600 dark:text-slate-400">Create a new data order (supports Idempotency-Key)</td>
              </tr>
              <tr>
                <td className="py-2.5 font-bold text-emerald-600">GET</td>
                <td className="py-2.5 font-semibold text-slate-800 dark:text-slate-200">/v1/orders/:id</td>
                <td className="py-2.5 text-slate-500">orders:read</td>
                <td className="py-2.5 font-sans text-slate-600 dark:text-slate-400">Get single order details by Clickyfied order ID</td>
              </tr>
              <tr>
                <td className="py-2.5 font-bold text-emerald-600">GET</td>
                <td className="py-2.5 font-semibold text-slate-800 dark:text-slate-200">/v1/orders/reference/:ref</td>
                <td className="py-2.5 text-slate-500">orders:read</td>
                <td className="py-2.5 font-sans text-slate-600 dark:text-slate-400">Check order by your own external reference</td>
              </tr>
              <tr>
                <td className="py-2.5 font-bold text-blue-600">POST</td>
                <td className="py-2.5 font-semibold text-slate-800 dark:text-slate-200">/v1/orders/status</td>
                <td className="py-2.5 text-slate-500">orders:status</td>
                <td className="py-2.5 font-sans text-slate-600 dark:text-slate-400">Bulk check up to 100 orders in one request</td>
              </tr>
              <tr>
                <td className="py-2.5 font-bold text-emerald-600">GET</td>
                <td className="py-2.5 font-semibold text-slate-800 dark:text-slate-200">/v1/orders</td>
                <td className="py-2.5 text-slate-500">orders:read</td>
                <td className="py-2.5 font-sans text-slate-600 dark:text-slate-400">Paginated order history with search and filters</td>
              </tr>
              <tr>
                <td className="py-2.5 font-bold text-emerald-600">GET</td>
                <td className="py-2.5 font-semibold text-slate-800 dark:text-slate-200">/v1/balance</td>
                <td className="py-2.5 text-slate-500">balance:read</td>
                <td className="py-2.5 font-sans text-slate-600 dark:text-slate-400">Check current wallet balance in GHS</td>
              </tr>
              <tr>
                <td className="py-2.5 font-bold text-emerald-600">GET</td>
                <td className="py-2.5 font-semibold text-slate-800 dark:text-slate-200">/v1/webhooks</td>
                <td className="py-2.5 text-slate-500">webhooks:read</td>
                <td className="py-2.5 font-sans text-slate-600 dark:text-slate-400">Get webhook configuration & delivery history</td>
              </tr>
              <tr>
                <td className="py-2.5 font-bold text-blue-600">POST</td>
                <td className="py-2.5 font-semibold text-slate-800 dark:text-slate-200">/v1/webhooks</td>
                <td className="py-2.5 text-slate-500">webhooks:manage</td>
                <td className="py-2.5 font-sans text-slate-600 dark:text-slate-400">Configure webhook endpoint & subscriptions</td>
              </tr>
              <tr>
                <td className="py-2.5 font-bold text-blue-600">POST</td>
                <td className="py-2.5 font-semibold text-slate-800 dark:text-slate-200">/v1/webhooks/test</td>
                <td className="py-2.5 text-slate-500">webhooks:manage</td>
                <td className="py-2.5 font-sans text-slate-600 dark:text-slate-400">Trigger test webhook ping to verify listener</td>
              </tr>
              <tr>
                <td className="py-2.5 font-bold text-emerald-600">GET</td>
                <td className="py-2.5 font-semibold text-slate-800 dark:text-slate-200">/v1/status</td>
                <td className="py-2.5 text-slate-500">None (Public)</td>
                <td className="py-2.5 font-sans text-slate-600 dark:text-slate-400">Operational status of all system components</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Webhook Security & Signatures */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-base font-bold">Webhook Security & Signature Verification</h3>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Every webhook delivery includes an HMAC SHA-256 signature in the{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-800">X-Clickyfied-Signature</code>{" "}
          header and a timestamp in{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-800">X-Clickyfied-Timestamp</code>.
          Compute the HMAC of <code className="font-mono text-xs">{`\${timestamp}.\${rawBody}`}</code> using your webhook secret to verify authenticity.
        </p>

        <div className="relative mt-4">
          <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 font-mono text-xs text-slate-200">
            {webhookVerifyNode}
          </pre>
          <button
            onClick={() => copy("webhook-verify", webhookVerifyNode)}
            className="absolute right-3 top-3 rounded-lg bg-white/10 p-2 text-slate-300 hover:bg-white/20"
            title="Copy verification code"
          >
            {copiedId === "webhook-verify" ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Error Codes Reference */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-base font-bold">Standardized Error Codes</h3>
        <p className="mt-1 text-xs text-slate-500">All error responses share a consistent structure:</p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-950 p-4 font-mono text-xs text-slate-200">
{`{
  "success": false,
  "error": {
    "code": "INVALID_RECIPIENT",
    "message": "The recipient number is invalid. Enter a valid Ghanaian mobile number e.g. 0241234567"
  },
  "requestId": "req_839201"
}`}
        </pre>

        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
            <span className="font-mono font-bold text-red-500">UNAUTHORIZED</span>
            <p className="text-slate-500">401 — Missing or invalid API key.</p>
          </div>
          <div className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
            <span className="font-mono font-bold text-red-500">FORBIDDEN</span>
            <p className="text-slate-500">403 — Insufficient scope, unapproved application, or disabled key.</p>
          </div>
          <div className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
            <span className="font-mono font-bold text-amber-500">INVALID_RECIPIENT</span>
            <p className="text-slate-500">400 — Number does not match Ghanaian carrier format.</p>
          </div>
          <div className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
            <span className="font-mono font-bold text-amber-500">INVALID_PACKAGE</span>
            <p className="text-slate-500">400 — Package does not exist or is currently inactive.</p>
          </div>
          <div className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
            <span className="font-mono font-bold text-amber-500">INSUFFICIENT_BALANCE</span>
            <p className="text-slate-500">402 — Account wallet balance is insufficient for this bundle.</p>
          </div>
          <div className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
            <span className="font-mono font-bold text-amber-500">DUPLICATE_REQUEST</span>
            <p className="text-slate-500">409 — External reference or Idempotency-Key collision.</p>
          </div>
          <div className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
            <span className="font-mono font-bold text-purple-500">RATE_LIMIT_EXCEEDED</span>
            <p className="text-slate-500">429 — Request limit per minute exceeded.</p>
          </div>
          <div className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
            <span className="font-mono font-bold text-purple-500">ORDER_PROCESSING_UNAVAILABLE</span>
            <p className="text-slate-500">503 — System maintenance or temporary carrier outage.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
