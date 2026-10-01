"use client";

import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Spinner } from "@/components/shared";
import { useToast } from "@/components/toast";
import { Ban, ShieldAlert, ListPlus, Hash, FileSpreadsheet, UploadCloud, FileText } from "lucide-react";
import {
  normalizeGhanaPhoneNumber,
  isValidGhanaPhoneNumber,
  detectNetworkNameByPrefix,
} from "@/lib/phone-utils";

interface AddBlockedNumberModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialPhoneNumber?: string;
}

export function AddBlockedNumberModal({
  open,
  onClose,
  onSuccess,
  initialPhoneNumber = "",
}: AddBlockedNumberModalProps) {
  const { toast } = useToast();
  const [tab, setTab] = React.useState<"single" | "bulk" | "file">("single");
  const [phoneNumber, setPhoneNumber] = React.useState(initialPhoneNumber);
  const [reason, setReason] = React.useState("");
  const [bulkText, setBulkText] = React.useState("");
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [dragActive, setDragActive] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (initialPhoneNumber) {
      setPhoneNumber(initialPhoneNumber);
      setTab("single");
    }
  }, [initialPhoneNumber]);

  // Single number analysis
  const normalized = normalizeGhanaPhoneNumber(phoneNumber);
  const isValidGhana = isValidGhanaPhoneNumber(normalized);
  const detectedNetwork = isValidGhana ? detectNetworkNameByPrefix(normalized) : null;

  // Bulk numbers extraction
  const parsedBulkNumbers = React.useMemo(() => {
    if (!bulkText.trim()) return [];
    const tokens = bulkText
      .split(/[\r\n,;\t\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    const validSet = new Set<string>();
    for (const token of tokens) {
      const norm = normalizeGhanaPhoneNumber(token);
      if (norm && isValidGhanaPhoneNumber(norm)) {
        validSet.add(norm);
      }
    }
    return Array.from(validSet);
  }, [bulkText]);

  const handleSubmitSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/mtn-verification/blocked-numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: phoneNumber.trim(),
          reason: reason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to block number");

      toast(
        `Phone number ${data.data?.number ?? phoneNumber} has been blocked from purchasing!`,
        "success"
      );
      setPhoneNumber("");
      setReason("");
      onSuccess();
      onClose();
    } catch (err: any) {
      toast(err.message ?? "Error blocking number", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitBulk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedBulkNumbers.length === 0) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/mtn-verification/blocked-numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numbers: parsedBulkNumbers,
          reason: reason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to block numbers");

      toast(
        `Successfully added ${data.added} number(s) to the blocked list (${data.skipped ?? 0} skipped)!`,
        "success"
      );
      setBulkText("");
      setReason("");
      onSuccess();
      onClose();
    } catch (err: any) {
      toast(err.message ?? "Error blocking numbers", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setSubmitting(true);
    try {
      const safeFilename = selectedFile.name.replace(/[^\w.-]/g, "_");
      const formData = new FormData();
      formData.append("file", selectedFile, safeFilename);
      if (reason.trim()) {
        formData.append("reason", reason.trim());
      }

      const res = await fetch("/api/admin/mtn-verification/blocked-numbers", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to import blocked numbers from file");

      toast(
        `Successfully blocked ${data.added} number(s) from ${selectedFile.name} (${data.skipped ?? 0} skipped)!`,
        "success"
      );
      setSelectedFile(null);
      setReason("");
      onSuccess();
      onClose();
    } catch (err: any) {
      toast(err.message ?? "Error importing file", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Block Phone Numbers from Buying"
      description="Numbers on this blacklist cannot purchase data bundles via storefronts, API, or dashboard."
      className="max-w-lg"
    >
      <div className="space-y-4">
        {/* Tab switch */}
        <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setTab("single")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition ${
              tab === "single"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <Hash className="h-3.5 w-3.5" />
            Single Number
          </button>
          <button
            type="button"
            onClick={() => setTab("bulk")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition ${
              tab === "bulk"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <ListPlus className="h-3.5 w-3.5" />
            Bulk Paste
          </button>
          <button
            type="button"
            onClick={() => setTab("file")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition ${
              tab === "file"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Upload File (.xlsx)
          </button>
        </div>

        {tab === "single" ? (
          <form onSubmit={handleSubmitSingle} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="blockSinglePhone">Phone Number to Block</Label>
              <Input
                id="blockSinglePhone"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="e.g. 0241234567 or +233541234567"
                className="font-mono text-sm"
                disabled={submitting}
                autoFocus
              />
              {isValidGhana && (
                <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Network:
                  </span>
                  <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-800 dark:bg-slate-700 dark:text-slate-200">
                    {detectedNetwork}
                  </span>
                  <span className="font-mono text-slate-500">({normalized})</span>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="blockSingleReason">
                Reason for Blocking <span className="text-slate-400 font-normal text-xs">(optional)</span>
              </Label>
              <Input
                id="blockSingleReason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Chargeback risk, fraud, requested by admin..."
                className="text-xs"
                disabled={submitting}
              />
            </div>

            <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3 text-xs text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200 flex items-start gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <p>
                When this number attempts to purchase on any storefront, API, or dashboard, the transaction will be immediately blocked and an error notification will pop up.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <Button variant="outline" type="button" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={submitting || !phoneNumber.trim()}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                {submitting && <Spinner className="h-4 w-4 mr-1.5" />}
                <Ban className="h-3.5 w-3.5 mr-1" />
                Block Number
              </Button>
            </div>
          </form>
        ) : tab === "bulk" ? (
          <form onSubmit={handleSubmitBulk} className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="bulkNumbers">Paste Phone Numbers</Label>
                {parsedBulkNumbers.length > 0 && (
                  <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                    {parsedBulkNumbers.length} valid number{parsedBulkNumbers.length === 1 ? "" : "s"} detected
                  </span>
                )}
              </div>
              <textarea
                id="bulkNumbers"
                rows={6}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={"0241234567\n0549876543\n0201112233\n0508889900"}
                className="w-full rounded-xl border border-slate-200 bg-white p-3 font-mono text-xs text-slate-900 shadow-sm focus:border-rose-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                disabled={submitting}
              />
              <p className="text-[11px] text-slate-500">
                Paste numbers separated by newlines, commas, or spaces. Duplicates and invalid formats will be automatically filtered.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bulkReason">
                Reason for Blocking <span className="text-slate-400 font-normal text-xs">(applied to all)</span>
              </Label>
              <Input
                id="bulkReason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Fraud cluster, security policy, system blacklist..."
                className="text-xs"
                disabled={submitting}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <Button variant="outline" type="button" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={submitting || parsedBulkNumbers.length === 0}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                {submitting && <Spinner className="h-4 w-4 mr-1.5" />}
                <Ban className="h-3.5 w-3.5 mr-1" />
                Block {parsedBulkNumbers.length > 0 ? `${parsedBulkNumbers.length} Numbers` : "Numbers"}
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmitFile} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Select Excel (.xlsx), CSV, or TXT File</Label>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition ${
                  dragActive
                    ? "border-rose-500 bg-rose-50/50 dark:bg-rose-500/10"
                    : "border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.txt"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) setSelectedFile(e.target.files[0]);
                  }}
                />
                <div className="rounded-full bg-rose-50 p-2.5 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
                  <UploadCloud className="h-5 w-5" />
                </div>
                {selectedFile ? (
                  <div className="mt-2 text-center">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {selectedFile.name}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {(selectedFile.size / 1024).toFixed(1)} KB — Click to change file
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="mt-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Drag &amp; drop an Excel (.xlsx), CSV, or TXT file here
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      Or click to browse from your computer
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fileReason">
                Reason for Blocking <span className="text-slate-400 font-normal text-xs">(applied to all numbers)</span>
              </Label>
              <Input
                id="fileReason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Excel blacklist import, fraud audit..."
                className="text-xs"
                disabled={submitting}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <Button variant="outline" type="button" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={submitting || !selectedFile}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                {submitting && <Spinner className="h-4 w-4 mr-1.5" />}
                <Ban className="h-3.5 w-3.5 mr-1" />
                Upload &amp; Block Numbers
              </Button>
            </div>
          </form>
        )}
      </div>
    </Dialog>
  );
}
