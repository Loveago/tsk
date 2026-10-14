"use client";

import * as React from "react";
import { ExternalLink, X } from "lucide-react";

export function WhatsAppIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export interface WhatsAppChannelConfig {
  enabled: boolean;
  url: string;
  title?: string;
  description?: string;
  buttonText?: string;
}

const SESSION_STORAGE_KEY = "tsk_whatsapp_channel_dismissed_session";

export function WhatsAppChannelWidget({
  enabled,
  url,
  title = "Join our WhatsApp Channel",
  description = "Get real-time updates, network delivery speeds, and exclusive announcements directly on WhatsApp.",
  buttonText = "Join Channel",
  dismissible = true,
  className = "",
}: WhatsAppChannelConfig & { dismissible?: boolean; className?: string }) {
  const [dismissed, setDismissed] = React.useState(true);

  React.useEffect(() => {
    try {
      // Clear legacy localStorage key if present
      localStorage.removeItem("tsk_whatsapp_channel_dismissed_v1");
      const isDismissed = sessionStorage.getItem(SESSION_STORAGE_KEY) === "true";
      setDismissed(isDismissed);
    } catch {
      setDismissed(false);
    }
  }, [url]);

  if (!enabled || !url || (dismissible && dismissed)) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, "true");
    } catch {}
  };

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-emerald-500/10 p-4 sm:p-5 shadow-xs transition-all dark:border-emerald-500/30 dark:bg-gradient-to-r dark:from-emerald-950/30 dark:via-teal-950/20 dark:to-emerald-950/30 ${className}`}
      role="complementary"
      aria-label="WhatsApp Channel Banner"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md shadow-emerald-600/30">
            <WhatsAppIcon className="h-6 w-6 fill-current" />
            <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border-2 border-white dark:border-[#0d1526]"></span>
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                Official Channel
              </span>
              <span className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 font-medium">WhatsApp</span>
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate mt-0.5">
              {title || "Join our WhatsApp Channel"}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 mt-0.5">
              {description || "Stay updated with real-time network speeds and service announcements."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center shrink-0 w-full sm:w-auto justify-end">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 hover:shadow-md active:scale-95 cursor-pointer w-full sm:w-auto"
          >
            <WhatsAppIcon className="h-4 w-4 fill-current" />
            <span>{buttonText || "Join Channel"}</span>
            <ExternalLink className="h-3.5 w-3.5 opacity-80" />
          </a>

          {dismissible && (
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Dismiss banner"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/50 hover:text-slate-600 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200 transition cursor-pointer"
              title="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function WhatsAppChannelFloatingButton({
  enabled,
  url,
  title = "Join our WhatsApp Channel",
}: {
  enabled: boolean;
  url: string;
  title?: string;
}) {
  if (!enabled || !url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={title || "Join WhatsApp Channel"}
      title={title || "Join our WhatsApp Channel"}
      className="fixed bottom-20 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 transition hover:scale-105 hover:bg-emerald-500 active:scale-95 cursor-pointer"
    >
      <WhatsAppIcon className="h-6 w-6 fill-current" />
      <span className="sr-only">{title || "Join WhatsApp Channel"}</span>
    </a>
  );
}
