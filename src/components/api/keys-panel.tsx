"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/shared";
import { formatDateTime } from "@/lib/types";
import { KeyRound, Trash2, Copy } from "lucide-react";

interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  active: boolean;
  lastUsedAt: string | null;
  requestCount: number;
  createdAt: string;
}

export function KeysPanel() {
  const { toast } = useToast();
  const [keys, setKeys] = React.useState<KeyRow[]>([]);
  const [name, setName] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [secret, setSecret] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const res = await fetch("/api/keys");
    const json = await res.json();
    setKeys(json.keys ?? []);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || "Default key" }),
      });
      const json = await res.json();
      if (!res.ok) return toast(json.error ?? "Failed to create key", "error");
      setSecret(json.key.secret);
      setName("");
      load();
      toast("API key created", "success");
    } finally {
      setCreating(false);
    }
  };

  const toggle = async (id: string) => {
    await fetch(`/api/keys/${id}`, { method: "PATCH" });
    load();
  };

  const remove = async (id: string) => {
    await fetch(`/api/keys/${id}`, { method: "DELETE" });
    load();
    toast("Key deleted", "info");
  };

  return (
    <div className="space-y-4">
      {secret && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-400">
            COPY YOUR KEY NOW — it won&apos;t be shown again
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-white px-2 py-1.5 font-mono text-xs dark:bg-slate-900">
              {secret}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(secret);
                toast("Copied", "info");
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="keyName">Key name</Label>
          <Input
            id="keyName"
            placeholder="e.g. Production server"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <Button onClick={create} disabled={creating}>
          {creating ? <Spinner /> : <KeyRound className="h-4 w-4" />} Generate key
        </Button>
      </div>

      {keys.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">No API keys yet.</p>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center gap-3 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {k.name}{" "}
                  <span className={`ml-1 text-xs ${k.active ? "text-emerald-600" : "text-slate-400"}`}>
                    {k.active ? "active" : "disabled"}
                  </span>
                </p>
                <p className="font-mono text-xs text-slate-500">{k.prefix}••••</p>
                <p className="text-[11px] text-slate-400">
                  {k.requestCount} requests · created {formatDateTime(k.createdAt)}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => toggle(k.id)}>
                {k.active ? "Disable" : "Enable"}
              </Button>
              <button onClick={() => remove(k.id)} className="text-slate-400 hover:text-red-600">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
