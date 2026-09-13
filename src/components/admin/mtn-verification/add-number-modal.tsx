"use client";

import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Spinner } from "@/components/shared";
import { useToast } from "@/components/toast";

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

      toast(`Added ${data.data?.number ?? phoneNumber} to Accepted MTN Numbers whitelist!`, "success");
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
      description="Manually whitelist an MTN number for purchasing MTN bundles."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="acceptedPhone">MTN Phone Number</Label>
          <Input
            id="acceptedPhone"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="e.g. 0241234567"
            className="font-mono text-sm"
            disabled={submitting}
          />
          <p className="text-[11px] text-slate-500">
            Accepts 024XXXXXXX, 233XXXXXXXXX, or +233XXXXXXXXX format.
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
