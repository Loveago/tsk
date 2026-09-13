"use client";

import * as React from "react";
import { Check, Copy, Share2 } from "lucide-react";

/** Copy-to-clipboard (and optional WhatsApp share) for the public store link. */
export function CopyShareButtons({ url, storeName }: { url: string; storeName: string }) {
  const [copied, setCopied] = React.useState(false);
  const [fullUrl, setFullUrl] = React.useState(url);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      if (url.startsWith("/")) {
        setFullUrl(`${window.location.origin}${url}`);
      } else {
        setFullUrl(url);
      }
    }
  }, [url]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(fullUrl);
    } catch {
      // Clipboard API can be unavailable (http/permissions) — still show feedback
      const ta = document.createElement("textarea");
      ta.value = fullUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const shareText = encodeURIComponent(
    `Shop data bundles at ${storeName} — fast delivery on all networks: ${fullUrl}`
  );


  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={copy}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/5"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copied!" : "Copy link"}
      </button>
      <a
        href={`https://wa.me/?text=${shareText}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-500"
      >
        <Share2 className="h-3.5 w-3.5" />
        Share on WhatsApp
      </a>
    </div>
  );
}
