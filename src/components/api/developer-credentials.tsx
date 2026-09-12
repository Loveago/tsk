"use client";

import * as React from "react";
import { Plus, Copy, Check, Key, Power, RefreshCw, Trash2, ShieldAlert, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner, EmptyState } from "@/components/shared";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/components/toast";
import { formatDateTime } from "@/lib/types";

interface CredentialRow {
  id: string;
  name: string;
  environment: string;
  keyPrefix: string;
  status: string;
  scopes: string;
  rateLimitPerMin: number;
  dailyLimit: number;
  requestCount: number;
  lastUsedAt: string | null;
  createdAt: string;
}

export function DeveloperCredentials({
  isApprovedForProduction,
  applicationStatus,
}: {
  isApprovedForProduction: boolean;
  applicationStatus: string;
}) {
  const { toast } = useToast();
  const [credentials, setCredentials] = React.useState<CredentialRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const [createName, setCreateName] = React.useState("");
  const [createEnv, setCreateEnv] = React.useState<"PRODUCTION" | "SANDBOX">(
    isApprovedForProduction ? "PRODUCTION" : "SANDBOX"
  );
  const [creating, setCreating] = React.useState(false);
  const [newKeyModal, setNewKeyModal] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/developer/credentials");
      const json = await res.json();
      setCredentials(json.credentials ?? []);
    } catch {
      toast("Failed to load API credentials", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) return;

    if (createEnv === "PRODUCTION" && !isApprovedForProduction) {
      toast("Production credentials require an approved API application", "error");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/developer/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createName.trim(), environment: createEnv }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? "Failed to generate key", "error");
        return;
      }
      setShowCreateModal(false);
      setCreateName("");
      setNewKeyModal(json.apiKey);
      toast("Credential created successfully", "success");
      load();
    } catch {
      toast("Failed to create credential", "error");
    } finally {
      setCreating(false);
    }
  };

  const handleAction = async (id: string, action: "DISABLE" | "ENABLE" | "REVOKE" | "ROTATE") => {
    if (action === "REVOKE" && !confirm("Are you sure you want to permanently revoke this credential? Any system using it will immediately fail.")) {
      return;
    }

    try {
      const res = await fetch(`/api/developer/credentials/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? "Action failed", "error");
        return;
      }

      if (action === "ROTATE" && json.newApiKey) {
        setNewKeyModal(json.newApiKey);
        toast("Key rotated successfully. Save your new key.", "success");
      } else {
        toast(`Credential ${action.toLowerCase()}d`, "success");
      }
      load();
    } catch {
      toast("Failed to update credential", "error");
    }
  };

  const copyKey = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast("API key copied to clipboard", "success");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold tracking-tight">API Credentials</h2>
          <p className="text-xs text-slate-500">
            Generate and manage API keys for your applications. Keys are cryptographically hashed.
          </p>
        </div>
        <Button
          onClick={() => setShowCreateModal(true)}
          className="gap-2 bg-gradient-to-r from-blue-600 to-violet-600 text-white"
        >
          <Plus className="h-4 w-4" /> Create API Credential
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner className="h-6 w-6 text-blue-600" />
          </div>
        ) : credentials.length === 0 ? (
          <EmptyState
            icon={Key}
            title="No API credentials yet"
            description="Create your first credential to start sending orders via the developer API."
            action={
              <Button onClick={() => setShowCreateModal(true)} size="sm">
                Create Credential
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 dark:border-slate-800">
                  <th className="px-4 py-3 font-semibold">Name & Key</th>
                  <th className="px-4 py-3 font-semibold">Environment</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Requests</th>
                  <th className="px-4 py-3 font-semibold">Rate Limit</th>
                  <th className="hidden px-4 py-3 font-semibold md:table-cell">Last Used</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {credentials.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{c.name}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-slate-400">{c.keyPrefix}••••••••••••</p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          c.environment === "PRODUCTION"
                            ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {c.environment}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300">
                      {c.requestCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono">
                      {c.rateLimitPerMin}/min
                    </td>
                    <td className="hidden px-4 py-3 text-slate-400 md:table-cell">
                      {c.lastUsedAt ? formatDateTime(c.lastUsedAt) : "Never"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {c.status === "ACTIVE" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleAction(c.id, "DISABLE")}
                            title="Disable Key"
                            className="h-8 px-2 text-slate-500 hover:text-slate-800"
                          >
                            <Power className="h-3.5 w-3.5" /> Disable
                          </Button>
                        ) : c.status === "DISABLED" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleAction(c.id, "ENABLE")}
                            title="Enable Key"
                            className="h-8 px-2 text-emerald-600 hover:text-emerald-700"
                          >
                            <Power className="h-3.5 w-3.5" /> Enable
                          </Button>
                        ) : null}

                        {c.status !== "REVOKED" && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleAction(c.id, "ROTATE")}
                              title="Rotate Key"
                              className="h-8 px-2 text-blue-600 hover:text-blue-700"
                            >
                              <RefreshCw className="h-3.5 w-3.5" /> Rotate
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleAction(c.id, "REVOKE")}
                              title="Revoke Key"
                              className="h-8 px-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Revoke
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <h3 className="text-base font-bold">Generate API Credential</h3>
            <p className="mt-1 text-xs text-slate-500">
              Create a new key to authorize requests from your website or backend.
            </p>

            <form onSubmit={handleCreate} className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Credential Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. My Production Website, Mobile App"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Environment
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => isApprovedForProduction && setCreateEnv("PRODUCTION")}
                    disabled={!isApprovedForProduction}
                    className={`rounded-xl border p-3 text-left transition ${
                      createEnv === "PRODUCTION"
                        ? "border-blue-600 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-500/10"
                        : "border-slate-200 opacity-60 dark:border-slate-700"
                    } ${!isApprovedForProduction ? "cursor-not-allowed opacity-40" : ""}`}
                  >
                    <p className="text-xs font-bold">Production</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">Live money & orders</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCreateEnv("SANDBOX")}
                    className={`rounded-xl border p-3 text-left transition ${
                      createEnv === "SANDBOX"
                        ? "border-amber-600 bg-amber-50/50 dark:border-amber-500 dark:bg-amber-500/10"
                        : "border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    <p className="text-xs font-bold">Sandbox (Test)</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">Test orders, mock balance</p>
                  </button>
                </div>

                {!isApprovedForProduction && (
                  <p className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Production keys require an approved application (Status: {applicationStatus}).
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={creating}
                  className="bg-blue-600 text-white hover:bg-blue-700"
                >
                  {creating ? <Spinner className="h-4 w-4" /> : "Generate Key"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Secret Shown Once Modal */}
      {newKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2.5 text-amber-600">
              <ShieldAlert className="h-5 w-5" />
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Save Your API Key Now
              </h3>
            </div>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
              This is the <strong>only time</strong> your full API key will be displayed. Please store it
              securely in your environment variables or secret store.
            </p>

            <div className="mt-4 rounded-xl bg-slate-950 p-4">
              <div className="flex items-center justify-between gap-3">
                <code className="break-all font-mono text-xs font-semibold text-emerald-400">
                  {newKeyModal}
                </code>
                <Button
                  size="sm"
                  onClick={() => copyKey(newKeyModal)}
                  className="shrink-0 gap-1 bg-white/10 hover:bg-white/20 text-white"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button onClick={() => setNewKeyModal(null)} size="sm">
                I Have Stored My Key Securely
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
