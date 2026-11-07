"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Globe,
  ExternalLink,
  Copy,
  Check,
  AlertTriangle,
  Loader2,
  Megaphone,
  Sparkles,
  ShieldCheck,
  FileDown,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Cloud,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";

interface Initial {
  slug: string;
  customDomain: string;
  customDomainStatus: string; // NONE | PENDING_DNS | ACTIVE | ERROR
  customDomainVerifiedAt: string | null;
  customDomainError: string | null;
  preferredDomainMode: "DEFAULT" | "CUSTOM";
  name: string;
  description: string;
  whatsapp: string;
  phone: string;
  whatsappGroupLink: string;
  location: string;
  contactText: string;
  whatsappLabel: string;
  notice: string;
  payoutNetwork: string;
  payoutNumber: string;
  payoutAccountName: string;
}

export function StorefrontSettingsForm({
  initial,
  storefrontDomain = "tskdatastore.com",
  cnameTarget = "tskdatastore.com",
  vpsIp = "2.28.97.253",
}: {
  initial: Initial;
  storefrontDomain?: string;
  cnameTarget?: string;
  vpsIp?: string | null;
}) {
  const router = useRouter();
  const [form, setForm] = React.useState(initial);
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Slug specific state
  const [currentSlug, setCurrentSlug] = React.useState(initial.slug);
  const [slugInput, setSlugInput] = React.useState(initial.slug);
  const [slugMsg, setSlugMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [slugBusy, setSlugBusy] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  // Custom Domain state
  const [domainMode, setDomainMode] = React.useState<"DEFAULT" | "CUSTOM">(initial.preferredDomainMode);
  const [savedCustomDomain, setSavedCustomDomain] = React.useState(initial.customDomain);
  const [customDomainInput, setCustomDomainInput] = React.useState(initial.customDomain);
  const [domainStatus, setDomainStatus] = React.useState(initial.customDomainStatus);
  const [domainVerifiedAt, setDomainVerifiedAt] = React.useState(initial.customDomainVerifiedAt);
  const [domainError, setDomainError] = React.useState<string | null>(initial.customDomainError);
  const [domainMsg, setDomainMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [domainBusy, setDomainBusy] = React.useState(false);
  const [verifyBusy, setVerifyBusy] = React.useState(false);
  const [guideOpen, setGuideOpen] = React.useState(!initial.customDomain || initial.customDomainStatus !== "ACTIVE");
  const [copiedField, setCopiedField] = React.useState<string | null>(null);

  const cleanDomain = storefrontDomain.toLowerCase().replace(/^www\./, "");
  const defaultStoreUrl = `https://${cleanDomain}/${currentSlug}`;
  const previewStoreUrl = `https://${cleanDomain}/${slugInput.trim() || currentSlug}`;
  const isCustomActive = Boolean(savedCustomDomain && domainStatus === "ACTIVE");
  const customStoreUrl = savedCustomDomain ? `https://${savedCustomDomain}` : null;
  const primaryStoreUrl =
    domainMode === "CUSTOM" && isCustomActive && customStoreUrl
      ? customStoreUrl
      : defaultStoreUrl;

  const userDomainTarget =
    (customDomainInput || savedCustomDomain)
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .split("/")[0]
      .split(":")[0]
      .replace(/^www\./, "") || "yourdomain.com";
  const serverIpTarget = vpsIp || "2.28.97.253";

  const set =
    (k: keyof Initial) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  function handleSlugChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    setSlugInput(val);
    if (slugMsg) setSlugMsg(null);
  }

  async function copyText(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(key);
      setTimeout(() => setCopiedField((prev) => (prev === key ? null : prev)), 2000);
    } catch {
      // ignore
    }
  }

  async function copyStoreLink() {
    try {
      await navigator.clipboard.writeText(primaryStoreUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  async function handleSelectDomainMode(nextMode: "DEFAULT" | "CUSTOM") {
    setDomainMode(nextMode);
    setDomainMsg(null);
    // If switching to DEFAULT or switching to CUSTOM when a custom domain is already saved, persist preference
    if (nextMode === "DEFAULT" || savedCustomDomain) {
      try {
        const res = await fetch("/api/storefront/domain", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preferredDomainMode: nextMode }),
        });
        const data = await res.json();
        if (res.ok) {
          setDomainMsg({ kind: "ok", text: data.message || "Domain preference updated." });
          router.refresh();
        }
      } catch {
        // ignore
      }
    }
  }

  async function saveCustomDomain(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = customDomainInput
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .split("/")[0]
      .split(":")[0]
      .replace(/^www\./, "");

    if (!cleaned) {
      setDomainMsg({ kind: "err", text: "Please enter a domain name (e.g. kofidata.com)." });
      return;
    }

    setDomainBusy(true);
    setDomainMsg(null);
    try {
      const res = await fetch("/api/storefront/domain", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customDomain: cleaned,
          preferredDomainMode: "CUSTOM",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save custom domain");

      setSavedCustomDomain(data.storefront.customDomain || cleaned);
      setCustomDomainInput(data.storefront.customDomain || cleaned);
      setDomainStatus(data.storefront.customDomainStatus || "PENDING_DNS");
      setDomainError(data.storefront.customDomainError || null);
      setDomainMode("CUSTOM");
      setDomainMsg({ kind: "ok", text: data.message || "Custom domain saved!" });
      router.refresh();
    } catch (err) {
      setDomainMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "Failed to save custom domain",
      });
    } finally {
      setDomainBusy(false);
    }
  }

  async function verifyCustomDomain() {
    const cleaned = (customDomainInput || savedCustomDomain)
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .split("/")[0]
      .split(":")[0]
      .replace(/^www\./, "");

    if (!cleaned) {
      setDomainMsg({ kind: "err", text: "Please enter a custom domain first." });
      return;
    }

    setVerifyBusy(true);
    setDomainMsg(null);
    try {
      const res = await fetch("/api/storefront/domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customDomain: cleaned }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Verification failed");

      setSavedCustomDomain(data.storefront.customDomain || cleaned);
      setCustomDomainInput(data.storefront.customDomain || cleaned);
      setDomainStatus(data.storefront.customDomainStatus);
      setDomainVerifiedAt(data.storefront.customDomainVerifiedAt || null);
      setDomainError(data.storefront.customDomainError || null);
      if (data.verified) {
        setDomainMode("CUSTOM");
        setDomainMsg({ kind: "ok", text: data.message });
      } else {
        setDomainMsg({ kind: "err", text: data.message || "DNS records not verified yet." });
      }
      router.refresh();
    } catch (err) {
      setDomainMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "Failed to verify domain",
      });
    } finally {
      setVerifyBusy(false);
    }
  }

  async function disconnectCustomDomain() {
    if (!savedCustomDomain) return;
    if (!window.confirm(`Disconnect "${savedCustomDomain}" and revert to ${cleanDomain}/${currentSlug}?`)) {
      return;
    }
    setDomainBusy(true);
    setDomainMsg(null);
    try {
      const res = await fetch("/api/storefront/domain", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to disconnect domain");

      setSavedCustomDomain("");
      setCustomDomainInput("");
      setDomainStatus("NONE");
      setDomainVerifiedAt(null);
      setDomainError(null);
      setDomainMode("DEFAULT");
      setDomainMsg({ kind: "ok", text: data.message || "Custom domain disconnected." });
      router.refresh();
    } catch (err) {
      setDomainMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "Failed to disconnect domain",
      });
    } finally {
      setDomainBusy(false);
    }
  }

  async function saveSlug(e: React.FormEvent) {
    e.preventDefault();
    const cleanSlug = slugInput
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    if (cleanSlug.length < 3 || cleanSlug.length > 32) {
      setSlugMsg({ kind: "err", text: "Address slug must be between 3 and 32 characters." });
      return;
    }

    if (cleanSlug === currentSlug) {
      setSlugMsg({ kind: "ok", text: "Store address is already set to this." });
      return;
    }

    setSlugBusy(true);
    setSlugMsg(null);
    try {
      const res = await fetch("/api/storefront/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: cleanSlug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update store address");

      const savedSlug = data.storefront?.slug || cleanSlug;
      setCurrentSlug(savedSlug);
      setSlugInput(savedSlug);
      setSlugMsg({
        kind: "ok",
        text: `Store address updated successfully to ${cleanDomain}/${savedSlug}!`,
      });
      router.refresh();
    } catch (err) {
      setSlugMsg({ kind: "err", text: err instanceof Error ? err.message : "Failed to update store address" });
    } finally {
      setSlugBusy(false);
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/storefront/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeName: form.name,
          description: form.description,
          phone: form.phone,
          whatsappGroupLink: form.whatsappGroupLink,
          supportPhone: form.whatsapp,
          contactText: form.contactText,
          whatsappLabel: form.whatsappLabel,
          notice: form.notice,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setMsg({ kind: "ok", text: "Store profile saved." });
      router.refresh();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Failed to save" });
    } finally {
      setBusy(false);
    }
  }

  async function savePayout(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/storefront/settings/payout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payoutNetwork: form.payoutNetwork,
          payoutNumber: form.payoutNumber,
          payoutAccountName: form.payoutAccountName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setMsg({ kind: "ok", text: "Payout account saved." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Failed to save" });
    } finally {
      setBusy(false);
    }
  }

  const pdfGuideHref = `/api/storefront/domain-guide-pdf${
    (customDomainInput || savedCustomDomain).trim()
      ? `?domain=${encodeURIComponent((customDomainInput || savedCustomDomain).trim())}`
      : ""
  }`;

  const inputCls =
    "h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 placeholder:text-slate-400 caret-brand-600 dark:border-slate-700 dark:bg-transparent dark:text-slate-100 dark:placeholder:text-slate-500 dark:caret-brand-400";

  return (
    <div className="space-y-6">
      {/* Store Web Address & Custom Domain Card */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/50 p-5 shadow-sm dark:border-slate-800 dark:from-[#0f172a] dark:to-[#0b1120]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600/10 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400">
              <Globe className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Store Web Address &amp; Custom Domain
                </h2>
                {isCustomActive && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                    <CheckCircle2 className="h-3 w-3" />
                    Custom Domain Live
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Choose between your free default storefront link or connect your own custom domain from Cloudflare or any registrar.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={pdfGuideHref}
              download
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-xs transition hover:bg-emerald-100 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
            >
              <FileDown className="h-3.5 w-3.5" />
              Download PDF Setup Guide
            </a>
            <a
              href={primaryStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Visit Store
            </a>
            <button
              type="button"
              onClick={copyStoreLink}
              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-100 dark:border-violet-800/60 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-900/50"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied!" : "Copy Link"}
            </button>
          </div>
        </div>

        {/* Dual Option Selector Cards */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {/* Option 1: Default Storefront Domain */}
          <button
            type="button"
            onClick={() => handleSelectDomainMode("DEFAULT")}
            className={`group flex flex-col justify-between rounded-xl border p-4 text-left transition-all ${
              domainMode === "DEFAULT"
                ? "border-violet-600 bg-violet-50/50 ring-1 ring-violet-600 dark:border-violet-500 dark:bg-violet-500/10 dark:ring-violet-500"
                : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700"
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                  Option 1 · Default Domain
                </span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                  Free &amp; Instant
                </span>
              </div>
              <p className="mt-1.5 font-mono text-sm font-bold text-slate-900 dark:text-white break-all">
                {cleanDomain}/{currentSlug}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Ready out of the box with zero DNS setup. Always stays active even if you connect a custom domain.
              </p>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-violet-600 dark:text-violet-400">
              <span
                className={`h-2 w-2 rounded-full ${
                  domainMode === "DEFAULT" ? "bg-violet-600 dark:bg-violet-400" : "bg-slate-300 dark:bg-slate-600"
                }`}
              />
              {domainMode === "DEFAULT" ? "Selected as Primary Store Link" : "Click to use as Primary Link"}
            </div>
          </button>

          {/* Option 2: Custom Domain */}
          <button
            type="button"
            onClick={() => handleSelectDomainMode("CUSTOM")}
            className={`group flex flex-col justify-between rounded-xl border p-4 text-left transition-all ${
              domainMode === "CUSTOM"
                ? "border-violet-600 bg-violet-50/50 ring-1 ring-violet-600 dark:border-violet-500 dark:bg-violet-500/10 dark:ring-violet-500"
                : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700"
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                  Option 2 · Custom Domain
                </span>
                {domainStatus === "ACTIVE" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                    <CheckCircle2 className="h-3 w-3" />
                    Verified &amp; Live
                  </span>
                ) : domainStatus === "PENDING_DNS" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                    <Clock className="h-3 w-3" />
                    Pending DNS
                  </span>
                ) : domainStatus === "ERROR" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-500/15 dark:text-red-300">
                    <XCircle className="h-3 w-3" />
                    Action Needed
                  </span>
                ) : (
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                    Cloudflare / Any Registrar
                  </span>
                )}
              </div>
              <p className="mt-1.5 font-mono text-sm font-bold text-slate-900 dark:text-white break-all">
                {savedCustomDomain || "yourdomain.com"}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Buy a domain on Cloudflare (or Namecheap/GoDaddy) and connect it for a 100% branded storefront URL.
              </p>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-violet-600 dark:text-violet-400">
              <span
                className={`h-2 w-2 rounded-full ${
                  domainMode === "CUSTOM" ? "bg-violet-600 dark:bg-violet-400" : "bg-slate-300 dark:bg-slate-600"
                }`}
              />
              {domainMode === "CUSTOM"
                ? isCustomActive
                  ? "Selected as Primary Store Link"
                  : "Configuring Custom Domain Below"
                : "Click to Connect / Use Custom Domain"}
            </div>
          </button>
        </div>

        {/* Custom Domain Setup Panel (shown when CUSTOM mode selected or when a custom domain is configured) */}
        {(domainMode === "CUSTOM" || savedCustomDomain) && (
          <div className="mt-5 rounded-2xl border border-violet-200/80 bg-white p-4 sm:p-5 shadow-xs dark:border-violet-500/25 dark:bg-[#0b1324]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Cloud className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Custom Domain Connection
                </h3>
              </div>
              {domainVerifiedAt && domainStatus === "ACTIVE" && (
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                  Verified on {new Date(domainVerifiedAt).toLocaleDateString()}
                </span>
              )}
            </div>

            {domainMsg && (
              <div
                className={`mt-3 rounded-xl p-3 text-xs font-medium ${
                  domainMsg.kind === "ok"
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-950/30 dark:text-emerald-300"
                    : "border border-red-200 bg-red-50 text-red-800 dark:border-red-800/40 dark:bg-red-950/30 dark:text-red-300"
                }`}
              >
                {domainMsg.text}
              </div>
            )}

            {!domainMsg && domainError && domainStatus !== "ACTIVE" && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-900 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-300">
                {domainError}
              </div>
            )}

            <form onSubmit={saveCustomDomain} className="mt-3 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Your Custom Domain Name
                </label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="flex min-h-10 flex-1 items-stretch overflow-hidden rounded-lg border border-slate-300 focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-500 dark:border-slate-700">
                    <span className="flex items-center bg-slate-100 px-3 text-xs font-medium text-slate-500 select-none dark:bg-slate-800 dark:text-slate-400">
                      https://
                    </span>
                    <input
                      type="text"
                      value={customDomainInput}
                      onChange={(e) => {
                        setCustomDomainInput(e.target.value);
                        if (domainMsg) setDomainMsg(null);
                      }}
                      placeholder="e.g. kofibundles.com or shop.kofidata.com"
                      className="flex-1 bg-transparent px-3 py-2 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-white dark:placeholder:text-slate-500"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="submit"
                      disabled={domainBusy || verifyBusy || !customDomainInput.trim()}
                      className="inline-flex h-10 items-center justify-center rounded-lg bg-violet-600 px-4 text-xs font-semibold text-white shadow-xs transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {domainBusy ? (
                        <>
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          Saving…
                        </>
                      ) : (
                        "Save Domain"
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={verifyCustomDomain}
                      disabled={verifyBusy || domainBusy || !(customDomainInput.trim() || savedCustomDomain)}
                      className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {verifyBusy ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Verifying DNS…
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-3.5 w-3.5" />
                          Verify &amp; Activate
                        </>
                      )}
                    </button>
                    {savedCustomDomain && (
                      <button
                        type="button"
                        onClick={disconnectCustomDomain}
                        disabled={domainBusy || verifyBusy}
                        title="Disconnect custom domain"
                        className="inline-flex h-10 items-center justify-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 transition hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Enter your domain without <code className="font-mono">https://</code> or <code className="font-mono">www.</code> (both <code className="font-mono">{customDomainInput.trim() || "yourdomain.com"}</code> and <code className="font-mono">www.{customDomainInput.trim() || "yourdomain.com"}</code> will work automatically).
                </p>
              </div>
            </form>

            {/* Required DNS Records Box */}
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  Required DNS Records (Add in Cloudflare or Your Registrar)
                </p>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                  Cloudflare Proxy: ON (Orange Cloud ☁️)
                </span>
              </div>

              <div className="mt-2.5 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      <th className="pb-2 pr-3">Type</th>
                      <th className="pb-2 pr-3">Name / Host</th>
                      <th className="pb-2 pr-3">Target / Value</th>
                      <th className="pb-2 pr-3">Proxy Status</th>
                      <th className="pb-2 text-right">Copy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70 font-mono dark:divide-slate-800">
                    <tr>
                      <td className="py-2 pr-3 font-bold text-sky-600 dark:text-sky-400">A</td>
                      <td className="py-2 pr-3 font-bold text-slate-900 dark:text-white">@</td>
                      <td className="py-2 pr-3 text-emerald-700 dark:text-emerald-300">{serverIpTarget}</td>
                      <td className="py-2 pr-3 font-sans text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                        Proxied (Orange Cloud)
                      </td>
                      <td className="py-2 text-right font-sans">
                        <button
                          type="button"
                          onClick={() => copyText(serverIpTarget, "a-root")}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          {copiedField === "a-root" ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                          {copiedField === "a-root" ? "Copied" : "Copy IP"}
                        </button>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-3 font-bold text-sky-600 dark:text-sky-400">A</td>
                      <td className="py-2 pr-3 font-bold text-slate-900 dark:text-white">www</td>
                      <td className="py-2 pr-3 text-emerald-700 dark:text-emerald-300">{serverIpTarget}</td>
                      <td className="py-2 pr-3 font-sans text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                        Proxied (Orange Cloud)
                      </td>
                      <td className="py-2 text-right font-sans">
                        <button
                          type="button"
                          onClick={() => copyText(serverIpTarget, "a-www")}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          {copiedField === "a-www" ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                          {copiedField === "a-www" ? "Copied" : "Copy IP"}
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Step-by-Step Interactive Walkthrough + PDF Download */}
            <div className="mt-4 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0d1526]">
              <button
                type="button"
                onClick={() => setGuideOpen((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-bold text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-white/5 rounded-xl transition"
              >
                <span className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  Step-by-Step Guide: How to Buy &amp; Connect Your Domain via Cloudflare
                </span>
                {guideOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              {guideOpen && (
                <div className="border-t border-slate-100 px-4 pb-4 pt-3 text-xs text-slate-600 space-y-3 dark:border-slate-800 dark:text-slate-300">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg bg-slate-50 p-3 dark:bg-white/5">
                      <p className="font-bold text-slate-900 dark:text-white">
                        1. Get a Domain on Cloudflare (or Any Registrar)
                      </p>
                      <p className="mt-1 leading-relaxed">
                        Create a free account at{" "}
                        <a
                          href="https://dash.cloudflare.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-violet-600 underline dark:text-violet-400"
                        >
                          dash.cloudflare.com
                        </a>
                        . Go to <strong>Domain Registration → Register Domains</strong> to buy a domain at wholesale price, OR click <strong>Add a Domain</strong> if you already bought one on Namecheap/GoDaddy.
                      </p>
                    </div>

                    <div className="rounded-lg bg-slate-50 p-3 dark:bg-white/5">
                      <p className="font-bold text-slate-900 dark:text-white">
                        2. Add the Two A Records in DNS
                      </p>
                      <p className="mt-1 leading-relaxed">
                        In Cloudflare, open <strong>DNS → Records</strong>. Add an <code className="font-mono font-bold">A</code> record for <code className="font-mono font-bold">@</code> pointing to <code className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{serverIpTarget}</code> and a second <code className="font-mono font-bold">A</code> record for <code className="font-mono font-bold">www</code> also pointing to <code className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{serverIpTarget}</code>. Keep <strong>Proxy status: Proxied (Orange Cloud)</strong> ON for both.
                      </p>
                    </div>

                    <div className="rounded-lg bg-slate-50 p-3 dark:bg-white/5">
                      <p className="font-bold text-slate-900 dark:text-white">
                        3. Set Cloudflare SSL/TLS Mode to &ldquo;Full&rdquo;
                      </p>
                      <p className="mt-1 leading-relaxed">
                        In Cloudflare left menu, click <strong>SSL/TLS → Overview</strong> and set encryption mode to <strong>Full</strong> (do not use Flexible). Under <strong>SSL/TLS → Edge Certificates</strong>, turn ON <strong>Always Use HTTPS</strong>.
                      </p>
                    </div>

                    <div className="rounded-lg bg-slate-50 p-3 dark:bg-white/5">
                      <p className="font-bold text-slate-900 dark:text-white">
                        4. Click &ldquo;Verify &amp; Activate&rdquo; Above
                      </p>
                      <p className="mt-1 leading-relaxed">
                        Enter your domain above, click <strong>Save Domain</strong>, then click <strong>Verify &amp; Activate</strong>. Your custom domain will go live immediately with full Mobile Money checkout &amp; order tracking!
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-200/70 bg-violet-50/60 p-3 dark:border-violet-800/40 dark:bg-violet-950/25">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
                      <span>
                        Want an offline copy of these instructions personalized with your store details?
                      </span>
                    </div>
                    <a
                      href={pdfGuideHref}
                      download
                      className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-violet-500"
                    >
                      <FileDown className="h-3.5 w-3.5" />
                      Export Setup Guide to PDF
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Default Store Slug Editor */}
        {slugMsg && (
          <div
            className={`mt-4 rounded-xl p-3 text-xs font-medium ${
              slugMsg.kind === "ok"
                ? "border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-950/30 dark:text-emerald-300"
                : "border border-red-200 bg-red-50 text-red-800 dark:border-red-800/40 dark:bg-red-950/30 dark:text-red-300"
            }`}
          >
            {slugMsg.text}
          </div>
        )}

        <form onSubmit={saveSlug} className="mt-4 space-y-3 border-t border-slate-200/70 pt-4 dark:border-slate-800">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Customize Default Storefront Slug ({cleanDomain}/{currentSlug})
            </label>
            <div className="flex flex-col sm:flex-row sm:items-center">
              <div className="flex min-h-10 flex-1 items-stretch overflow-hidden rounded-lg border border-slate-300 focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-500 dark:border-slate-700">
                <span className="flex items-center bg-slate-100 px-3 text-xs font-medium text-slate-500 select-none dark:bg-slate-800 dark:text-slate-400">
                  https://{cleanDomain}/
                </span>
                <input
                  type="text"
                  value={slugInput}
                  onChange={handleSlugChange}
                  placeholder="e.g. kofi-bundles"
                  maxLength={32}
                  className="flex-1 bg-transparent px-3 py-2 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-white dark:placeholder:text-slate-500"
                />
              </div>
              <button
                type="submit"
                disabled={slugBusy || slugInput.trim() === currentSlug || slugInput.trim().length < 3}
                className="mt-2 sm:mt-0 sm:ml-3 inline-flex h-10 items-center justify-center rounded-lg bg-violet-600 px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {slugBusy ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Updating…
                  </>
                ) : (
                  "Update Slug"
                )}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-500 dark:text-slate-400">
              <span>Allowed: 3–32 characters (lowercase letters, numbers, and hyphens).</span>
              <span className="font-mono text-slate-400 dark:text-slate-500">
                Preview: {previewStoreUrl}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-amber-200/70 bg-amber-50/70 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p>
              <strong>Notice:</strong> Your default address (<code className="font-mono">{cleanDomain}/{currentSlug}</code>) always stays active even when you connect a custom domain. Changing the slug updates the default link immediately.
            </p>
          </div>
        </form>
      </div>

      {msg && (
        <p className={`rounded-lg px-3 py-2 text-sm ${msg.kind === "ok" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"}`}>
          {msg.text}
        </p>
      )}

      <form onSubmit={saveProfile} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0d1526]">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Store profile</h2>
        <input value={form.name} onChange={set("name")} placeholder="Store name" required className={inputCls} />
        <textarea
          value={form.description}
          onChange={set("description")}
          placeholder="Short description shown on your public store"
          rows={3}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-transparent dark:text-slate-100 dark:placeholder:text-slate-500"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Contact Number</label>
            <input value={form.phone} onChange={set("phone")} placeholder="Primary contact e.g. 0241234567" inputMode="tel" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">WhatsApp Group Link</label>
            <input value={form.whatsappGroupLink} onChange={set("whatsappGroupLink")} placeholder="https://chat.whatsapp.com/..." className={inputCls} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Support WhatsApp Number</label>
            <input value={form.whatsapp} onChange={set("whatsapp")} placeholder="WhatsApp support e.g. 0241234567" inputMode="tel" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Location (optional)</label>
            <input value={form.location} onChange={set("location")} placeholder="e.g. Accra, Ghana" className={inputCls} />
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
            Contact bubble (shown on your store)
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Bubble message</label>
              <input
                value={form.contactText}
                onChange={set("contactText")}
                placeholder="Need help? Chat with us on WhatsApp"
                maxLength={120}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Button label</label>
              <input
                value={form.whatsappLabel}
                onChange={set("whatsappLabel")}
                placeholder="Need help?"
                maxLength={40}
                className={inputCls}
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            A floating WhatsApp button appears on your store using these texts. Leave empty for defaults.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                Notification Banner (Storefront Announcement)
              </h3>
            </div>
            {form.notice && (
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, notice: "" }))}
                className="text-xs font-medium text-violet-600 hover:text-violet-700 hover:underline dark:text-violet-400 dark:hover:text-violet-300"
              >
                Reset to Default
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            A scrolling announcement banner displayed at the top of your public storefront page.
          </p>

          <div className="mt-3 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Banner Notice Text ({form.notice.length}/300)
              </label>
              <input
                value={form.notice}
                onChange={set("notice")}
                maxLength={300}
                placeholder="🔥 Secure MoMo checkout — bundles delivered to any number, reliably."
                className={inputCls}
              />
            </div>

            {/* Live Preview */}
            <div>
              <span className="mb-1.5 block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Live Preview
              </span>
              <div className="relative overflow-hidden rounded-lg bg-slate-950 px-4 py-2.5 shadow-inner">
                <div className="flex items-center justify-center gap-2 text-xs font-medium text-white">
                  <span className="rounded-full bg-yellow-400/20 border border-yellow-400/40 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-yellow-300 shrink-0">
                    Notice
                  </span>
                  <span className="truncate">
                    {form.notice.trim() || "🔥 Secure MoMo checkout — bundles delivered to any number, reliably."}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Templates */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Quick Templates
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "🔥 Secure MoMo checkout — bundles delivered to any number, reliably.",
                  "⚡ Instant delivery 24/7! Fast and reliable data bundle processing.",
                  "🎉 Promo active! Enjoy discounted rates across all bundles today.",
                  "⚠️ Network notice: Telecel bundle processing is currently slower than usual.",
                  "📞 Need quick support? Chat with us directly on WhatsApp for help!",
                ].map((tmpl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, notice: tmpl }))}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left text-xs text-slate-700 shadow-xs hover:border-violet-300 hover:bg-violet-50/50 hover:text-violet-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-violet-500/50 dark:hover:bg-violet-950/30 dark:hover:text-violet-200 transition-colors"
                  >
                    {tmpl}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <button type="submit" disabled={busy} className="h-10 rounded-lg bg-violet-600 px-5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50">
          Save profile
        </button>
      </form>

      <form onSubmit={savePayout} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0d1526]">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Default MoMo payout account</h2>
        <p className="text-xs text-slate-500">Pre-filled when you request withdrawals.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <select value={form.payoutNetwork} onChange={set("payoutNetwork")} className={`${inputCls} dark:bg-[#0d1526]`}>
            <option value="MTN">MTN MoMo</option>
            <option value="TELECEL">Telecel Cash</option>
            <option value="AIRTELTIGO">AirtelTigo Money</option>
          </select>
          <input value={form.payoutNumber} onChange={set("payoutNumber")} placeholder="MoMo number e.g. 0241234567" inputMode="tel" className={inputCls} />
        </div>
        <input value={form.payoutAccountName} onChange={set("payoutAccountName")} placeholder="Account name" className={inputCls} />
        <button type="submit" disabled={busy} className="h-10 rounded-lg bg-violet-600 px-5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50">
          Save payout account
        </button>
      </form>
    </div>
  );
}
