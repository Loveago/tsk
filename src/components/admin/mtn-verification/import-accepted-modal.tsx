"use client";

import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/shared";
import { useToast } from "@/components/toast";
import { UploadCloud, FileText, CheckCircle2, AlertTriangle, XCircle, Download, Copy } from "lucide-react";

interface ImportAcceptedModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface PreviewData {
  filename: string;
  totalRows: number;
  validNumbers: string[];
  duplicateCount: number;
  duplicates: string[];
  alreadyAcceptedCount: number;
  alreadyAccepted: string[];
  invalidCount: number;
  invalid: { line: number; raw: string; reason: string }[];
}

export function ImportAcceptedModal({
  open,
  onClose,
  onSuccess,
}: ImportAcceptedModalProps) {
  const { toast } = useToast();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [preview, setPreview] = React.useState<PreviewData | null>(null);
  const [dragActive, setDragActive] = React.useState(false);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setLoading(false);
    setImporting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileChange = async (selectedFile: File) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetch("/api/admin/mtn-verification/accepted/import/preview", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to parse file");

      setPreview(data);
    } catch (err: any) {
      toast(err.message ?? "Error parsing file", "error");
      setFile(null);
      setPreview(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleConfirmImport = async () => {
    if (!preview || preview.validNumbers.length === 0) return;
    setImporting(true);

    try {
      const isCsv = preview.filename.toLowerCase().endsWith(".csv");
      const res = await fetch("/api/admin/mtn-verification/accepted/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numbers: preview.validNumbers,
          source: isCsv ? "IMPORT_CSV" : "IMPORT_TXT",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");

      toast(`Successfully imported ${data.imported} MTN numbers!`, "success");
      onSuccess();
      handleClose();
    } catch (err: any) {
      toast(err.message ?? "Import error", "error");
    } finally {
      setImporting(false);
    }
  };

  const downloadErrorReport = () => {
    if (!preview) return;
    const lines: string[] = ["Type,Line,Raw Value,Reason"];

    preview.invalid.forEach((item) => {
      lines.push(`"INVALID",${item.line},"${item.raw}","${item.reason}"`);
    });
    preview.duplicates.forEach((num) => {
      lines.push(`"DUPLICATE_IN_FILE",,"${num}","Duplicate entry in upload file"`);
    });
    preview.alreadyAccepted.forEach((num) => {
      lines.push(`"ALREADY_ACCEPTED",,"${num}","Number is already accepted in database"`);
    });

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `import-errors-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Import Accepted MTN Numbers"
      description="Upload a TXT or CSV file containing verified MTN phone numbers."
      className="max-w-xl"
    >
      <div className="space-y-4">
        {!preview && !loading && (
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition ${
              dragActive
                ? "border-brand-500 bg-brand-50/50 dark:bg-brand-500/10"
                : "border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.csv"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) handleFileChange(e.target.files[0]);
              }}
            />
            <div className="rounded-full bg-brand-50 p-3 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
              <UploadCloud className="h-6 w-6" />
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-200">
              Drag &amp; drop your file here, or click to browse
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Supported formats: TXT (one number per line) or CSV with a &quot;number&quot; header (max 10MB)
            </p>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Spinner className="h-7 w-7 text-brand-600" />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Validating phone numbers in {file?.name}...
            </p>
          </div>
        )}

        {preview && !loading && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-500" />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {preview.filename}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                onClick={() => {
                  setPreview(null);
                  setFile(null);
                }}
              >
                Change File
              </Button>
            </div>

            {/* Validation Breakdown */}
            <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Import Preview Results
              </h3>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <div className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/50">
                  <p className="text-slate-500">Total Rows</p>
                  <p className="mt-0.5 text-base font-bold text-slate-800 dark:text-white">
                    {preview.totalRows.toLocaleString()}
                  </p>
                </div>

                <div className="rounded-lg bg-emerald-50 p-2.5 dark:bg-emerald-500/10">
                  <p className="text-emerald-700 dark:text-emerald-400 font-medium">Valid Numbers</p>
                  <p className="mt-0.5 text-base font-bold text-emerald-700 dark:text-emerald-300">
                    {preview.validNumbers.length.toLocaleString()}
                  </p>
                </div>

                <div className="rounded-lg bg-amber-50 p-2.5 dark:bg-amber-500/10">
                  <p className="text-amber-700 dark:text-amber-400 font-medium">Already Accepted</p>
                  <p className="mt-0.5 text-base font-bold text-amber-700 dark:text-amber-300">
                    {preview.alreadyAcceptedCount.toLocaleString()}
                  </p>
                </div>

                <div className="rounded-lg bg-red-50 p-2.5 dark:bg-red-500/10">
                  <p className="text-red-700 dark:text-red-400 font-medium">Duplicates / Invalid</p>
                  <p className="mt-0.5 text-base font-bold text-red-700 dark:text-red-300">
                    {(preview.duplicateCount + preview.invalidCount).toLocaleString()}
                  </p>
                </div>
              </div>

              {(preview.duplicateCount > 0 || preview.alreadyAcceptedCount > 0 || preview.invalidCount > 0) && (
                <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>
                      {preview.invalidCount} invalid, {preview.duplicateCount} duplicate in file, {preview.alreadyAcceptedCount} already verified
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={downloadErrorReport}
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Error Report
                  </Button>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" onClick={handleClose} disabled={importing}>
                Cancel
              </Button>
              <Button
                onClick={handleConfirmImport}
                disabled={importing || preview.validNumbers.length === 0}
              >
                {importing && <Spinner className="h-4 w-4 mr-1.5" />}
                Import {preview.validNumbers.length.toLocaleString()} Valid Numbers
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
