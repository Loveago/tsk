"use client";

import * as React from "react";
import { useToast } from "@/components/toast";
import { QueueList, SendSummary, type Line } from "@/components/send/queue-list";
import { NETWORKS, formatGHS } from "@/lib/types";
import { NETWORK_LABELS, parseOrderLine, normalizeTextNumbers } from "@/lib/order-parse";
import { cn } from "@/lib/utils";
import {
  ClipboardPaste,
  Download,
  FileUp,
  Loader2,
  Send,
  UploadCloud,
} from "lucide-react";

interface Pkg {
  id: string;
  network: string;
  name: string;
  gbAmount: number;
  price: number | null;
}

export default function SendOrderPage() {
  const { toast } = useToast();
  const [packages, setPackages] = React.useState<Pkg[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [network, setNetwork] = React.useState<string>("MTN");
  const [tab, setTab] = React.useState<"upload" | "paste">("upload");
  const [bulkText, setBulkText] = React.useState("");
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [lines, setLines] = React.useState<Line[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    fetch("/api/packages")
      .then((r) => r.json())
      .then((d) => setPackages(d.packages ?? []))
      .catch(() => toast("Failed to load packages", "error"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If the selected network has no packages, fall back to the first one that does.
  React.useEffect(() => {
    if (loading || !packages.length) return;
    if (packages.some((p) => p.network === network)) return;
    const first = NETWORKS.find((n) => packages.some((p) => p.network === n));
    if (first) setNetwork(first);
  }, [packages, loading, network]);

  const addParsed = (parsed: Line[], skipped: number, source: string) => {
    if (!parsed.length) {
      toast(
        skipped > 0
          ? `${skipped} invalid line(s) skipped`
          : `No valid orders found in ${source}`,
        "error"
      );
      return;
    }
    setLines((l) => [...l, ...parsed]);
    toast(
      `${parsed.length} order(s) added${skipped > 0 ? ` — ${skipped} line(s) skipped` : ""}`,
      "success"
    );
  };

  const handleText = (text: string, source: string) => {
    const cleanText = normalizeTextNumbers(text);
    const parsed: Line[] = [];
    let skipped = 0;
    cleanText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .forEach((line) => {
        const parsedLine = parseOrderLine(line, packages, network);
        if (parsedLine) parsed.push(parsedLine);
        else skipped++;
      });
    addParsed(parsed, skipped, source);
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    if (!/\.xlsx$/i.test(file.name)) {
      toast("Please upload an Excel (.xlsx) file — one row per order: number, then GB", "error");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast("File is too large — maximum 5MB", "error");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/orders/parse-excel", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? "Failed to read the Excel file", "error");
        return;
      }
      const rows: string[][] = json.rows ?? [];
      const parsed: Line[] = [];
      let skipped = 0;
      for (const row of rows) {
        const rawLine = row.join(",").trim();
        if (!rawLine) continue;
        const line = normalizeTextNumbers(rawLine);
        const parsedLine = parseOrderLine(line, packages, network);
        if (parsedLine) parsed.push(parsedLine);
        else skipped++;
      }
      addParsed(parsed, skipped, file.name);
    } catch {
      toast("Failed to read the Excel file", "error");
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const total = lines.reduce((s, l) => s + (l.price ?? 0), 0);

  const submit = async () => {
    if (!lines.length) {
      toast("Add at least one order", "error");
      return;
    }
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orders: lines.map(({ phoneNumber, network: n, gbAmount: gb }) => ({
            phoneNumber,
            network: n,
            gbAmount: gb,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? "Failed to send orders", "error");
        return;
      }
      setResult(`${json.count} order(s) sent — total ${formatGHS(json.total)}. Now processing.`);
      setLines([]);
      setFileName(null);
      toast("Orders sent!", "success");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {result && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
          <Send className="h-4 w-4 shrink-0" /> {result}
        </div>
      )}

      {/* Upload card */}
      <div className="rounded-2xl border border-slate-200/70 bg-white shadow-sm dark:border-white/5 dark:bg-[#0d1526]">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 dark:border-white/5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 text-white shadow-md shadow-blue-600/25">
            <FileUp className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-sm font-bold">Send Orders</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Upload and process order files for sending
            </p>
          </div>
        </div>
        {/* Network + method */}
        <div className="space-y-4 px-5 pt-4">
          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Network
            </p>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/5">
              {NETWORKS.map((n) => {
                const unavailable =
                  !loading && packages.length > 0 && !packages.some((p) => p.network === n);
                return (
                  <button
                    key={n}
                    onClick={() => setNetwork(n)}
                    disabled={unavailable}
                    title={unavailable ? "No packages available for this network" : undefined}
                    className={cn(
                      "flex h-9 items-center justify-center rounded-lg text-sm font-semibold transition-all",
                      network === n
                        ? "bg-white text-brand-600 shadow-sm dark:bg-[#1a2438] dark:text-brand-400"
                        : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
                      unavailable &&
                        "cursor-not-allowed opacity-40 hover:text-slate-500 dark:hover:text-slate-400"
                    )}
                  >
                    {NETWORK_LABELS[n]}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/5">
            {(
              [
                { key: "upload", label: "Upload File", icon: UploadCloud },
                { key: "paste", label: "Paste Text", icon: ClipboardPaste },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex h-9 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-all",
                  tab === t.key
                    ? "bg-white text-brand-600 shadow-sm dark:bg-[#1a2438] dark:text-brand-400"
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                )}
              >
                <t.icon className="h-4 w-4" /> {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5">
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">Loading packages…</p>
          ) : tab === "upload" ? (
            <div className="space-y-3">
              <div
                onClick={() => !uploading && fileRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
                  dragging
                    ? "border-brand-500 bg-brand-50/60 dark:bg-brand-500/10"
                    : "border-brand-400/50 hover:border-brand-500 hover:bg-brand-50/40 dark:hover:bg-brand-500/5",
                  uploading && "pointer-events-none opacity-60"
                )}
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-600 text-white shadow-lg shadow-blue-600/25">
                  {uploading ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <UploadCloud className="h-6 w-6" />
                  )}
                </span>
                <p className="text-sm font-semibold">
                  {uploading ? (
                    "Reading your file…"
                  ) : (
                    <>
                      Drag &amp; drop your Excel file or{" "}
                      <span className="text-brand-600 dark:text-brand-400">click to browse</span>
                    </>
                  )}
                </p>
                <p className="max-w-sm text-xs text-slate-500 dark:text-slate-400">
                  Upload an Excel (.xlsx) file with one order per row — phone number first, then
                  GB. Every row is sent to{" "}
                  <span className="font-semibold">{NETWORK_LABELS[network]}</span>.
                </p>
                {fileName && (
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Selected: {fileName}
                  </p>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFile(f);
                    e.target.value = "";
                  }}
                />
              </div>
              <a
                href="/api/orders/template"
                download="clickyfied-order-template.xlsx"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
              >
                <Download className="h-3.5 w-3.5" /> Download Excel template
              </a>
            </div>
          ) : (
            <div className="space-y-3">
              <textarea
                rows={6}
                placeholder={"535308873,1\n0507904981 10gb\n541234567"}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                onPaste={(e) => {
                  const pasted = e.clipboardData?.getData("text");
                  if (pasted) {
                    e.preventDefault();
                    const converted = normalizeTextNumbers(pasted);
                    const target = e.currentTarget;
                    const start = target.selectionStart ?? 0;
                    const end = target.selectionEnd ?? 0;
                    const val = target.value;
                    const next = val.slice(0, start) + converted + val.slice(end);
                    setBulkText(next);
                  }
                }}
                onBlur={() => {
                  if (bulkText) setBulkText(normalizeTextNumbers(bulkText));
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100 dark:placeholder:text-slate-500"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    One order per line:{" "}
                    <span className="font-mono font-semibold">number, gb</span> — e.g.{" "}
                    <span className="font-mono font-semibold">535308873,1</span> or{" "}
                    <span className="font-mono font-semibold">0507904981 10gb</span>. All orders go
                    to <span className="font-semibold">{NETWORK_LABELS[network]}</span>
                  </p>
                  <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    ✓ Numbers missing leading zero (e.g. 535308873) are automatically converted to 0535308873.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {bulkText.trim() && (
                    <button
                      type="button"
                      onClick={() => setBulkText(normalizeTextNumbers(bulkText))}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
                    >
                      Format Numbers
                    </button>
                  )}
                  <button
                    onClick={() => {
                      handleText(bulkText, "pasted text");
                      setBulkText("");
                    }}
                    disabled={!bulkText.trim()}
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
                  >
                    <ClipboardPaste className="h-4 w-4" /> Parse &amp; add
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {lines.length > 0 && (
        <QueueList
          lines={lines}
          onRemove={(i) => setLines((ls) => ls.filter((_, j) => j !== i))}
          onClear={() => setLines([])}
        />
      )}

      <SendSummary
        count={lines.length}
        total={total}
        submitting={submitting}
        onSubmit={submit}
      />
    </div>
  );
}
