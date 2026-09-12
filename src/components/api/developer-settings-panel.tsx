"use client";

import * as React from "react";
import { Settings, Shield, Sliders, Lock, Key, ExternalLink } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";

interface DeveloperSettingsProps {
  application: any | null;
  onNavigateTab: (tab: string) => void;
}

export function DeveloperSettingsPanel({ application, onNavigateTab }: DeveloperSettingsProps) {
  const isApproved = application?.status === "APPROVED";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
          <div className="rounded-xl bg-blue-500/10 p-2.5 text-blue-600 dark:text-blue-400">
            <Settings className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-bold">Developer API Settings & Account Limits</h3>
            <p className="text-xs text-slate-500">
              Overview of your application permissions, production rate limits, and environment policies.
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Access Status</span>
              <StatusBadge status={application?.status || "NOT_APPLIED"} />
            </div>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
              {isApproved
                ? "Your account is authorized to issue live production requests."
                : "Submit or await review of your developer access application."}
            </p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Rate Limit</span>
              <span className="font-mono text-xs font-bold text-blue-600">
                {application?.rateLimitPerMin || 60} req/min
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
              Applies across active credentials. Requests exceeding this threshold receive HTTP 429.
            </p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Daily Order Quota</span>
              <span className="font-mono text-xs font-bold text-emerald-600">
                {(application?.dailyRequestLimit || 5000).toLocaleString()} req/day
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
              Default daily quota. Contact support or admin to request higher volume caps.
            </p>
          </div>
        </div>

        {/* Granted Scopes */}
        <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50/50 p-5 dark:border-slate-800 dark:bg-slate-800/40">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-blue-600" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              Assigned OAuth Scopes
            </h4>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(application?.allowedScopes || "networks:read,packages:read,orders:create,orders:read,orders:status,balance:read,webhooks:read,webhooks:manage")
              .split(",")
              .map((s: string) => (
                <span
                  key={s.trim()}
                  className="rounded-lg bg-white px-2.5 py-1 font-mono text-[11px] font-semibold text-slate-700 shadow-sm border border-slate-200/60 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300"
                >
                  {s.trim()}
                </span>
              ))}
          </div>
        </div>

        {/* IP Restrictions */}
        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/50 p-5 dark:border-slate-800 dark:bg-slate-800/40">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-amber-600" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              Server IP Whitelist
            </h4>
          </div>
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
            {application?.ipRestrictions
              ? `Restricted to originating IP addresses: ${application.ipRestrictions}`
              : "No IP restrictions currently enforced. Any server bearing your secret key can submit requests."}
          </p>
        </div>

        {/* Quick links */}
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5 dark:border-slate-800">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onNavigateTab("credentials")}
            className="gap-1.5 text-xs"
          >
            <Key className="h-3.5 w-3.5" /> Manage API Keys
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onNavigateTab("webhooks")}
            className="gap-1.5 text-xs"
          >
            Configure Webhook URL
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onNavigateTab("docs")}
            className="gap-1.5 text-xs"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Read Documentation
          </Button>
        </div>
      </div>
    </div>
  );
}
