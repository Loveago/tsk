"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

/** Right-side drawer panel, styled consistently with the Dialog primitive. */
export function Sheet({ open, onClose, title, description, children, footer, className }: SheetProps) {
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
    <div className="fixed inset-0 z-50">
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "fixed inset-y-0 right-0 z-10 flex w-full max-w-2xl flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0d1526]",
          className
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5 dark:border-white/5">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold leading-none">{title}</h2>}
            {description && (
              <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>
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
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && (
          <div className="border-t border-slate-100 p-4 dark:border-white/5">{footer}</div>
        )}
      </div>
    </div>
  );
}