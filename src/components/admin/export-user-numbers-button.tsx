"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Phone, FileText, FileSpreadsheet, FileCode, ChevronDown } from "lucide-react";

export function ExportUserNumbersButton() {
  const [open, setOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const handleExport = (format: "txt" | "csv" | "xlsx") => {
    window.open(`/api/admin/users/export-numbers?format=${format}`, "_blank");
    setOpen(false);
  };

  return (
    <div className="relative inline-block" ref={menuRef}>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen((prev) => !prev)}
        className="gap-1.5 border-emerald-300 bg-emerald-50/70 text-emerald-900 hover:bg-emerald-100 dark:border-emerald-700/50 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/50 cursor-pointer font-medium"
        title="Export all registered users phone numbers for Bulk SMS or records"
      >
        <Phone className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
        <span>Export Numbers</span>
        <ChevronDown className="h-3 w-3 text-emerald-600 dark:text-emerald-400 opacity-80" />
      </Button>

      {open && (
        <div className="absolute right-0 z-50 mt-1.5 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-800 dark:bg-slate-900 animate-in fade-in-50 zoom-in-95">
          <div className="px-2 py-1.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Export All User Numbers
          </div>
          <button
            type="button"
            onClick={() => handleExport("txt")}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 transition cursor-pointer text-left"
          >
            <FileText className="h-4 w-4 text-brand-600 shrink-0" />
            <div>
              <div className="font-semibold text-slate-900 dark:text-white">TXT (Bulk SMS)</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">One clean phone number per line</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => handleExport("xlsx")}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 transition cursor-pointer text-left"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600 shrink-0" />
            <div>
              <div className="font-semibold text-slate-900 dark:text-white">Excel Workbook (.xlsx)</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">With user names, emails & roles</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => handleExport("csv")}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 transition cursor-pointer text-left"
          >
            <FileCode className="h-4 w-4 text-sky-600 shrink-0" />
            <div>
              <div className="font-semibold text-slate-900 dark:text-white">CSV (.csv)</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">Standard comma-separated list</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
