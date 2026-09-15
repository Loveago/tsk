"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function Dialog({ open, onClose, title, description, children, className }: DialogProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-hidden">
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-[#0d1526]",
          className
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 p-4 sm:p-5 dark:border-white/5">
          <div>
            {title && (
              <h2 className="text-base font-semibold leading-none">{title}</h2>
            )}
            {description && (
              <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                {description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}
