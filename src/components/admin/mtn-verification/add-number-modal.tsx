"use client";

import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Spinner } from "@/components/shared";
import { useToast } from "@/components/toast";
import { Zap } from "lucide-react";
import {
  normalizeGhanaPhoneNumber,
  isValidGhanaPhoneNumber,
  isMtnPhoneNumber,
  detectNetworkNameByPrefix,
} from "@/lib/phone-utils";

interface AddNumberModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddNumberModal({
  open,
  onClose,
  onSuccess,
}: AddNumberModalProps) {
  const { toast } = useToast();
  const [phoneNumber, setPhoneNumber] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const normalized = normalizeGhanaPhoneNumber(phoneNumber);
  const isValidGhana = isValidGhanaPhoneNumber(normalized);
  const isMtn = isMtnPhoneNumber(normalized);
  const isPorted = isValidGhana && !isMtn;
  const detectedNetwork = isPorted ? detectNetworkNameByPrefix(normalized) : "MTN";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/mtn-verification/accepted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: phoneNumber.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add number");

      const portedLabel = data.data?.isPorted ? ` (Ported ${data.data?.originalNetwork ?? detectedNetwork})` : "";
      toast(`Added ${data.data?.number ?? phoneNumber}${portedLabel} to Accepted MTN Numbers whitelist!`, "success");
      setPhoneNumber("");
      onSuccess();
      onClose();
    } catch (err: any) {
      toast(err.message ?? "Error adding number", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add Accepted MTN Number"
      description="Manually whitelist an MTN or ported number for purchasing MTN bundles."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="acceptedPhone">Phone Number</Label>
          <Input
            id="acceptedPhone"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="e.g. 0241234567 or 0201234567"
            className="font-mono text-sm"
            disabled={submitting}
          />
          {isPorted && (
            <div className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/80 px-2.5 py-1.5 text-xs text-indigo-900 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-200">
              <Zap className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span>
                <strong>Ported Number Detected ({detectedNetwork} prefix):</strong> This number will be whitelisted as a ported MTN number.
              </span>
            </div>
          )}
          <p className="text-[11px] text-slate-500">
            Accepts native MTN (024, 025, 053, 054, 055, 059) and ported numbers (Telecel / AirtelTigo).
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !phoneNumber.trim()}>
            {submitting && <Spinner className="h-4 w-4 mr-1.5" />}
            Add to Whitelist
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
