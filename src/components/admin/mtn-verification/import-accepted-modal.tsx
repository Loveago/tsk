"use client";

import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/shared";
import { useToast } from "@/components/toast";
import { UploadCloud, FileText, CheckCircle2, AlertTriangle, XCircle, Download, Zap } from "lucide-react";

interface ImportAcceptedModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface PreviewData {
  sessionId?: string;
  filename: string;
  totalRows: number;
  validCount: number;
  validNumbers?: string[];
  portedCount?: number;
  samplePorted?: { number: string; network: string }[];
  duplicateCount: number;
  duplicates?: string[];
  alreadyAcceptedCount: number;
  alreadyAccepted?: string[];
  invalidCount: number;
  invalid?: { line: number; raw: string; reason: string }[];
  sampleValid?: string[];
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
  const [directImport, setDirectImport] = React.useState(false);

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
    if (selectedFile.size > 250 * 1024 * 1024) {
      toast("File size exceeds maximum limit of 250MB", "error");
      return;
    }
    setFile(selectedFile);
    setLoading(true);

    try {
      // Read file text directly in the browser. This allows sending clean JSON,
      // avoiding Node/undici multipart/form-data boundary parsing errors.
      let data: any;
      try {
        const content = await selectedFile.text();
        const res = await fetch("/api/admin/mtn-verification/accepted/import/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: selectedFile.name,
            content,
          }),
        });
        data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to parse file");
      } catch (jsonErr: any) {
        // Fallback: If JSON fails or file is too large for memory, try FormData with safe ASCII filename
        const safeFilename = selectedFile.name.replace(/[^\w.-]/g, "_");
        const formData = new FormData();
        formData.append("file", selectedFile, safeFilename);

        const res = await fetch("/api/admin/mtn-verification/accepted/import/preview", {
          method: "POST",
          body: formData,
        });
        data = await res.json();
        if (!res.ok) throw new Error(data.error ?? jsonErr.message ?? "Failed to parse file");
      }

      // If direct import is requested, immediately trigger confirm
      if (directImport) {
        if (data.validCount === 0) {
          throw new Error("No valid numbers found in the file to import");
        }
        setImporting(true);
        setLoading(false);

        const isCsv = selectedFile.name.toLowerCase().endsWith(".csv");
        const confirmRes = await fetch("/api/admin/mtn-verification/accepted/import/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: data.sessionId,
            source: isCsv ? "IMPORT_CSV" : "IMPORT_TXT",
          }),
        });
        const confirmData = await confirmRes.json();
        if (!confirmRes.ok) throw new Error(confirmData.error ?? "Direct import failed");

        const portedMsg = confirmData.portedCount ? ` (including ${confirmData.portedCount.toLocaleString()} ported numbers)` : "";
        const speed = confirmData.elapsedMs ? ` in ${(confirmData.elapsedMs / 1000).toFixed(1)}s` : "";
        toast(`Successfully imported ${confirmData.imported.toLocaleString()} MTN numbers${portedMsg}${speed}!`, "success");
        onSuccess();
        handleClose();
        return;
      }

      setPreview(data);
    } catch (err: any) {
      toast(err.message ?? "Error processing file", "error");
      setFile(null);
      setPreview(null);
    } finally {
      setLoading(false);
      setImporting(false);
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
    if (!preview || preview.validCount === 0) return;
    setImporting(true);

    try {
      const isCsv = preview.filename.toLowerCase().endsWith(".csv");
      const payload: any = {
        source: isCsv ? "IMPORT_CSV" : "IMPORT_TXT",
      };

      if (preview.sessionId) {
        payload.sessionId = preview.sessionId;
      } else if (preview.validNumbers && preview.validNumbers.length > 0) {
        payload.numbers = preview.validNumbers;
      }

      const res = await fetch("/api/admin/mtn-verification/accepted/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");

      const portedMsg = data.portedCount ? ` (including ${data.portedCount.toLocaleString()} ported numbers)` : "";
      const speedMsg = data.elapsedMs ? ` in ${(data.elapsedMs / 1000).toFixed(1)}s` : "";
      toast(`Successfully imported ${data.imported.toLocaleString()} MTN numbers${portedMsg}${speedMsg}!`, "success");
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
    if (preview.sessionId) {
      window.open(`/api/admin/mtn-verification/accepted/import/errors?sessionId=${encodeURIComponent(preview.sessionId)}`, "_blank");
      return;
    }

    const lines: string[] = ["Type,Line,Raw Value,Reason"];
    (preview.invalid ?? []).forEach((item) => {
      lines.push(`"INVALID",${item.line},"${item.raw}","${item.reason}"`);
    });
    (preview.duplicates ?? []).forEach((num) => {
      lines.push(`"DUPLICATE_IN_FILE",,"${num}","Duplicate entry in upload file"`);
    });
    (preview.alreadyAccepted ?? []).forEach((num) => {
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
      description="Upload large TXT or CSV files containing verified MTN phone numbers (up to 250MB)."
      className="max-w-xl"
    >
      <div className="space-y-4">
        {!preview && !loading && !importing && (
          <div className="space-y-3">
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
                Supported: TXT (1 number per line) or CSV (max 250MB, handles 100k+ to millions of numbers)
              </p>
            </div>

            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600 dark:text-slate-300 select-none">
              <input
                type="checkbox"
                checked={directImport}
                onChange={(e) => setDirectImport(e.target.checked)}
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 h-3.5 w-3.5"
              />
              <span className="flex items-center gap-1 font-medium">
                <Zap className="h-3.5 w-3.5 text-amber-500" />
                Fast 1-Step Ingestion (Skip preview, import directly into database)
              </span>
            </label>
          </div>
        )}

        {(loading || importing) && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <Spinner className="h-8 w-8 text-brand-600" />
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {importing
                ? "Writing numbers into database at high speed..."
                : `Parsing & validating phone numbers in ${file?.name}...`}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {file ? `${(file.size / (1024 * 1024)).toFixed(1)} MB file` : ""}
            </p>
          </div>
        )}

        {preview && !loading && !importing && (
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

            {/* Ported Numbers Notification Banner */}
            {typeof preview.portedCount === "number" && preview.portedCount > 0 && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/80 p-3.5 text-xs text-indigo-950 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-200">
                <div className="flex items-start gap-2.5">
                  <Zap className="h-4 w-4 mt-0.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <div className="space-y-1">
                    <p className="font-semibold text-indigo-950 dark:text-indigo-100">
                      Ported Numbers Detected ({preview.portedCount.toLocaleString()})
                    </p>
                    <p className="text-[11px] leading-relaxed text-indigo-700 dark:text-indigo-300">
                      {preview.portedCount.toLocaleString()} valid Ghanaian number(s) with non-MTN prefixes (Telecel / AirtelTigo) were detected. Because these numbers are ported to MTN, they are accepted and will be imported into the whitelist.
                    </p>
                    {preview.samplePorted && preview.samplePorted.length > 0 && (
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400">Samples:</span>
                        {preview.samplePorted.map((item) => (
                          <span
                            key={item.number}
                            className="inline-flex items-center rounded bg-white/90 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-indigo-800 shadow-sm ring-1 ring-inset ring-indigo-200 dark:bg-indigo-900/60 dark:text-indigo-200 dark:ring-indigo-700"
                          >
                            {item.number} ({item.network})
                          </span>
                        ))}
                        {preview.portedCount > preview.samplePorted.length && (
                          <span className="text-[10px] text-indigo-500 dark:text-indigo-400">
                            +{preview.portedCount - preview.samplePorted.length} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Validation Breakdown */}
            <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Import Preview Results
              </h3>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                <div className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/50">
                  <p className="text-slate-500">Total Rows</p>
                  <p className="mt-0.5 text-base font-bold text-slate-800 dark:text-white">
                    {preview.totalRows.toLocaleString()}
                  </p>
                </div>

                <div className="rounded-lg bg-emerald-50 p-2.5 dark:bg-emerald-500/10">
                  <p className="text-emerald-700 dark:text-emerald-400 font-medium">Valid Numbers</p>
                  <p className="mt-0.5 text-base font-bold text-emerald-700 dark:text-emerald-300">
                    {preview.validCount.toLocaleString()}
                  </p>
                </div>

                <div className="rounded-lg bg-indigo-50 p-2.5 dark:bg-indigo-500/10">
                  <p className="text-indigo-700 dark:text-indigo-400 font-medium">Ported Numbers</p>
                  <p className="mt-0.5 text-base font-bold text-indigo-700 dark:text-indigo-300">
                    {(preview.portedCount ?? 0).toLocaleString()}
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
                      {preview.invalidCount.toLocaleString()} invalid, {preview.duplicateCount.toLocaleString()} duplicates, {preview.alreadyAcceptedCount.toLocaleString()} already verified
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
                disabled={importing || preview.validCount === 0}
              >
                {importing && <Spinner className="h-4 w-4 mr-1.5" />}
                {importing
                  ? "Importing..."
                  : `Import ${preview.validCount.toLocaleString()} Valid Numbers`}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
