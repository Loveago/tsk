"use client";

import * as React from "react";
import {
  Clock,
  CheckCircle2,
  Wifi,
  ShieldCheck,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RecentOrderDelivery {
  id: number;
  reference: string;
  gbAmount: number;
  durationMinutes: number;
  durationFormatted: string;
  placedAtFormatted: string;
  deliveredAtFormatted: string;
  completedAt: string;
}

interface DeliverySpeedData {
  enabled?: boolean;
  network: string;
  networkDisplayName: string;
  headline: string;
  statusSubtitle: string;
  estimatedWaitMinutes: number;
  estimatedWaitFormatted: string;
  statusLevel: "FAST" | "NORMAL" | "BUSY";
  adminNotice: string | null;
  recentDelivered: RecentOrderDelivery[];
}

export function LiveDeliverySpeedCard({ network }: { network: string }) {
  const [data, setData] = React.useState<DeliverySpeedData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [helpOpen, setHelpOpen] = React.useState(false);

  const fetchSpeed = React.useCallback(async (net: string) => {
    try {
      const res = await fetch(`/api/orders/delivery-speed?network=${encodeURIComponent(net)}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchSpeed(network);
    const interval = setInterval(() => {
      fetchSpeed(network);
    }, 45000);
    return () => clearInterval(interval);
  }, [network, fetchSpeed]);

  if (loading && !data) {
    return (
      <div className="animate-pulse rounded-2xl border border-slate-200/70 bg-white/60 p-3.5 dark:border-white/5 dark:bg-[#0d1526]/60">
        <div className="h-3 w-1/3 rounded bg-slate-200 dark:bg-white/10" />
        <div className="mt-2 h-2.5 w-1/2 rounded bg-slate-200 dark:bg-white/10" />
      </div>
    );
  }

  if (!data || data.enabled === false) return null;

  const isMtn = data.network.toUpperCase() === "MTN";
  const isTelecel = data.network.toUpperCase() === "TELECEL";

  const accentColor = isMtn
    ? "text-amber-500 dark:text-amber-400"
    : isTelecel
    ? "text-red-600 dark:text-red-400"
    : "text-cyan-600 dark:text-cyan-400";

  const cardBorder = isMtn
    ? "border-amber-500/20 dark:border-amber-500/15"
    : isTelecel
    ? "border-red-500/20 dark:border-red-500/15"
    : "border-cyan-500/20 dark:border-cyan-500/15";

  return (
    <>
      <div
        className={cn(
          "rounded-2xl border bg-white/90 p-3.5 sm:p-4 shadow-sm transition-all dark:bg-[#0d1526]/90 dark:border-white/10 text-xs",
          cardBorder
        )}
      >
        {/* Header bar: Tracker status + Est Turnaround badge */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="relative flex h-2 w-2 shrink-0">
              <span
                className={cn(
                  "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                  data.statusLevel === "FAST"
                    ? "bg-emerald-400"
                    : data.statusLevel === "BUSY"
                    ? "bg-amber-400"
                    : "bg-blue-400"
                )}
              />
              <span
                className={cn(
                  "relative inline-flex h-2 w-2 rounded-full",
                  data.statusLevel === "FAST"
                    ? "bg-emerald-500"
                    : data.statusLevel === "BUSY"
                    ? "bg-amber-500"
                    : "bg-blue-500"
                )}
              />
            </span>
            <span className="font-bold text-slate-700 dark:text-slate-200 truncate">
              {data.networkDisplayName} Live Delivery
            </span>
            <span className="hidden sm:inline text-slate-300 dark:text-slate-600">·</span>
            <span className="hidden sm:inline text-slate-500 dark:text-slate-400 truncate">
              new orders within ~{data.estimatedWaitFormatted}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                data.statusLevel === "FAST"
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                  : data.statusLevel === "BUSY"
                  ? "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-400"
                  : "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400"
              )}
            >
              <Clock className="h-3 w-3" />
              ~{data.estimatedWaitFormatted} wait
            </span>
          </div>
        </div>

        {/* Status subtext & info link */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="sm:hidden font-medium text-slate-600 dark:text-slate-300">
            New orders within ~{data.estimatedWaitFormatted}.
          </span>
          <span>{data.statusSubtitle}</span>
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="font-medium text-brand-600 hover:underline dark:text-blue-400"
          >
            Why do delivery times vary? →
          </button>
        </div>

        {/* Compact Recent Delivered Proof list */}
        {data.recentDelivered.length > 0 && (
          <div className="mt-2.5 space-y-1.5">
            {data.recentDelivered.map((item, idx) => {
              const isFirst = idx === 0;
              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 rounded-xl px-3 py-1.5 border text-[11px] transition-all",
                    isFirst
                      ? "border-emerald-500/20 bg-emerald-50/40 dark:border-emerald-500/15 dark:bg-emerald-500/5"
                      : "border-slate-100 bg-slate-50/50 dark:border-white/5 dark:bg-white/5"
                  )}
                >
                  <div className="flex items-center gap-1.5 font-medium">
                    <CheckCircle2
                      className={cn(
                        "h-3 w-3 shrink-0",
                        isFirst ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"
                      )}
                    />
                    <span
                      className={cn(
                        "font-semibold",
                        isFirst
                          ? "text-emerald-700 dark:text-emerald-300"
                          : "text-slate-700 dark:text-slate-300"
                      )}
                    >
                      {isFirst ? "Last Delivered" : "Recent"} · {item.durationFormatted}
                    </span>
                    <span className="text-slate-400 dark:text-slate-500">
                      ({item.gbAmount} GB)
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-2 text-[10.5px] font-mono text-slate-500 dark:text-slate-400">
                    <span>placed {item.placedAtFormatted}</span>
                    <span className="text-slate-300 dark:text-slate-600">→</span>
                    <span
                      className={cn(
                        "font-semibold",
                        isFirst
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-slate-600 dark:text-slate-300"
                      )}
                    >
                      delivered {item.deliveredAtFormatted}
                    </span>
                    <span className="rounded bg-slate-200/60 px-1.5 py-0.2 text-[10px] font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                      {item.reference}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* "Why does my bundle sometimes delay?" Modal Dialog */}
      <Dialog
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="Why Does Bundle Delivery Time Vary?"
        description="Learn how automated telecommunication carrier queues work."
        className="max-w-md"
      >
        <div className="space-y-4 p-4 sm:p-5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          <div className="flex items-start gap-3 rounded-xl bg-blue-50/70 p-3 dark:bg-blue-500/10 text-blue-900 dark:text-blue-200">
            <Wifi className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div>
              <p className="font-bold text-xs">Direct Telco Carrier Processing</p>
              <p className="mt-0.5 text-[11px] text-blue-800/80 dark:text-blue-300/90 leading-normal">
                When an order is placed, it is transmitted straight to the network provider gateway (MTN, Telecel, or AT). Turnaround speeds fluctuate based on the carrier's real-time traffic volume.
              </p>
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-start gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 font-bold text-[10px] text-slate-700 dark:bg-white/10 dark:text-slate-300">
                1
              </span>
              <div>
                <p className="font-semibold text-slate-800 dark:text-slate-100">Peak Hours & System Volume</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Evenings, public holidays, and weekend hours witness heavy carrier traffic in Ghana, which can add slight queue delays.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 font-bold text-[10px] text-slate-700 dark:bg-white/10 dark:text-slate-300">
                2
              </span>
              <div>
                <p className="font-semibold text-slate-800 dark:text-slate-100">Active Verification Protection</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Recipient SIM numbers are checked against carrier whitelist records to prevent sending bundles to invalid, blocked, or inactive SIMs.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 font-bold text-[10px] text-slate-700 dark:bg-white/10 dark:text-slate-300">
                3
              </span>
              <div>
                <p className="font-semibold text-slate-800 dark:text-slate-100">Automatic Status Synchronization</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Our system polls telco delivery receipts continuously. Once delivered by the carrier, your order status turns green automatically.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-500/20 bg-emerald-50/50 p-3 text-[11px] text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>
              <strong>100% Wallet Protection:</strong> If any order permanently fails on the carrier network, your wallet balance is immediately protected and refunded.
            </span>
          </div>

          <div className="pt-2 flex justify-end">
            <Button
              size="sm"
              onClick={() => setHelpOpen(false)}
              className="h-8.5 text-xs bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
            >
              Got it
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
