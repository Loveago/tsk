"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Power, CheckCircle2, PauseCircle, Loader2 } from "lucide-react";

interface StoreStatusToggleProps {
  initialActive: boolean;
  storeStatus: string; // ENABLED | SUSPENDED | etc.
  variant?: "compact" | "card";
}

export function StoreStatusToggle({
  initialActive,
  storeStatus,
  variant = "compact",
}: StoreStatusToggleProps) {
  const router = useRouter();
  const [isActive, setIsActive] = React.useState(initialActive);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setIsActive(initialActive);
  }, [initialActive]);

  const isSuspended = storeStatus === "SUSPENDED";
  const canToggle = storeStatus === "ENABLED" && !isSuspended;

  async function handleToggle() {
    if (!canToggle || busy) return;
    const nextState = !isActive;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/storefront/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: nextState }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to update store status");
      }

      setIsActive(nextState);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (variant === "compact") {
    return (
      <div className="flex flex-col items-start sm:items-end gap-1">
        <button
          type="button"
          onClick={handleToggle}
          disabled={!canToggle || busy}
          className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all shadow-sm ${
            isActive
              ? "bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 border border-amber-300 dark:border-amber-500/30 dark:text-amber-300"
              : "bg-emerald-600 text-white hover:bg-emerald-500 shadow-emerald-600/20"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          title={
            !canToggle
              ? "Store is suspended by admin"
              : isActive
              ? "Click to temporarily pause your storefront"
              : "Click to re-enable your storefront"
          }
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : isActive ? (
            <PauseCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          ) : (
            <Power className="h-3.5 w-3.5" />
          )}
          <span>{isActive ? "Pause Storefront" : "Re-enable Storefront"}</span>
        </button>
        {error && <span className="text-[11px] text-red-600 dark:text-red-400">{error}</span>}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#0d1526]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span
              className={`flex h-3 w-3 rounded-full ${
                isSuspended
                  ? "bg-red-500 ring-4 ring-red-500/20"
                  : isActive
                  ? "bg-emerald-500 ring-4 ring-emerald-500/20 animate-pulse"
                  : "bg-amber-500 ring-4 ring-amber-500/20"
              }`}
            />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {isSuspended
                ? "Storefront Suspended by Admin"
                : isActive
                ? "Storefront is Open & Accepting Orders"
                : "Storefront is Paused (Disabled)"}
            </h2>
          </div>
          <p className="mt-1.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            {isSuspended
              ? "Your storefront has been suspended by administration. Contact support to resolve."
              : isActive
              ? "Customers can browse your public bundles and complete checkout via mobile money."
              : "Visitors will see that your store is taking a short break. New orders are temporarily paused."}
          </p>
        </div>

        <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
          <button
            type="button"
            onClick={handleToggle}
            disabled={!canToggle || busy}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold transition-all shadow-sm ${
              isActive
                ? "border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
                : "bg-emerald-600 text-white hover:bg-emerald-500 shadow-emerald-600/20"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isActive ? (
              <PauseCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            <span>{isActive ? "Pause Storefront" : "Re-enable Storefront"}</span>
          </button>
          {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
        </div>
      </div>
    </div>
  );
}
