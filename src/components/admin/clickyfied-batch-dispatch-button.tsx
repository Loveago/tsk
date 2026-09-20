"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/toast";
import {
  Layers,
  AlertTriangle,
  Send,
  RefreshCw,
  Clock,
  Gauge,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

interface BatchStatus {
  batchEnabled: boolean;
  pendingCount: number;
  totalGb: number;
  gbThreshold: number;
  timerMinutes: number;
  lastDispatchedAt: string | null;
  minutesElapsed: number;
  minutesRemaining: number;
  secondsRemaining: number;
  firstOrderAt: string | null;
  batchEnabled_?: boolean;
  clickyfiedEnabled: boolean;
  currentBatchCount: number;
  currentBatchGb: number;
  nextBatchCount: number;
  nextBatchGb: number;
  thresholdMet: boolean;
  timerExpired: boolean;
}

interface Props {
  onSuccess?: () => void;
  className?: string;
}

export function ClickyfiedBatchDispatchButton({ onSuccess, className = "" }: Props) {
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [dispatching, setDispatching] = React.useState(false);
  const [status, setStatus] = React.useState<BatchStatus | null>(null);
  const [countdownSec, setCountdownSec] = React.useState<number | null>(null);

  const fetchStatus = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/provider-apis/clickyfied-batch");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  React.useEffect(() => {
    if (!status || status.pendingCount === 0) {
      setCountdownSec(null);
    } else {
      setCountdownSec(status.secondsRemaining);
    }
  }, [status]);

  React.useEffect(() => {
    if (countdownSec === null || countdownSec <= 0) return;
    const interval = setInterval(() => {
      setCountdownSec((prev) => {
        if (prev === null || prev <= 1) {
          fetchStatus();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [countdownSec, fetchStatus]);

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const handleDispatch = async () => {
    if (!status || status.pendingCount === 0) return;
    try {
      setDispatching(true);
      const res = await fetch("/api/admin/provider-apis/clickyfied-batch", {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        toast(data.error || "Failed to dispatch batch", "error");
        return;
      }

      toast(
        data.message ||
          `Successfully dispatched ${data.dispatchedCount} MTN order(s) (${data.totalGb} GB) to Clickyfied.`,
        "success"
      );
      setModalOpen(false);
      await fetchStatus();
      onSuccess?.();
    } catch (err: any) {
      toast(err?.message || "Network error during batch dispatch", "error");
    } finally {
      setDispatching(false);
    }
  };

  const pendingCount = status?.pendingCount ?? 0;
  const totalGb = status?.totalGb ?? 0;
  const threshold = status?.gbThreshold ?? 100;
  const isReady = (status?.thresholdMet || status?.timerExpired) && pendingCount > 0;

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={() => {
          fetchStatus();
          setModalOpen(true);
        }}
        className={`relative inline-flex items-center gap-1.5 text-xs font-semibold shadow-sm transition ${
          pendingCount > 0
            ? isReady
              ? "bg-amber-600 hover:bg-amber-700 text-white animate-pulse"
              : "bg-brand-600 hover:bg-brand-700 text-white"
            : "bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/10"
        } ${className}`}
        title="View pending MTN batch queue and dispatch to Clickyfied"
      >
        <Layers className="h-3.5 w-3.5" />
        <span>MTN Clickyfied Batch</span>
        <span
          className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
            pendingCount > 0
              ? "bg-black/20 text-white"
              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
          }`}
        >
          {pendingCount} ({totalGb} GB)
        </span>
      </Button>

      <Dialog
        open={modalOpen}
        onClose={() => !dispatching && setModalOpen(false)}
        title={
          <div className="flex items-center gap-2 text-slate-900 dark:text-white">
            <Layers className="h-5 w-5 text-brand-600 dark:text-brand-400" />
            <span>Clickyfied MTN Batch Dispatch</span>
          </div>
        }
        className="max-w-lg"
      >
        <div className="space-y-4">
          {/* Warning Banner */}
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 dark:border-amber-500/30 dark:bg-amber-500/10 text-amber-900 dark:text-amber-300 text-xs leading-relaxed space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-amber-900 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>WARNING: Immediate Provider Dispatch</span>
            </div>
            <p>
              This action packages queued <strong>pending MTN orders</strong> into Clickyfied batches capped at <strong>{threshold} GB</strong> and up to 100 entries per submission.
            </p>
            <p className="text-[11px] opacity-90">
              Order status on Tskconnect will mirror Clickyfied (pending, processing, or processed).
            </p>
          </div>

          {/* Queue Statistics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Pending MTN Orders</div>
              <div className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
                {pendingCount}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Accumulated Volume</div>
              <div className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
                {totalGb} <span className="text-xs font-normal text-slate-500">/ {threshold} GB</span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5 col-span-2 sm:col-span-1">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>Timer Countdown</span>
              </div>
              <div className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
                {status ? (
                  status.pendingCount === 0 ? (
                    <span className="text-slate-500 font-normal text-xs">Waiting for orders</span>
                  ) : countdownSec !== null && countdownSec > 0 ? (
                    <span className="font-mono text-brand-600 dark:text-brand-400 font-semibold">
                      {formatCountdown(countdownSec)} left
                    </span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400 font-semibold">Dispatching...</span>
                  )
                ) : (
                  "..."
                )}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {status && status.pendingCount > 0
                  ? `${status.timerMinutes}m window from 1st order`
                  : `${status?.timerMinutes ?? 15}m batch timer window`}
              </div>
            </div>
          </div>

          {/* Current Batch vs Next Batch Overflow Breakdown */}
          {status && (status.nextBatchCount > 0 || status.currentBatchGb > 0) && (
            <div className="rounded-xl border border-slate-200 dark:border-white/10 p-3 bg-slate-50 dark:bg-white/5 text-xs space-y-1">
              <div className="flex items-center justify-between font-medium text-slate-800 dark:text-slate-200">
                <span>Current Batch (to dispatch):</span>
                <span className="font-semibold text-brand-600 dark:text-brand-400">
                  {status.currentBatchCount} order(s) • {status.currentBatchGb} GB
                </span>
              </div>
              {status.nextBatchCount > 0 && (
                <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200/60 dark:border-white/5">
                  <span>Rolled over into Next Batch:</span>
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    +{status.nextBatchCount} order(s) • {status.nextBatchGb} GB
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Progress towards 100 GB threshold */}
          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/5 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Gauge className="h-3.5 w-3.5 text-brand-600" />
                Current Batch Limit ({threshold} GB)
              </span>
              <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                {Math.min(100, Math.round(((status?.currentBatchGb ?? totalGb) / (threshold || 1)) * 100))}%
              </span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  (status?.currentBatchGb ?? totalGb) >= threshold ? "bg-emerald-500" : "bg-brand-600"
                }`}
                style={{
                  width: `${Math.min(
                    100,
                    Math.round(((status?.currentBatchGb ?? totalGb) / (threshold || 1)) * 100)
                  )}%`,
                }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-0.5">
              <span>Limit: max {threshold} GB per batch</span>
              <span>Chunk size: max 100 entries</span>
            </div>
          </div>

          {/* Empty state notice */}
          {pendingCount === 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-white/10 p-3 bg-slate-50 dark:bg-slate-800/40 text-center text-xs text-slate-500 dark:text-slate-400">
              There are currently no pending MTN orders waiting to be dispatched to Clickyfied.
            </div>
          )}

          {/* Dialog Action Buttons */}
          <div className="flex items-center justify-between pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={fetchStatus}
              disabled={loading || dispatching}
              className="gap-1.5 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh Status</span>
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalOpen(false)}
                disabled={dispatching}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleDispatch}
                disabled={pendingCount === 0 || dispatching}
                className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs"
              >
                {dispatching ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Dispatching Batch...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    <span>Confirm & Dispatch Batch</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </Dialog>
    </>
  );
}
